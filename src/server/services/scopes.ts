import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import {
  moduleInputSchema,
  modulePatchSchema,
  scopeInputSchema,
  scopePatchSchema,
  sendScopeSchema,
} from "@/lib/schemas/scopes";
import { newId } from "@/lib/ids";
import { sellerSnapshot } from "@/server/documents/seller";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import { nextNumber } from "@/server/services/numbering";
import { type DbOrTx, loadOrgSettings, todayIst } from "@/server/services/invoices";
import type { ServiceContext } from "@/server/services/companies";

const { scopes, scopeItems, modulesLibrary, deals } = schema;

type ScopeRow = typeof scopes.$inferSelect;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type PaymentStep = { label: string; percent: number };
type ItemInput = {
  phase: string;
  moduleId?: string | null;
  title: string;
  description?: string | null;
  days: number;
  pricePaise: number;
};

/** Split a total into schedule amounts. Each step is rounded down; the last takes the remainder so the sum is exact. */
export function computeSchedule(totalPaise: number, steps: PaymentStep[]) {
  let allocated = 0;
  return steps.map((step, index) => {
    const isLast = index === steps.length - 1;
    const amountPaise = isLast ? totalPaise - allocated : Math.floor((totalPaise * step.percent) / 100);
    allocated += amountPaise;
    return { ...step, amountPaise };
  });
}

function totals(items: Pick<ItemInput, "days" | "pricePaise">[]) {
  return {
    totalPaise: items.reduce((s, i) => s + i.pricePaise, 0),
    timelineDays: items.reduce((s, i) => s + i.days, 0),
  };
}

function audit(db: Db, ctx: ServiceContext, action: string, id: string, metadata?: Record<string, unknown>) {
  return logActivity(
    { actorId: ctx.userId, action: `scope.${action}`, module: "sales", entityType: "scope", entityId: id, metadata },
    db
  );
}

async function findScope(db: DbOrTx, orgId: string, id: string): Promise<ScopeRow | undefined> {
  const rows = await db
    .select()
    .from(scopes)
    .where(and(eq(scopes.id, id), eq(scopes.orgId, orgId)))
    .limit(1);
  return rows[0];
}

async function findDeal(db: DbOrTx, orgId: string, id: string) {
  const rows = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.id, id), eq(deals.orgId, orgId)))
    .limit(1);
  return rows[0];
}

/** Checks that every referenced library module belongs to this org. */
async function modulesExist(db: DbOrTx, orgId: string, items: ItemInput[]) {
  const ids = [...new Set(items.map((i) => i.moduleId).filter((v): v is string => !!v))];
  if (ids.length === 0) return true;
  const rows = await db
    .select({ id: modulesLibrary.id })
    .from(modulesLibrary)
    .where(and(eq(modulesLibrary.orgId, orgId), inArray(modulesLibrary.id, ids)));
  return rows.length === ids.length;
}

async function insertItems(tx: DbOrTx, scopeId: string, items: ItemInput[]) {
  if (items.length === 0) return;
  await tx.insert(scopeItems).values(
    items.map((item, position) => ({
      id: newId(),
      scopeId,
      position,
      phase: item.phase,
      moduleId: item.moduleId ?? null,
      title: item.title,
      description: item.description ?? null,
      days: item.days,
      pricePaise: item.pricePaise,
    }))
  );
}

/* ---------------------------------- modules --------------------------------- */

export async function listModules(db: Db, ctx: ServiceContext, opts: { activeOnly?: boolean } = {}) {
  const conditions = [eq(modulesLibrary.orgId, ctx.orgId)];
  if (opts.activeOnly) conditions.push(eq(modulesLibrary.active, true));
  const rows = await db
    .select()
    .from(modulesLibrary)
    .where(and(...conditions))
    .orderBy(asc(modulesLibrary.category), asc(modulesLibrary.name));
  return ok(rows);
}

export async function createModule(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = moduleInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid module", parsed.error.flatten());
  const id = newId();
  await db.insert(modulesLibrary).values({
    ...parsed.data,
    description: parsed.data.description ?? null,
    defaultDeliverables: parsed.data.defaultDeliverables ?? null,
    id,
    orgId: ctx.orgId,
  });
  await logActivity(
    { actorId: ctx.userId, action: "module.created", module: "sales", entityType: "module", entityId: id },
    db
  );
  const row = await db.select().from(modulesLibrary).where(eq(modulesLibrary.id, id)).limit(1);
  return ok(row[0]);
}

export async function updateModule(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = modulePatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid module", parsed.error.flatten());
  const changes: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(parsed.data)) if (v !== undefined) changes[k] = v;

  const updated = await db
    .update(modulesLibrary)
    .set(changes)
    .where(and(eq(modulesLibrary.id, id), eq(modulesLibrary.orgId, ctx.orgId)))
    .returning();
  if (updated.length === 0) return fail("NOT_FOUND", "Module not found");
  await logActivity(
    { actorId: ctx.userId, action: "module.updated", module: "sales", entityType: "module", entityId: id },
    db
  );
  return ok(updated[0]);
}

/* ----------------------------------- scopes --------------------------------- */

export async function createScope(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = scopeInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid scope", parsed.error.flatten());
  const input = parsed.data;

  if (!(await findDeal(db, ctx.orgId, input.dealId))) return fail("NOT_FOUND", "Deal not found");
  if (!(await modulesExist(db, ctx.orgId, input.items))) return fail("NOT_FOUND", "Module not found");

  const id = newId();
  const { totalPaise, timelineDays } = totals(input.items);
  await db.transaction(async (tx: Tx) => {
    const max = await tx
      .select({ v: sql<number>`coalesce(max(${scopes.version}), 0)` })
      .from(scopes)
      .where(eq(scopes.dealId, input.dealId));
    await tx.insert(scopes).values({
      id,
      orgId: ctx.orgId,
      dealId: input.dealId,
      version: (max[0]?.v ?? 0) + 1,
      title: input.title,
      problemStatement: input.problemStatement,
      engagementModel: input.engagementModel ?? null,
      paymentScheduleJson: input.paymentSchedule,
      terms: input.terms,
      totalPaise,
      timelineDays,
      createdBy: ctx.userId,
    });
    await insertItems(tx, id, input.items);
  });
  await audit(db, ctx, "created", id);
  return getScope(db, ctx, id);
}

export async function updateScope(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = scopePatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid scope", parsed.error.flatten());
  const patch = parsed.data;

  const existing = await findScope(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Scope not found");
  if (existing.status !== "DRAFT") {
    return fail("CONFLICT", "A sent scope is frozen. Create a new version to change it.");
  }
  if (patch.items && !(await modulesExist(db, ctx.orgId, patch.items))) {
    return fail("NOT_FOUND", "Module not found");
  }

  const changed = await db.transaction(async (tx: Tx) => {
    const set: Partial<typeof scopes.$inferInsert> = { updatedAt: new Date() };
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.problemStatement !== undefined) set.problemStatement = patch.problemStatement;
    if (patch.engagementModel !== undefined) set.engagementModel = patch.engagementModel;
    if (patch.paymentSchedule !== undefined) set.paymentScheduleJson = patch.paymentSchedule;
    if (patch.terms !== undefined) set.terms = patch.terms;
    if (patch.items !== undefined) Object.assign(set, totals(patch.items));

    const res = await tx
      .update(scopes)
      .set(set)
      .where(and(eq(scopes.id, id), eq(scopes.status, "DRAFT")))
      .returning({ id: scopes.id });
    if (res.length === 0) return false;

    if (patch.items !== undefined) {
      await tx.delete(scopeItems).where(eq(scopeItems.scopeId, id));
      await insertItems(tx, id, patch.items);
    }
    return true;
  });
  if (!changed) return fail("CONFLICT", "Scope was sent while editing");

  await audit(db, ctx, "updated", id);
  return getScope(db, ctx, id);
}

export async function deleteDraftScope(db: Db, ctx: ServiceContext, id: string) {
  const existing = await findScope(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Scope not found");
  if (existing.status !== "DRAFT") return fail("CONFLICT", "Only drafts can be deleted.");

  const removed = await db.transaction(async (tx: Tx) => {
    const res = await tx
      .delete(scopes)
      .where(and(eq(scopes.id, id), eq(scopes.status, "DRAFT")))
      .returning({ id: scopes.id });
    return res.length > 0;
  });
  if (!removed) return fail("CONFLICT", "Scope was sent while deleting");
  await audit(db, ctx, "deleted", id);
  return ok({ id });
}

export async function getScope(db: Db, ctx: ServiceContext, id: string) {
  const scope = await findScope(db, ctx.orgId, id);
  if (!scope) return fail("NOT_FOUND", "Scope not found");
  const items = await db
    .select()
    .from(scopeItems)
    .where(eq(scopeItems.scopeId, id))
    .orderBy(asc(scopeItems.position));

  const { paymentScheduleJson, snapshotJson, sendKey: _sendKey, ...rest } = scope;
  void _sendKey;
  const paymentSchedule = paymentScheduleJson as PaymentStep[];
  return ok({
    ...rest,
    isFrozen: snapshotJson !== null,
    paymentSchedule: computeSchedule(scope.totalPaise, paymentSchedule),
    items,
  });
}

/** All versions for a deal, newest first. */
export async function listScopes(db: Db, ctx: ServiceContext, dealId: string) {
  const rows = await db
    .select({
      id: scopes.id,
      version: scopes.version,
      status: scopes.status,
      title: scopes.title,
      number: scopes.number,
      totalPaise: scopes.totalPaise,
      timelineDays: scopes.timelineDays,
      sentAt: scopes.sentAt,
      acceptedAt: scopes.acceptedAt,
      updatedAt: scopes.updatedAt,
    })
    .from(scopes)
    .where(and(eq(scopes.dealId, dealId), eq(scopes.orgId, ctx.orgId)))
    .orderBy(desc(scopes.version));
  return ok(rows);
}

/** Editing a sent scope: copy it into a new draft version. The old one is superseded when the new one is sent. */
export async function reviseScope(db: Db, ctx: ServiceContext, id: string) {
  const source = await findScope(db, ctx.orgId, id);
  if (!source) return fail("NOT_FOUND", "Scope not found");
  if (source.status === "DRAFT") return fail("CONFLICT", "This version is still a draft. Edit it directly.");
  if (source.status === "ACCEPTED") return fail("CONFLICT", "An accepted scope cannot be revised.");
  if (source.status === "SUPERSEDED") return fail("CONFLICT", "This version has already been superseded.");

  const items = await db.select().from(scopeItems).where(eq(scopeItems.scopeId, id)).orderBy(asc(scopeItems.position));
  const newScopeId = newId();
  const created = await db.transaction(async (tx: Tx) => {
    const draft = await tx
      .select({ id: scopes.id })
      .from(scopes)
      .where(and(eq(scopes.dealId, source.dealId), eq(scopes.status, "DRAFT")))
      .limit(1);
    if (draft.length > 0) return false;

    const max = await tx
      .select({ v: sql<number>`coalesce(max(${scopes.version}), 0)` })
      .from(scopes)
      .where(eq(scopes.dealId, source.dealId));
    await tx.insert(scopes).values({
      id: newScopeId,
      orgId: ctx.orgId,
      dealId: source.dealId,
      version: (max[0]?.v ?? 0) + 1,
      title: source.title,
      problemStatement: source.problemStatement,
      engagementModel: source.engagementModel,
      paymentScheduleJson: source.paymentScheduleJson,
      terms: source.terms,
      totalPaise: source.totalPaise,
      timelineDays: source.timelineDays,
      createdBy: ctx.userId,
    });
    await insertItems(tx, newScopeId, items);
    return true;
  });
  if (!created) return fail("CONFLICT", "This deal already has a draft scope version.");

  await audit(db, ctx, "revised", newScopeId, { from: id });
  return getScope(db, ctx, newScopeId);
}

/** Sending allocates the SC number, freezes the snapshot and supersedes older sent versions. Idempotent by key. */
export async function sendScope(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = sendScopeSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid request", parsed.error.flatten());
  const { idempotencyKey } = parsed.data;

  const existing = await findScope(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Scope not found");
  if (existing.status !== "DRAFT") {
    if (existing.sendKey === idempotencyKey) return getScope(db, ctx, id);
    return fail("CONFLICT", "Scope has already been sent");
  }

  const items = await db.select().from(scopeItems).where(eq(scopeItems.scopeId, id)).orderBy(asc(scopeItems.position));
  if (items.length === 0) return fail("VALIDATION", "Add at least one item before sending");
  const steps = existing.paymentScheduleJson as PaymentStep[];
  if (steps.length === 0) return fail("VALIDATION", "Add a payment schedule before sending");
  if (existing.totalPaise <= 0) return fail("VALIDATION", "The scope total must be above zero");

  const org = await loadOrgSettings(db, ctx.orgId);
  if (!org) return fail("VALIDATION", "Fill in organisation settings before sending");

  const now = new Date();
  const sent = await db.transaction(async (tx: Tx) => {
    const claimed = await tx
      .update(scopes)
      .set({ status: "SENT", sendKey: idempotencyKey, updatedAt: now })
      .where(and(eq(scopes.id, id), eq(scopes.status, "DRAFT")))
      .returning({ id: scopes.id });
    if (claimed.length === 0) return false;

    const allocated = await nextNumber(tx, {
      orgId: ctx.orgId,
      docType: "SCOPE",
      date: new Date(`${todayIst(now)}T12:00:00+05:30`),
      fyStartMonth: org.fyStartMonth,
    });

    const snapshot = {
      type: "SCOPE",
      number: allocated.number,
      version: existing.version,
      sentOn: todayIst(now),
      seller: sellerSnapshot(org),
      title: existing.title,
      problemStatement: existing.problemStatement,
      engagementModel: existing.engagementModel,
      terms: existing.terms,
      totalPaise: existing.totalPaise,
      timelineDays: existing.timelineDays,
      paymentSchedule: computeSchedule(existing.totalPaise, steps),
      items: items.map((i) => ({
        phase: i.phase,
        title: i.title,
        description: i.description,
        days: i.days,
        pricePaise: i.pricePaise,
      })),
    };

    await tx
      .update(scopes)
      .set({ number: allocated.number, fy: allocated.fy, sentAt: now, snapshotJson: snapshot })
      .where(eq(scopes.id, id));

    await tx
      .update(scopes)
      .set({ status: "SUPERSEDED", updatedAt: now })
      .where(and(eq(scopes.dealId, existing.dealId), eq(scopes.status, "SENT"), sql`${scopes.id} <> ${id}`));
    return true;
  });

  if (!sent) {
    const current = await findScope(db, ctx.orgId, id);
    if (current?.sendKey === idempotencyKey) return getScope(db, ctx, id);
    return fail("CONFLICT", "Scope has already been sent");
  }

  await audit(db, ctx, "sent", id);
  return getScope(db, ctx, id);
}
