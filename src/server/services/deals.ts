import { and, asc, desc, eq, sql } from "drizzle-orm";
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
import { canTransitionDeal, dealStageValues, type DealStage } from "@/server/models/deals";
import type { ServiceContext } from "@/server/services/companies";

const { deals, dealStageHistory, diagnoses, companies } = schema;

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

  const company = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, input.companyId), eq(companies.orgId, ctx.orgId)))
    .limit(1);
  if (company.length === 0) return fail("NOT_FOUND", "Company not found");

  const id = newId();
  await db.transaction(async (tx: Tx) => {
    await tx.insert(deals).values({
      id,
      orgId: ctx.orgId,
      companyId: input.companyId,
      title: input.title,
      valuePaise: input.valuePaise,
      verticalId: input.verticalId ?? null,
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
  });
  await audit(db, ctx, "created", id);
  return getDeal(db, ctx, id);
}

export async function updateDeal(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = dealPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid deal", parsed.error.flatten());
  const patch = parsed.data;

  const existing = await findDeal(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Deal not found");

  const changes: Partial<typeof deals.$inferInsert> = { updatedAt: new Date().toISOString() };
  for (const key of Object.keys(patch) as (keyof typeof patch)[]) {
    const value = patch[key];
    if (value !== undefined) (changes as Record<string, unknown>)[key] = value;
  }

  await db.update(deals).set(changes).where(and(eq(deals.id, id), eq(deals.orgId, ctx.orgId)));
  await audit(db, ctx, "updated", id, { fields: Object.keys(patch) });
  return getDeal(db, ctx, id);
}

export async function getDeal(db: Db, ctx: ServiceContext, id: string) {
  const deal = await findDeal(db, ctx.orgId, id);
  if (!deal) return fail("NOT_FOUND", "Deal not found");

  const [company, history, entries] = await Promise.all([
    db
      .select({ id: companies.id, name: companies.name, lifecycle: companies.lifecycle })
      .from(companies)
      .where(eq(companies.id, deal.companyId))
      .limit(1),
    db.select().from(dealStageHistory).where(eq(dealStageHistory.dealId, id)).orderBy(asc(dealStageHistory.at)),
    db.select().from(diagnoses).where(eq(diagnoses.dealId, id)).orderBy(asc(diagnoses.level), asc(diagnoses.bucket)),
  ]);

  return ok({ ...deal, company: company[0] ?? null, history, diagnosis: summariseDiagnosis(entries), diagnosisEntries: entries });
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
  if (q.verticalId) conditions.push(eq(deals.verticalId, q.verticalId));
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
      verticalId: deals.verticalId,
      source: deals.source,
      temperature: deals.temperature,
      quotationStatus: deals.quotationStatus,
      nextFollowUp: deals.nextFollowUp,
      ownerId: deals.ownerId,
      updatedAt: deals.updatedAt,
    })
    .from(deals)
    .innerJoin(companies, eq(companies.id, deals.companyId))
    .where(and(...conditions))
    .orderBy(desc(deals.updatedAt))
    .limit(q.limit)
    .offset(q.offset);

  return ok(rows);
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

  const now = new Date().toISOString();
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
