import { and, desc, eq, ilike, or } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { docInputSchema, docListQuerySchema, docPatchSchema } from "@/lib/schemas/docs";
import { newId } from "@/lib/ids";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";

const { docs, companies, deals } = schema;

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


type Links = { companyId?: string | null; dealId?: string | null };

/**
 * Check the client and lead a doc points at belong to this org. A doc linked to a lead is also
 * linked to that lead's client; naming a different client at the same time is a mistake.
 */
async function resolveLinks(db: Db, ctx: ServiceContext, links: Links) {
  let companyId = links.companyId ?? null;
  const dealId = links.dealId ?? null;
  if (dealId) {
    const [deal] = await db
      .select({ companyId: deals.companyId })
      .from(deals)
      .where(and(eq(deals.id, dealId), eq(deals.orgId, ctx.orgId)))
      .limit(1);
    if (!deal) return fail("VALIDATION", "Lead not found");
    if (companyId && companyId !== deal.companyId) {
      return fail("VALIDATION", "That lead belongs to a different client");
    }
    companyId = deal.companyId;
  } else if (companyId) {
    const [company] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, companyId), eq(companies.orgId, ctx.orgId)))
      .limit(1);
    if (!company) return fail("VALIDATION", "Client not found");
  }
  return ok({ companyId, dealId });
}

export async function listDocs(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = docListQuerySchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid query", parsed.error.flatten());
  const { type, status, companyId, dealId, q, limit, offset } = parsed.data;

  const conditions = [eq(docs.orgId, ctx.orgId)];
  if (type) conditions.push(eq(docs.type, type));
  if (status) conditions.push(eq(docs.status, status));
  if (companyId) conditions.push(eq(docs.companyId, companyId));
  if (dealId) conditions.push(eq(docs.dealId, dealId));
  if (q) conditions.push(or(ilike(docs.title, likePattern(q)), ilike(docs.body, likePattern(q)))!);

  const rows = await db
    .select({
      id: docs.id,
      type: docs.type,
      status: docs.status,
      title: docs.title,
      updatedAt: docs.updatedAt,
      companyId: docs.companyId,
      companyName: companies.name,
      dealId: docs.dealId,
      dealTitle: deals.title,
    })
    .from(docs)
    .leftJoin(companies, eq(companies.id, docs.companyId))
    .leftJoin(deals, eq(deals.id, docs.dealId))
    .where(and(...conditions))
    .orderBy(desc(docs.updatedAt))
    .limit(limit)
    .offset(offset);
  return ok(rows);
}

export async function getDoc(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .select({
      id: docs.id,
      type: docs.type,
      status: docs.status,
      title: docs.title,
      body: docs.body,
      createdBy: docs.createdBy,
      createdAt: docs.createdAt,
      updatedAt: docs.updatedAt,
      companyId: docs.companyId,
      companyName: companies.name,
      dealId: docs.dealId,
      dealTitle: deals.title,
    })
    .from(docs)
    .leftJoin(companies, eq(companies.id, docs.companyId))
    .leftJoin(deals, eq(deals.id, docs.dealId))
    .where(and(eq(docs.id, id), eq(docs.orgId, ctx.orgId)))
    .limit(1);
  if (!rows[0]) return fail("NOT_FOUND", "Doc not found");
  return ok(rows[0]);
}

export async function createDoc(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = docInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid doc", parsed.error.flatten());
  const links = await resolveLinks(db, ctx, parsed.data);
  if (!links.ok) return links;
  const id = newId();
  await db
    .insert(docs)
    .values({ id, orgId: ctx.orgId, ...parsed.data, ...links.data, createdBy: ctx.userId });
  await audit(db, ctx, "created", id);
  return getDoc(db, ctx, id);
}

export async function updateDoc(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = docPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid doc", parsed.error.flatten());
  const patch = { ...parsed.data };
  const touchesLinks = "companyId" in patch || "dealId" in patch;
  if (touchesLinks) {
    // Fill in whichever link the patch leaves out from the stored doc, so the pair stays consistent.
    const [existing] = await db
      .select({ companyId: docs.companyId, dealId: docs.dealId })
      .from(docs)
      .where(and(eq(docs.id, id), eq(docs.orgId, ctx.orgId)))
      .limit(1);
    if (!existing) return fail("NOT_FOUND", "Doc not found");
    // Unlinking the lead keeps the client unless the patch says otherwise.
    const links = await resolveLinks(db, ctx, {
      companyId: "companyId" in patch ? patch.companyId : existing.companyId,
      dealId: "dealId" in patch ? patch.dealId : existing.dealId,
    });
    if (!links.ok) return links;
    Object.assign(patch, links.data);
  }
  const updated = await db
    .update(docs)
    .set({ ...patch, updatedAt: new Date() })
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
