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

function audit(db: Db, ctx: ServiceContext, action: string, entityType: string, id: string) {
  return logActivity(
    { actorId: ctx.userId, action: `marketing.${action}`, module: "marketing", entityType, entityId: id },
    db
  );
}

/** A vertical or account id from the client must belong to the caller's org. */
async function checkRefs(db: Db, ctx: ServiceContext, refs: { verticalId?: string | null; accountId?: string | null }) {
  if (refs.verticalId) {
    const v = await db
      .select({ id: verticals.id })
      .from(verticals)
      .where(and(eq(verticals.id, refs.verticalId), eq(verticals.orgId, ctx.orgId)))
      .limit(1);
    if (!v[0]) return fail("VALIDATION", "Unknown vertical");
  }
  if (refs.accountId) {
    const a = await db
      .select({ id: socialAccounts.id })
      .from(socialAccounts)
      .where(and(eq(socialAccounts.id, refs.accountId), eq(socialAccounts.orgId, ctx.orgId)))
      .limit(1);
    if (!a[0]) return fail("VALIDATION", "Unknown account");
  }
  return null;
}

function isUniqueViolation(e: unknown) {
  const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
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
  const bad = await checkRefs(db, ctx, parsed.data);
  if (bad) return bad;
  const id = newId();
  try {
    await db.insert(socialAccounts).values({ id, orgId: ctx.orgId, ...parsed.data });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("CONFLICT", "That handle already exists on this platform");
    throw e;
  }
  await audit(db, ctx, "account_created", "social_account", id);
  return getAccount(db, ctx, id);
}

export async function updateAccount(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = accountPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid account", parsed.error.flatten());
  const existing = await getAccount(db, ctx, id);
  if (!existing.ok) return existing;
  const bad = await checkRefs(db, ctx, parsed.data);
  if (bad) return bad;
  try {
    await db
      .update(socialAccounts)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(socialAccounts.id, id), eq(socialAccounts.orgId, ctx.orgId)));
  } catch (e) {
    if (isUniqueViolation(e)) return fail("CONFLICT", "That handle already exists on this platform");
    throw e;
  }
  await audit(db, ctx, "account_updated", "social_account", id);
  return getAccount(db, ctx, id);
}

export async function deleteAccount(db: Db, ctx: ServiceContext, id: string) {
  const removed = await db
    .delete(socialAccounts)
    .where(and(eq(socialAccounts.id, id), eq(socialAccounts.orgId, ctx.orgId)))
    .returning({ id: socialAccounts.id });
  if (removed.length === 0) return fail("NOT_FOUND", "Account not found");
  await audit(db, ctx, "account_deleted", "social_account", id);
  return ok({ id });
}

// ---- content ----

export async function listContent(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = contentListQuerySchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid query", parsed.error.flatten());
  const { month, status, platform } = parsed.data;
  const conditions = [eq(contentItems.orgId, ctx.orgId)];
  if (month) conditions.push(like(contentItems.publishDate, `${month}-%`));
  if (status) conditions.push(eq(contentItems.status, status));
  if (platform) conditions.push(eq(contentItems.platform, platform));
  const rows = await db
    .select()
    .from(contentItems)
    .where(and(...conditions))
    .orderBy(asc(contentItems.publishDate), asc(contentItems.createdAt));
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
  const bad = await checkRefs(db, ctx, parsed.data);
  if (bad) return bad;
  const id = newId();
  await db.insert(contentItems).values({ id, orgId: ctx.orgId, ...parsed.data, createdBy: ctx.userId });
  await audit(db, ctx, "content_created", "content_item", id);
  return getContent(db, ctx, id);
}

export async function updateContent(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = contentPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid content item", parsed.error.flatten());
  const existing = await getContent(db, ctx, id);
  if (!existing.ok) return existing;
  const bad = await checkRefs(db, ctx, parsed.data);
  if (bad) return bad;
  await db
    .update(contentItems)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(contentItems.id, id), eq(contentItems.orgId, ctx.orgId)));
  await audit(db, ctx, "content_updated", "content_item", id);
  return getContent(db, ctx, id);
}

export async function deleteContent(db: Db, ctx: ServiceContext, id: string) {
  const removed = await db
    .delete(contentItems)
    .where(and(eq(contentItems.id, id), eq(contentItems.orgId, ctx.orgId)))
    .returning({ id: contentItems.id });
  if (removed.length === 0) return fail("NOT_FOUND", "Content item not found");
  await audit(db, ctx, "content_deleted", "content_item", id);
  return ok({ id });
}
