import { and, desc, eq, ilike, or } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { docInputSchema, docListQuerySchema, docPatchSchema } from "@/lib/schemas/docs";
import { newId } from "@/lib/ids";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";

const { docs } = schema;

function audit(db: Db, ctx: ServiceContext, action: string, id: string) {
  return logActivity(
    { actorId: ctx.userId, action: `doc.${action}`, module: "docs", entityType: "doc", entityId: id },
    db
  );
}

/** Escape LIKE wildcards so user search text is matched literally. */
function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function listDocs(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = docListQuerySchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid query", parsed.error.flatten());
  const { type, q, limit, offset } = parsed.data;

  const conditions = [eq(docs.orgId, ctx.orgId)];
  if (type) conditions.push(eq(docs.type, type));
  if (q) conditions.push(or(ilike(docs.title, likePattern(q)), ilike(docs.body, likePattern(q)))!);

  const rows = await db
    .select({ id: docs.id, type: docs.type, title: docs.title, updatedAt: docs.updatedAt })
    .from(docs)
    .where(and(...conditions))
    .orderBy(desc(docs.updatedAt))
    .limit(limit)
    .offset(offset);
  return ok(rows);
}

export async function getDoc(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .select()
    .from(docs)
    .where(and(eq(docs.id, id), eq(docs.orgId, ctx.orgId)))
    .limit(1);
  if (!rows[0]) return fail("NOT_FOUND", "Doc not found");
  return ok(rows[0]);
}

export async function createDoc(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = docInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid doc", parsed.error.flatten());
  const id = newId();
  await db.insert(docs).values({ id, orgId: ctx.orgId, ...parsed.data, createdBy: ctx.userId });
  await audit(db, ctx, "created", id);
  return getDoc(db, ctx, id);
}

export async function updateDoc(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = docPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid doc", parsed.error.flatten());
  const updated = await db
    .update(docs)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(docs.id, id), eq(docs.orgId, ctx.orgId)))
    .returning({ id: docs.id });
  if (updated.length === 0) return fail("NOT_FOUND", "Doc not found");
  await audit(db, ctx, "updated", id);
  return getDoc(db, ctx, id);
}

export async function deleteDoc(db: Db, ctx: ServiceContext, id: string) {
  const removed = await db
    .delete(docs)
    .where(and(eq(docs.id, id), eq(docs.orgId, ctx.orgId)))
    .returning({ id: docs.id });
  if (removed.length === 0) return fail("NOT_FOUND", "Doc not found");
  await audit(db, ctx, "deleted", id);
  return ok({ id });
}
