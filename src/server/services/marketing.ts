import { and, asc, eq, like } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import {
  accountInputSchema,
  accountPatchSchema,
  contentInputSchema,
  contentListQuerySchema,
  contentPatchSchema,
} from "@/lib/schemas/marketing";
import { newId } from "@/lib/ids";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";

const { socialAccounts, contentItems, verticals } = schema;

function audit(db: Db, ctx: ServiceContext, entity: "account" | "content", action: string, id: string) {
  return logActivity(
    { actorId: ctx.userId, action: `marketing.${entity}.${action}`, module: "marketing", entityType: entity, entityId: id },
    db
  );
}

async function checkVertical(db: Db, ctx: ServiceContext, verticalId: string | null | undefined) {
  if (!verticalId) return true;
  const rows = await db
    .select({ id: verticals.id })
    .from(verticals)
    .where(and(eq(verticals.id, verticalId), eq(verticals.orgId, ctx.orgId)))
    .limit(1);
  return rows.length > 0;
}

async function checkAccount(db: Db, ctx: ServiceContext, accountId: string | null | undefined) {
  if (!accountId) return true;
  const rows = await db
    .select({ id: socialAccounts.id })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.orgId, ctx.orgId)))
    .limit(1);
  return rows.length > 0;
}

export async function listAccounts(db: Db, ctx: ServiceContext) {
  return ok(
    await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.orgId, ctx.orgId))
      .orderBy(asc(socialAccounts.platform), asc(socialAccounts.handle))
  );
}

export async function getAccount(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(and(eq(socialAccounts.id, id), eq(socialAccounts.orgId, ctx.orgId)))
    .limit(1);
  if (!rows[0]) return fail("NOT_FOUND", "Account not found");
  return ok(rows[0]);
}

export async function createAccount(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = accountInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid account", parsed.error.flatten());
  if (!(await checkVertical(db, ctx, parsed.data.verticalId))) return fail("VALIDATION", "Unknown vertical");
  const id = newId();
  await db.insert(socialAccounts).values({ id, orgId: ctx.orgId, ...parsed.data });
  await audit(db, ctx, "account", "created", id);
  return getAccount(db, ctx, id);
}

export async function updateAccount(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = accountPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid account", parsed.error.flatten());
  const existing = await getAccount(db, ctx, id);
  if (!existing.ok) return existing;
  if (!(await checkVertical(db, ctx, parsed.data.verticalId))) return fail("VALIDATION", "Unknown vertical");
  await db
    .update(socialAccounts)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(socialAccounts.id, id), eq(socialAccounts.orgId, ctx.orgId)));
  await audit(db, ctx, "account", "updated", id);
  return getAccount(db, ctx, id);
}

export async function deleteAccount(db: Db, ctx: ServiceContext, id: string) {
  const existing = await getAccount(db, ctx, id);
  if (!existing.ok) return existing;
  const used = await db
    .select({ id: contentItems.id })
    .from(contentItems)
    .where(and(eq(contentItems.accountId, id), eq(contentItems.orgId, ctx.orgId)))
    .limit(1);
  if (used.length > 0) return fail("CONFLICT", "Account still has content; reassign or delete it first");
  await db.delete(socialAccounts).where(and(eq(socialAccounts.id, id), eq(socialAccounts.orgId, ctx.orgId)));
  await audit(db, ctx, "account", "deleted", id);
  return ok({ id });
}

export async function listContent(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = contentListQuerySchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid query", parsed.error.flatten());
  const { month, status, accountId } = parsed.data;
  const conditions = [eq(contentItems.orgId, ctx.orgId)];
  if (month) conditions.push(like(contentItems.publishDate, `${month}-%`));
  if (status) conditions.push(eq(contentItems.status, status));
  if (accountId) conditions.push(eq(contentItems.accountId, accountId));
  return ok(
    await db
      .select()
      .from(contentItems)
      .where(and(...conditions))
      .orderBy(asc(contentItems.publishDate), asc(contentItems.createdAt))
  );
}

export async function getContent(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.id, id), eq(contentItems.orgId, ctx.orgId)))
    .limit(1);
  if (!rows[0]) return fail("NOT_FOUND", "Content not found");
  return ok(rows[0]);
}

export async function createContent(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = contentInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid content", parsed.error.flatten());
  if (!(await checkAccount(db, ctx, parsed.data.accountId))) return fail("VALIDATION", "Unknown account");
  const id = newId();
  await db.insert(contentItems).values({ id, orgId: ctx.orgId, ...parsed.data, createdBy: ctx.userId });
  await audit(db, ctx, "content", "created", id);
  return getContent(db, ctx, id);
}

export async function updateContent(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = contentPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid content", parsed.error.flatten());
  const existing = await getContent(db, ctx, id);
  if (!existing.ok) return existing;
  if (!(await checkAccount(db, ctx, parsed.data.accountId))) return fail("VALIDATION", "Unknown account");
  await db
    .update(contentItems)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(contentItems.id, id), eq(contentItems.orgId, ctx.orgId)));
  await audit(db, ctx, "content", "updated", id);
  return getContent(db, ctx, id);
}

export async function deleteContent(db: Db, ctx: ServiceContext, id: string) {
  const removed = await db
    .delete(contentItems)
    .where(and(eq(contentItems.id, id), eq(contentItems.orgId, ctx.orgId)))
    .returning({ id: contentItems.id });
  if (removed.length === 0) return fail("NOT_FOUND", "Content not found");
  await audit(db, ctx, "content", "deleted", id);
  return ok({ id });
}
