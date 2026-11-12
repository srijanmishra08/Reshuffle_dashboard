import { and, desc, eq, isNull, like, or, sql } from "drizzle-orm";
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

export type ServiceContext = { orgId: string; userId: string };

const { companies, verticals, interactions } = schema;

/** Earliest pending next-action date for a company. */
const nextActionAt = sql<string | null>`(
  select min(${interactions.nextActionAt}) from ${interactions}
  where ${interactions.companyId} = ${companies.id}
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
  verticalId: companies.verticalId,
  verticalName: verticals.name,
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

export async function listCompanies(db: Db, ctx: ServiceContext, rawQuery: unknown = {}) {
  const parsed = companyListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid filters", parsed.error.flatten());
  }

  const query: CompanyListQuery = parsed.data;
  const conditions = [eq(companies.orgId, ctx.orgId), isNull(companies.archivedAt)];

  if (query.lifecycle) conditions.push(eq(companies.lifecycle, query.lifecycle));
  if (query.verticalId) conditions.push(eq(companies.verticalId, query.verticalId));
  if (query.ownerId) conditions.push(eq(companies.ownerId, query.ownerId));

  if (query.q) {
    const pattern = `%${query.q.replace(/[%_]/g, "")}%`;
    conditions.push(
      or(
        like(companies.name, pattern),
        like(companies.legalName, pattern),
        like(companies.gstin, pattern)
      )!
    );
  }

  const rows = await db
    .select(companyColumns)
    .from(companies)
    .leftJoin(verticals, eq(verticals.id, companies.verticalId))
    .where(and(...conditions))
    .orderBy(desc(companies.updatedAt))
    .limit(query.limit)
    .offset(query.offset);

  return ok(rows);
}

export async function getCompany(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .select(companyColumns)
    .from(companies)
    .leftJoin(verticals, eq(verticals.id, companies.verticalId))
    .where(and(eq(companies.id, id), eq(companies.orgId, ctx.orgId), isNull(companies.archivedAt)))
    .limit(1);

  return rows[0] ? ok(rows[0]) : fail("NOT_FOUND", "Company not found");
}

async function verticalExists(db: Db, ctx: ServiceContext, verticalId: string) {
  const rows = await db
    .select({ id: verticals.id })
    .from(verticals)
    .where(and(eq(verticals.id, verticalId), eq(verticals.orgId, ctx.orgId)))
    .limit(1);
  return rows.length > 0;
}

export async function createCompany(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = companyInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid company", parsed.error.flatten());
  }

  const input = parsed.data;

  if (input.verticalId && !(await verticalExists(db, ctx, input.verticalId))) {
    return fail("VALIDATION", "Unknown vertical");
  }

  const now = new Date().toISOString();
  const inserted = await db
    .insert(companies)
    .values({
      orgId: ctx.orgId,
      name: input.name,
      legalName: input.legalName ?? null,
      gstin: input.gstin ?? null,
      stateCode: input.stateCode ?? null,
      address: input.address ?? null,
      verticalId: input.verticalId ?? null,
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

  const id = inserted[0].id;

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

  const patch = parsed.data;

  if (patch.verticalId && !(await verticalExists(db, ctx, patch.verticalId))) {
    return fail("VALIDATION", "Unknown vertical");
  }

  const changes = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined)
  ) as Record<string, unknown>;

  if (Object.keys(changes).length === 0) {
    return existing;
  }

  await db
    .update(companies)
    .set({ ...changes, updatedAt: new Date().toISOString() })
    .where(and(eq(companies.id, id), eq(companies.orgId, ctx.orgId)));

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
        : { fields: Object.keys(changes) },
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

  const now = new Date().toISOString();
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

export async function listVerticals(db: Db, ctx: ServiceContext) {
  const rows = await db
    .select({ id: verticals.id, name: verticals.name, description: verticals.description })
    .from(verticals)
    .where(eq(verticals.orgId, ctx.orgId))
    .orderBy(verticals.name);

  return ok(rows);
}
