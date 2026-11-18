import { and, asc, desc, eq, ilike, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import {
  companyInputSchema,
  companyListQuerySchema,
  companyPatchSchema,
  type CompanyListQuery,
} from "@/lib/schemas/crm";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import { resolveModules, setCompanyModules } from "@/server/services/module-links";

export type ServiceContext = { orgId: string; userId: string };

const { companies, interactions, deals, companyModules, modulesLibrary } = schema;

/**
 * Earliest pending next-action date for a company.
 * `"companies"."id"` is written out on purpose: when a query selects from one table only, drizzle renders a column
 * reference inside raw SQL without its table name, and inside this subquery a bare "id" would be interactions.id.
 */
const nextActionAt = sql<string | null>`(
  select min(${interactions.nextActionAt}) from ${interactions}
  where ${interactions.companyId} = "companies"."id"
    and ${interactions.nextActionAt} is not null
    and ${interactions.nextActionDoneAt} is null
)`;

const companyColumns = {
  id: companies.id,
  name: companies.name,
  legalName: companies.legalName,
  gstin: companies.gstin,
  stateCode: companies.stateCode,
  address: companies.address,
  website: companies.website,
  lifecycle: companies.lifecycle,
  ownerId: companies.ownerId,
  source: companies.source,
  referrer: companies.referrer,
  notes: companies.notes,
  createdAt: companies.createdAt,
  updatedAt: companies.updatedAt,
  nextActionAt,
};

export type CompanyModule = { id: string; name: string };

/** The modules (SKUs) each client is in, as set on the client page or added with its leads. */
async function modulesByCompany(db: Db, orgId: string, companyIds: string[]): Promise<Map<string, CompanyModule[]>> {
  const byCompany = new Map<string, CompanyModule[]>();
  if (companyIds.length === 0) return byCompany;
  const rows = await db
    .select({ companyId: companyModules.companyId, id: modulesLibrary.id, name: modulesLibrary.name })
    .from(companyModules)
    .innerJoin(modulesLibrary, eq(modulesLibrary.id, companyModules.moduleId))
    .where(and(eq(companyModules.orgId, orgId), inArray(companyModules.companyId, companyIds)))
    .orderBy(asc(modulesLibrary.name));
  for (const r of rows) {
    const list = byCompany.get(r.companyId) ?? [];
    list.push({ id: r.id, name: r.name });
    byCompany.set(r.companyId, list);
  }
  return byCompany;
}

export async function listCompanies(db: Db, ctx: ServiceContext, rawQuery: unknown = {}) {
  const parsed = companyListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid filters", parsed.error.flatten());
  }

  const query: CompanyListQuery = parsed.data;
  const conditions = [eq(companies.orgId, ctx.orgId), isNull(companies.archivedAt)];

  if (query.lifecycle) conditions.push(eq(companies.lifecycle, query.lifecycle));
  if (query.ownerId) conditions.push(eq(companies.ownerId, query.ownerId));
  if (query.moduleId) {
    conditions.push(sql`exists (
      select 1 from ${companyModules} cm
      where cm.company_id = "companies"."id" and cm.module_id = ${query.moduleId}
    )`);
  }

  if (query.q) {
    const pattern = `%${query.q.replace(/[%_]/g, "")}%`;
    conditions.push(
      or(
        ilike(companies.name, pattern),
        ilike(companies.legalName, pattern),
        ilike(companies.gstin, pattern)
      )!
    );
  }

  const rows = await db
    .select(companyColumns)
    .from(companies)
    .where(and(...conditions))
    .orderBy(desc(companies.updatedAt))
    .limit(query.limit)
    .offset(query.offset);

  const modules = await modulesByCompany(db, ctx.orgId, rows.map((r) => r.id));
  return ok(rows.map((r) => ({ ...r, modules: modules.get(r.id) ?? [] })));
}

export async function getCompany(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .select(companyColumns)
    .from(companies)
    .where(and(eq(companies.id, id), eq(companies.orgId, ctx.orgId), isNull(companies.archivedAt)))
    .limit(1);

  if (!rows[0]) return fail("NOT_FOUND", "Company not found");
  const modules = await modulesByCompany(db, ctx.orgId, [id]);
  return ok({ ...rows[0], modules: modules.get(id) ?? [] });
}

export async function createCompany(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = companyInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid company", parsed.error.flatten());
  }

  const { moduleIds: requestedModules, ...input } = parsed.data;
  const resolved = await resolveModules(db, ctx.orgId, requestedModules);
  if (!resolved) return fail("VALIDATION", "Unknown module");

  const now = new Date();
  const id = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(companies)
      .values({
          orgId: ctx.orgId,
          name: input.name,
          legalName: input.legalName ?? null,
          gstin: input.gstin ?? null,
          stateCode: input.stateCode ?? null,
          address: input.address ?? null,
          website: input.website ?? null,
          lifecycle: input.lifecycle ?? "PROSPECT",
          ownerId: input.ownerId ?? ctx.userId,
          source: input.source ?? null,
          referrer: input.referrer ?? null,
          notes: input.notes ?? null,
          createdBy: ctx.userId,
          createdAt: now,
          updatedAt: now,
      })
      .returning({ id: companies.id });
    await setCompanyModules(tx, ctx.orgId, inserted[0].id, resolved.ids);
    return inserted[0].id;
  });

  await logActivity(
    { actorId: ctx.userId, action: "company.created", module: "crm", entityType: "company", entityId: id, metadata: { name: input.name } },
    db
  );

  return getCompany(db, ctx, id);
}

export async function updateCompany(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = companyPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid company update", parsed.error.flatten());
  }

  const existing = await getCompany(db, ctx, id);
  if (!existing.ok) {
    return existing;
  }

  const { moduleIds: requestedModules, ...patch } = parsed.data;
  const resolved = requestedModules === undefined ? undefined : await resolveModules(db, ctx.orgId, requestedModules);
  if (resolved === null) return fail("VALIDATION", "Unknown module");

  const changes = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as Record<string, unknown>;

  if (Object.keys(changes).length === 0 && !resolved) {
    return existing;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(companies)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(companies.id, id), eq(companies.orgId, ctx.orgId)));
    if (resolved) await setCompanyModules(tx, ctx.orgId, id, resolved.ids);
  });

  const lifecycleChanged = patch.lifecycle && patch.lifecycle !== existing.data.lifecycle;

  await logActivity(
    {
      actorId: ctx.userId,
      action: lifecycleChanged ? "company.lifecycle_changed" : "company.updated",
      module: "crm",
      entityType: "company",
      entityId: id,
      metadata: lifecycleChanged
        ? { from: existing.data.lifecycle, to: patch.lifecycle }
        : { fields: [...Object.keys(changes), ...(resolved ? ["modules"] : [])] },
    },
    db
  );

  return getCompany(db, ctx, id);
}

export async function archiveCompany(db: Db, ctx: ServiceContext, id: string) {
  const existing = await getCompany(db, ctx, id);
  if (!existing.ok) {
    return existing;
  }

  // An archived client would still sit on the sales board through its open deals, so close those first.
  const open = await db
    .select({ n: sql<number>`count(*)` })
    .from(deals)
    .where(and(eq(deals.companyId, id), eq(deals.orgId, ctx.orgId), notInArray(deals.stage, ["WON", "LOST"])));
  if (Number(open[0]?.n ?? 0) > 0) {
    return fail("CONFLICT", "This client has open deals. Move them to Accepted or Lost on the Sales board first.");
  }

  const now = new Date();
  await db
    .update(companies)
    .set({ archivedAt: now, updatedAt: now })
    .where(and(eq(companies.id, id), eq(companies.orgId, ctx.orgId)));

  await logActivity(
    { actorId: ctx.userId, action: "company.archived", module: "crm", entityType: "company", entityId: id },
    db
  );

  return ok({ id });
}
