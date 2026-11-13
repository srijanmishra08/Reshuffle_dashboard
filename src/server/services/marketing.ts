import { and, asc, eq, gte, lte } from "drizzle-orm";
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

const { socialAccounts, contentItems } = schema;

function audit(db: Db, ctx: ServiceContext, entity: "account" | "content", action: string, id: string) {
  return logActivity(
    {
      actorId: ctx.userId,
      action: `marketing.${entity}.${action}`,
      module: "marketing",
      entityType: entity === "account" ? "social_account" : "content_item",
      entityId: id,
    },
    db
  );
}

// ---- accounts ----

export async function listAccounts(db: Db, ctx: ServiceContext) {
  const rows = await db
    .select()
    .from(socialAccounts)
    .where(eq(socialAccounts.orgId, ctx.orgId))
    .orderBy(asc(socialAccounts.platform), asc(socialAccounts.handle));
  return ok(rows);
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
  const id = newId();
  await db.insert(socialAccounts).values({ id, orgId: ctx.orgId, ...parsed.data, createdBy: ctx.userId });
  await audit(db, ctx, "account", "created", id);
  return getAccount(db, ctx, id);
}

export async function updateAccount(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = accountPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid account", parsed.error.flatten());
  const existing = await getAccount(db, ctx, id);
  if (!existing.ok) return existing;
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
  await db.transaction(async (tx) => {
    // Keep the content; just detach it from the removed account.
    await tx
      .update(contentItems)
      .set({ accountId: null, updatedAt: new Date() })
      .where(and(eq(contentItems.accountId, id), eq(contentItems.orgId, ctx.orgId)));
    await tx
      .delete(socialAccounts)
      .where(and(eq(socialAccounts.id, id), eq(socialAccounts.orgId, ctx.orgId)));
    await audit(tx as unknown as Db, ctx, "account", "deleted", id);
  });
  return ok({ id });
}

// ---- content ----

async function accountBelongsToOrg(db: Db, ctx: ServiceContext, accountId: string) {
  return (await getAccount(db, ctx, accountId)).ok;
}

export async function listContent(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = contentListQuerySchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid query", parsed.error.flatten());
  const { from, to, status, platform } = parsed.data;
  const conditions = [eq(contentItems.orgId, ctx.orgId)];
  if (from) conditions.push(gte(contentItems.scheduledDate, from));
  if (to) conditions.push(lte(contentItems.scheduledDate, to));
  if (status) conditions.push(eq(contentItems.status, status));
  if (platform) conditions.push(eq(contentItems.platform, platform));
  const rows = await db
    .select()
    .from(contentItems)
    .where(and(...conditions))
    .orderBy(asc(contentItems.scheduledDate), asc(contentItems.createdAt));
  return ok(rows);
}

export async function getContent(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.id, id), eq(contentItems.orgId, ctx.orgId)))
    .limit(1);
  if (!rows[0]) return fail("NOT_FOUND", "Content item not found");
  return ok(rows[0]);
}

export async function createContent(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = contentInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid content item", parsed.error.flatten());
  if (parsed.data.accountId && !(await accountBelongsToOrg(db, ctx, parsed.data.accountId))) {
    return fail("VALIDATION", "Unknown account");
  }
  if (parsed.data.status === "SCHEDULED" && !parsed.data.scheduledDate) {
    return fail("VALIDATION", "A scheduled item needs a date");
  }
  const id = newId();
  await db.insert(contentItems).values({ id, orgId: ctx.orgId, ...parsed.data, createdBy: ctx.userId });
  await audit(db, ctx, "content", "created", id);
  return getContent(db, ctx, id);
}

export async function updateContent(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = contentPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid content item", parsed.error.flatten());
  const existing = await getContent(db, ctx, id);
  if (!existing.ok) return existing;
  if (parsed.data.accountId && !(await accountBelongsToOrg(db, ctx, parsed.data.accountId))) {
    return fail("VALIDATION", "Unknown account");
  }
  const status = parsed.data.status ?? existing.data.status;
  const date = parsed.data.scheduledDate === undefined ? existing.data.scheduledDate : parsed.data.scheduledDate;
  if (status === "SCHEDULED" && !date) return fail("VALIDATION", "A scheduled item needs a date");

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
  if (removed.length === 0) return fail("NOT_FOUND", "Content item not found");
  await audit(db, ctx, "content", "deleted", id);
  return ok({ id });
}
