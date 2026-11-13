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

function audit(db: Db, ctx: ServiceContext, entityType: string, action: string, id: string) {
  return logActivity(
    { actorId: ctx.userId, action: `${entityType}.${action}`, module: "marketing", entityType, entityId: id },
    db
  );
}

async function verticalExists(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .select({ id: verticals.id })
    .from(verticals)
    .where(and(eq(verticals.id, id), eq(verticals.orgId, ctx.orgId)))
    .limit(1);
  return rows.length > 0;
}

async function accountExists(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .select({ id: socialAccounts.id })
    .from(socialAccounts)
    .where(and(eq(socialAccounts.id, id), eq(socialAccounts.orgId, ctx.orgId)))
    .limit(1);
  return rows.length > 0;
}

// ---- accounts

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
  if (parsed.data.verticalId && !(await verticalExists(db, ctx, parsed.data.verticalId))) {
    return fail("VALIDATION", "Unknown vertical");
  }
  const id = newId();
  await db.insert(socialAccounts).values({ id, orgId: ctx.orgId, ...parsed.data });
  await audit(db, ctx, "social_account", "created", id);
  return getAccount(db, ctx, id);
}

export async function updateAccount(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = accountPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid account", parsed.error.flatten());
  const existing = await getAccount(db, ctx, id);
  if (!existing.ok) return existing;
  if (parsed.data.verticalId && !(await verticalExists(db, ctx, parsed.data.verticalId))) {
    return fail("VALIDATION", "Unknown vertical");
  }
  await db
    .update(socialAccounts)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(socialAccounts.id, id), eq(socialAccounts.orgId, ctx.orgId)));
  await audit(db, ctx, "social_account", "updated", id);
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
  if (used.length > 0) {
    return fail("CONFLICT", "Account has content; mark it inactive instead");
  }
  await db.delete(socialAccounts).where(and(eq(socialAccounts.id, id), eq(socialAccounts.orgId, ctx.orgId)));
  await audit(db, ctx, "social_account", "deleted", id);
  return ok({ id });
}

// ---- content

export async function listContent(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = contentListQuerySchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid query", parsed.error.flatten());
  const { month, status, accountId } = parsed.data;
  const conditions = [eq(contentItems.orgId, ctx.orgId)];
  if (month) conditions.push(like(contentItems.scheduledDate, `${month}-%`));
  if (status) conditions.push(eq(contentItems.status, status));
  if (accountId) conditions.push(eq(contentItems.accountId, accountId));
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
  if (parsed.data.accountId && !(await accountExists(db, ctx, parsed.data.accountId))) {
    return fail("VALIDATION", "Unknown account");
  }
  if (parsed.data.status === "SCHEDULED" && !parsed.data.scheduledDate) {
    return fail("VALIDATION", "A scheduled item needs a date");
  }
  const id = newId();
  await db.insert(contentItems).values({ id, orgId: ctx.orgId, ...parsed.data, createdBy: ctx.userId });
  await audit(db, ctx, "content_item", "created", id);
  return getContent(db, ctx, id);
}

export async function updateContent(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = contentPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid content item", parsed.error.flatten());
  const existing = await getContent(db, ctx, id);
  if (!existing.ok) return existing;
  if (parsed.data.accountId && !(await accountExists(db, ctx, parsed.data.accountId))) {
    return fail("VALIDATION", "Unknown account");
  }
  const status = parsed.data.status ?? existing.data.status;
  const date = parsed.data.scheduledDate === undefined ? existing.data.scheduledDate : parsed.data.scheduledDate;
  if (status === "SCHEDULED" && !date) {
    return fail("VALIDATION", "A scheduled item needs a date");
  }
  await db
    .update(contentItems)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(contentItems.id, id), eq(contentItems.orgId, ctx.orgId)));
  await audit(db, ctx, "content_item", "updated", id);
  return getContent(db, ctx, id);
}

export async function deleteContent(db: Db, ctx: ServiceContext, id: string) {
  const removed = await db
    .delete(contentItems)
    .where(and(eq(contentItems.id, id), eq(contentItems.orgId, ctx.orgId)))
    .returning({ id: contentItems.id });
  if (removed.length === 0) return fail("NOT_FOUND", "Content item not found");
  await audit(db, ctx, "content_item", "deleted", id);
  return ok({ id });
}
