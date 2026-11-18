import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import {
  dealInputSchema,
  dealListQuerySchema,
  dealPatchSchema,
  dealTransitionSchema,
  diagnosisSaveSchema,
} from "@/lib/schemas/deals";
import { newId } from "@/lib/ids";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import { addCompanyModules, resolveModules } from "@/server/services/module-links";
import { isStaffMember } from "@/server/services/staff";
import { canTransitionDeal, dealStageValues, type DealStage } from "@/server/models/deals";
import type { ServiceContext } from "@/server/services/companies";

const { deals, dealStageHistory, diagnoses, companies, dealModules, modulesLibrary, user } = schema;

type DealRow = typeof deals.$inferSelect;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function findDeal(db: Db | Tx, orgId: string, id: string): Promise<DealRow | undefined> {
  const rows = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.orgId, orgId)))
    .limit(1);
  return rows[0];
}

function audit(db: Db, ctx: ServiceContext, action: string, id: string, metadata?: Record<string, unknown>) {
  return logActivity(
    { actorId: ctx.userId, action: `deal.${action}`, module: "sales", entityType: "deal", entityId: id, metadata },
    db
  );
}

export async function createDeal(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = dealInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid deal", parsed.error.flatten());
  const input = parsed.data;

  if (input.ownerId && !(await isStaffMember(db, ctx.orgId, input.ownerId))) return fail("VALIDATION", "Unknown owner");
  const resolved = await resolveModules(db, ctx.orgId, input.moduleIds);
  if (!resolved) return fail("VALIDATION", "Unknown module");
  const moduleIds = resolved.ids;
  // No value sent: take it from the chosen modules' library prices.
  const valueSent = typeof raw === "object" && raw !== null && "valuePaise" in raw;
  const valuePaise = valueSent ? input.valuePaise : resolved.pricePaise;

  const id = newId();
  let companyId = input.companyId ?? "";
  let newCompanyId: string | null = null;

  if (input.companyId) {
    const company = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, input.companyId), eq(companies.orgId, ctx.orgId)))
      .limit(1);
    if (company.length === 0) return fail("NOT_FOUND", "Company not found");
  } else {
    // New lead: reuse a company with the same name (ignoring case), otherwise create it as a PROSPECT.
    const name = input.companyName!;
    const match = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.orgId, ctx.orgId), isNull(companies.archivedAt), sql`lower(${companies.name}) = lower(${name})`))
      .limit(1);
    if (match[0]) companyId = match[0].id;
    else newCompanyId = companyId = newId();
  }

  await db.transaction(async (tx: Tx) => {
    if (newCompanyId) {
      await tx.insert(companies).values({
        id: newCompanyId,
        orgId: ctx.orgId,
        name: input.companyName!,
        lifecycle: "PROSPECT",
        ownerId: input.ownerId ?? ctx.userId,
        source: input.source ?? null,
        referrer: input.referrer ?? null,
        createdBy: ctx.userId,
      });
    }
    await tx.insert(deals).values({
      id,
      orgId: ctx.orgId,
      companyId,
      title: input.title,
      valuePaise,
      engagementModel: input.engagementModel ?? null,
      source: input.source ?? null,
      referrer: input.referrer ?? null,
      quotationStatus: input.quotationStatus,
      currentBlock: input.currentBlock ?? null,
      temperature: input.temperature ?? null,
      expectedClose: input.expectedClose ?? null,
      nextFollowUp: input.nextFollowUp ?? null,
      ownerId: input.ownerId ?? ctx.userId,
    });
    await tx.insert(dealStageHistory).values({
      orgId: ctx.orgId,
      dealId: id,
      fromStage: null,
      toStage: "LEAD",
      changedBy: ctx.userId,
    });
    if (moduleIds.length > 0) {
      await tx.insert(dealModules).values(moduleIds.map((moduleId) => ({ orgId: ctx.orgId, dealId: id, moduleId })));
      await addCompanyModules(tx, ctx.orgId, companyId, moduleIds);
    }
  });
  if (newCompanyId) {
    await logActivity(
      { actorId: ctx.userId, action: "company.created", module: "crm", entityType: "company", entityId: newCompanyId, metadata: { name: input.companyName, via: "sales" } },
      db
    );
  }
  await audit(db, ctx, "created", id);
  return getDeal(db, ctx, id);
}

export async function updateDeal(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = dealPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid deal", parsed.error.flatten());
  const patch = parsed.data;

  const existing = await findDeal(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Deal not found");

  if (patch.ownerId && !(await isStaffMember(db, ctx.orgId, patch.ownerId))) return fail("VALIDATION", "Unknown owner");
  const { moduleIds: requestedModules, ...dealPatch } = patch;
  const resolvedModules = requestedModules === undefined ? undefined : await resolveModules(db, ctx.orgId, requestedModules);
  if (resolvedModules === null) return fail("VALIDATION", "Unknown module");
  const moduleIds = resolvedModules?.ids;

  const changes: Partial<typeof deals.$inferInsert> = { updatedAt: new Date() };
  for (const key of Object.keys(dealPatch) as (keyof typeof dealPatch)[]) {
    const value = dealPatch[key];
    if (value !== undefined) (changes as Record<string, unknown>)[key] = value;
  }

  await db.transaction(async (tx: Tx) => {
    await tx.update(deals).set(changes).where(and(eq(deals.id, id), eq(deals.orgId, ctx.orgId)));
    if (moduleIds) {
      await tx.delete(dealModules).where(and(eq(dealModules.dealId, id), eq(dealModules.orgId, ctx.orgId)));
      if (moduleIds.length > 0) {
        await tx.insert(dealModules).values(moduleIds.map((moduleId) => ({ orgId: ctx.orgId, dealId: id, moduleId })));
        await addCompanyModules(tx, ctx.orgId, existing.companyId, moduleIds);
      }
    }
  });
  await audit(db, ctx, "updated", id, { fields: Object.keys(patch) });
  return getDeal(db, ctx, id);
}

export async function getDeal(db: Db, ctx: ServiceContext, id: string) {
  const deal = await findDeal(db, ctx.orgId, id);
  if (!deal) return fail("NOT_FOUND", "Deal not found");

  const [company, history, entries, modules] = await Promise.all([
    db
      .select({ id: companies.id, name: companies.name, lifecycle: companies.lifecycle })
      .from(companies)
      .where(eq(companies.id, deal.companyId))
      .limit(1),
    db.select().from(dealStageHistory).where(eq(dealStageHistory.dealId, id)).orderBy(asc(dealStageHistory.at)),
    db.select().from(diagnoses).where(eq(diagnoses.dealId, id)).orderBy(asc(diagnoses.level), asc(diagnoses.bucket)),
    db
      .select({ id: modulesLibrary.id, name: modulesLibrary.name })
      .from(dealModules)
      .innerJoin(modulesLibrary, eq(modulesLibrary.id, dealModules.moduleId))
      .where(eq(dealModules.dealId, id))
      .orderBy(asc(modulesLibrary.name)),
  ]);

  const owner = deal.ownerId ? await db.select({ name: user.name }).from(user).where(eq(user.id, deal.ownerId)).limit(1) : [];

  return ok({ ...deal, ownerName: owner[0]?.name ?? null, company: company[0] ?? null, modules, history, diagnosis: summariseDiagnosis(entries), diagnosisEntries: entries });
}

export function summariseDiagnosis(entries: { bucket: string; painScore: number }[]) {
  const totals = new Map<string, { total: number; count: number }>();
  for (const e of entries) {
    const cur = totals.get(e.bucket) ?? { total: 0, count: 0 };
    cur.total += e.painScore;
    cur.count += 1;
    totals.set(e.bucket, cur);
  }
  return [...totals.entries()]
    .map(([bucket, v]) => ({ bucket, totalPain: v.total, answered: v.count }))
    .sort((a, b) => b.totalPain - a.totalPain);
}

export async function listDeals(db: Db, ctx: ServiceContext, rawQuery: unknown = {}) {
  const parsed = dealListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return fail("VALIDATION", "Invalid filters", parsed.error.flatten());
  const q = parsed.data;

  const conditions = [eq(deals.orgId, ctx.orgId)];
  if (q.stage) conditions.push(eq(deals.stage, q.stage));
  if (q.source) conditions.push(eq(deals.source, q.source));
  if (q.ownerId) conditions.push(eq(deals.ownerId, q.ownerId));
  if (q.temperature) conditions.push(eq(deals.temperature, q.temperature));
  if (q.companyId) conditions.push(eq(deals.companyId, q.companyId));

  const rows = await db
    .select({
      id: deals.id,
      title: deals.title,
      stage: deals.stage,
      valuePaise: deals.valuePaise,
      companyId: deals.companyId,
      companyName: companies.name,
      source: deals.source,
      referrer: deals.referrer,
      temperature: deals.temperature,
      quotationStatus: deals.quotationStatus,
      nextFollowUp: deals.nextFollowUp,
      ownerId: deals.ownerId,
      ownerName: user.name,
      updatedAt: deals.updatedAt,
    })
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .leftJoin(user, eq(user.id, deals.ownerId))
    .where(and(...conditions))
    .orderBy(desc(deals.updatedAt))
    .limit(q.limit)
    .offset(q.offset);

  const attached =
    rows.length === 0
      ? []
      : await db
          .select({ dealId: dealModules.dealId, id: modulesLibrary.id, name: modulesLibrary.name })
          .from(dealModules)
          .innerJoin(modulesLibrary, eq(modulesLibrary.id, dealModules.moduleId))
          .where(inArray(dealModules.dealId, rows.map((r) => r.id)))
          .orderBy(asc(modulesLibrary.name));
  return ok(rows.map((r) => ({ ...r, modules: attached.filter((m) => m.dealId === r.id).map(({ id, name }) => ({ id, name })) })));
}

/** Count and total value per stage, over the same rows the board shows. */
export async function pipelineSummary(db: Db, ctx: ServiceContext) {
  const rows = await db
    .select({
      stage: deals.stage,
      count: sql<number>`count(*)`,
      valuePaise: sql<number>`coalesce(sum(${deals.valuePaise}), 0)`,
    })
    .from(deals)
    .where(eq(deals.orgId, ctx.orgId))
    .groupBy(deals.stage);

  const byStage = new Map(rows.map((r) => [r.stage, r]));
  return ok(
    dealStageValues.map((stage) => ({
      stage,
      count: Number(byStage.get(stage)?.count ?? 0),
      valuePaise: Number(byStage.get(stage)?.valuePaise ?? 0),
    }))
  );
}

export async function transitionDeal(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = dealTransitionSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid transition", parsed.error.flatten());
  const { to, lostReason, note } = parsed.data;

  const existing = await findDeal(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Deal not found");

  const from = existing.stage as DealStage;
  if (!canTransitionDeal(from, to)) {
    return fail("CONFLICT", `Cannot move a deal from ${from} to ${to}`);
  }
  if (to === "LOST" && !lostReason) {
    return fail("VALIDATION", "A lost reason is required");
  }

  const now = new Date();
  const moved = await db.transaction(async (tx: Tx) => {
    // Compare-and-set on the current stage so two concurrent moves cannot both apply.
    const claimed = await tx
      .update(deals)
      .set({
        stage: to,
        lostReason: to === "LOST" ? lostReason! : null,
        closedAt: to === "WON" || to === "LOST" ? now : null,
        updatedAt: now,
      })
      .where(and(eq(deals.id, id), eq(deals.orgId, ctx.orgId), eq(deals.stage, from)))
      .returning({ id: deals.id });
    if (claimed.length === 0) return false;

    await tx.insert(dealStageHistory).values({
      orgId: ctx.orgId,
      dealId: id,
      fromStage: from,
      toStage: to,
      note: note ?? (to === "LOST" ? lostReason : null) ?? null,
      changedBy: ctx.userId,
      at: now,
    });

    if (to === "WON") {
      // A won deal moves its company into onboarding (only from PROSPECT).
      await tx
        .update(companies)
        .set({ lifecycle: "ONBOARDING", updatedAt: now })
        .where(and(eq(companies.id, existing.companyId), eq(companies.lifecycle, "PROSPECT")));
    }
    return true;
  });
  if (!moved) return fail("CONFLICT", "Deal was moved by someone else; reload and retry");

  await audit(db, ctx, "transitioned", id, { from, to, lostReason });
  return getDeal(db, ctx, id);
}

/** Replace the diagnosis answers for a deal. A DIAGNOSED deal keeps its stage; moving stage is an explicit action. */
export async function saveDiagnosis(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = diagnosisSaveSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid diagnosis", parsed.error.flatten());

  const existing = await findDeal(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Deal not found");

  await db.transaction(async (tx: Tx) => {
    await tx.delete(diagnoses).where(and(eq(diagnoses.dealId, id), eq(diagnoses.orgId, ctx.orgId)));
    if (parsed.data.entries.length > 0) {
      await tx
        .insert(diagnoses)
        .values(parsed.data.entries.map((e) => ({ ...e, orgId: ctx.orgId, dealId: id })));
    }
  });
  await audit(db, ctx, "diagnosis_saved", id, { entries: parsed.data.entries.length });
  return getDeal(db, ctx, id);
}
