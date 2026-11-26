import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { commissionPaymentInputSchema, salesNodeInputSchema, salesNodePatchSchema } from "@/lib/schemas/sales-nodes";
import { fail, ok } from "@/server/lib/result";
import { formatINR } from "@/server/lib/money";
import { logActivity } from "@/server/services/activity";
import { salesNodeKindLabels, openDealStages, type SalesNodeKind } from "@/server/models/deals";
import type { ServiceContext } from "@/server/services/companies";
import { todayIst } from "@/server/services/invoices";

const { salesNodes, deals, companies, commissionPayments, ledgerEntries } = schema;

/** Commission on one deal value at a rate in basis points, rounded to the nearest paisa. */
export function commissionOn(valuePaise: number, bps: number): number {
  return Math.round((valuePaise * bps) / 10_000);
}

export type SalesNodeOptions = {
  /** Commission rates and amounts. Admins and managers only. */
  includeMoney: boolean;
};

/** Lead and revenue counts per sales node, so you can see who brings work and what a referral is worth. */
export async function listSalesNodes(db: Db, ctx: ServiceContext, opts: SalesNodeOptions, filter: { activeOnly?: boolean } = {}) {
  const conditions = [eq(salesNodes.orgId, ctx.orgId)];
  if (filter.activeOnly) conditions.push(eq(salesNodes.active, true));

  const [nodes, stats, paid] = await Promise.all([
    db.select().from(salesNodes).where(and(...conditions)).orderBy(asc(salesNodes.name)),
    db
      .select({
        nodeId: deals.salesNodeId,
        leads: sql<number>`count(*)`,
        open: sql<number>`count(*) filter (where ${deals.stage} in (${sql.join(openDealStages.map((s) => sql`${s}`), sql`, `)}))`,
        accepted: sql<number>`count(*) filter (where ${deals.stage} = 'WON')`,
        lost: sql<number>`count(*) filter (where ${deals.stage} = 'LOST')`,
        acceptedPaise: sql<number>`coalesce(sum(${deals.valuePaise}) filter (where ${deals.stage} = 'WON'), 0)`,
      })
      .from(deals)
      .where(eq(deals.orgId, ctx.orgId))
      .groupBy(deals.salesNodeId),
    opts.includeMoney
      ? db
          .select({ nodeId: commissionPayments.salesNodeId, paid: sql<number>`coalesce(sum(${commissionPayments.amountPaise}), 0)` })
          .from(commissionPayments)
          .where(eq(commissionPayments.orgId, ctx.orgId))
          .groupBy(commissionPayments.salesNodeId)
      : Promise.resolve([] as { nodeId: string; paid: number }[]),
  ]);

  const paidByNode = new Map(paid.map((r) => [r.nodeId, Number(r.paid)]));
  const byNode = new Map(stats.filter((r) => r.nodeId).map((r) => [r.nodeId as string, r]));
  return ok(
    nodes.map((n) => {
      const st = byNode.get(n.id);
      const acceptedPaise = Number(st?.acceptedPaise ?? 0);
      const commissionDuePaise = commissionOn(acceptedPaise, n.commissionBps);
      const commissionPaidPaise = paidByNode.get(n.id) ?? 0;
      return {
        id: n.id,
        name: n.name,
        kind: n.kind as SalesNodeKind,
        kindLabel: salesNodeKindLabels[n.kind as SalesNodeKind] ?? n.kind,
        phone: n.phone,
        email: n.email,
        notes: n.notes,
        userId: n.userId,
        freelancerId: n.freelancerId,
        agencyId: n.agencyId,
        active: n.active,
        leads: Number(st?.leads ?? 0),
        open: Number(st?.open ?? 0),
        accepted: Number(st?.accepted ?? 0),
        lost: Number(st?.lost ?? 0),
        ...(opts.includeMoney
          ? {
              commissionPercent: n.commissionBps / 100,
              acceptedPaise,
              commissionDuePaise,
              commissionPaidPaise,
              commissionOwedPaise: Math.max(0, commissionDuePaise - commissionPaidPaise),
            }
          : {}),
      };
    })
  );
}

export async function createSalesNode(db: Db, ctx: ServiceContext, opts: SalesNodeOptions, raw: unknown) {
  const parsed = salesNodeInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid sales node", parsed.error.flatten());
  const input = parsed.data;
  if (input.commissionPercent !== undefined && !opts.includeMoney) return fail("FORBIDDEN", "Only admins and managers can set a commission");

  const existing = await db
    .select({ id: salesNodes.id })
    .from(salesNodes)
    .where(and(eq(salesNodes.orgId, ctx.orgId), sql`lower(${salesNodes.name}) = lower(${input.name})`))
    .limit(1);
  if (existing[0]) return fail("CONFLICT", "A sales node with this name already exists");

  const inserted = await db
    .insert(salesNodes)
    .values({
      orgId: ctx.orgId,
      name: input.name,
      kind: input.kind,
      phone: input.phone ?? null,
      email: input.email ?? null,
      commissionBps: Math.round((input.commissionPercent ?? 0) * 100),
      notes: input.notes ?? null,
      userId: input.userId ?? null,
      freelancerId: input.freelancerId ?? null,
      agencyId: input.agencyId ?? null,
      active: input.active ?? true,
    })
    .returning({ id: salesNodes.id });
  const id = inserted[0].id;
  await logActivity({ actorId: ctx.userId, action: "sales_node.created", module: "sales", entityType: "sales_node", entityId: id, metadata: { name: input.name } }, db);

  const all = await listSalesNodes(db, ctx, opts);
  return all.ok ? ok(all.data.find((n) => n.id === id)!) : all;
}

export async function updateSalesNode(db: Db, ctx: ServiceContext, opts: SalesNodeOptions, id: string, raw: unknown) {
  const parsed = salesNodePatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid sales node", parsed.error.flatten());
  const patch = parsed.data;
  if (patch.commissionPercent !== undefined && !opts.includeMoney) return fail("FORBIDDEN", "Only admins and managers can set a commission");

  const found = await db.select().from(salesNodes).where(and(eq(salesNodes.id, id), eq(salesNodes.orgId, ctx.orgId))).limit(1);
  if (!found[0]) return fail("NOT_FOUND", "Sales node not found");

  if (patch.name && patch.name.toLowerCase() !== found[0].name.toLowerCase()) {
    const clash = await db
      .select({ id: salesNodes.id })
      .from(salesNodes)
      .where(and(eq(salesNodes.orgId, ctx.orgId), sql`lower(${salesNodes.name}) = lower(${patch.name})`))
      .limit(1);
    if (clash[0]) return fail("CONFLICT", "A sales node with this name already exists");
  }

  const { commissionPercent, ...rest } = patch;
  const changes: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  if (commissionPercent !== undefined) changes.commissionBps = Math.round(commissionPercent * 100);
  if (Object.keys(changes).length > 0) {
    await db.update(salesNodes).set({ ...changes, updatedAt: new Date() }).where(and(eq(salesNodes.id, id), eq(salesNodes.orgId, ctx.orgId)));
    await logActivity({ actorId: ctx.userId, action: "sales_node.updated", module: "sales", entityType: "sales_node", entityId: id, metadata: { fields: Object.keys(changes) } }, db);
  }

  const all = await listSalesNodes(db, ctx, opts);
  return all.ok ? ok(all.data.find((n) => n.id === id)!) : all;
}

/** A node's kind and name as the text kept on a lead (`source` and `referrer`), or null if it is not one of this organisation's. */
export async function salesNodeLabels(db: Db, orgId: string, salesNodeId: string) {
  const rows = await db
    .select({ name: salesNodes.name, kind: salesNodes.kind })
    .from(salesNodes)
    .where(and(eq(salesNodes.id, salesNodeId), eq(salesNodes.orgId, orgId)))
    .limit(1);
  const n = rows[0];
  return n ? { source: salesNodeKindLabels[n.kind as SalesNodeKind] ?? n.kind, referrer: n.name } : null;
}

/* ------------------------------ referral commission ------------------------------ */

/**
 * One node's accepted deals with the commission due, paid and still owed on each, and every payment made to it.
 * Admins and managers only (the route checks the role).
 */
export async function listNodeCommissions(db: Db, ctx: ServiceContext, nodeId: string) {
  const found = await db.select().from(salesNodes).where(and(eq(salesNodes.id, nodeId), eq(salesNodes.orgId, ctx.orgId))).limit(1);
  const node = found[0];
  if (!node) return fail("NOT_FOUND", "Sales node not found");

  const [accepted, payments] = await Promise.all([
    db
      .select({ id: deals.id, title: deals.title, companyName: companies.name, valuePaise: deals.valuePaise, closedAt: deals.closedAt })
      .from(deals)
      .innerJoin(companies, eq(companies.id, deals.companyId))
      .where(and(eq(deals.orgId, ctx.orgId), eq(deals.salesNodeId, nodeId), eq(deals.stage, "WON")))
      .orderBy(desc(deals.closedAt), asc(deals.title)),
    db
      .select({
        id: commissionPayments.id,
        dealId: commissionPayments.dealId,
        dealTitle: deals.title,
        amountPaise: commissionPayments.amountPaise,
        paidOn: commissionPayments.paidOn,
        note: commissionPayments.note,
        createdAt: commissionPayments.createdAt,
      })
      .from(commissionPayments)
      .innerJoin(deals, eq(deals.id, commissionPayments.dealId))
      .where(and(eq(commissionPayments.orgId, ctx.orgId), eq(commissionPayments.salesNodeId, nodeId)))
      .orderBy(desc(commissionPayments.paidOn), desc(commissionPayments.createdAt)),
  ]);

  const paidByDeal = new Map<string, number>();
  for (const p of payments) paidByDeal.set(p.dealId, (paidByDeal.get(p.dealId) ?? 0) + p.amountPaise);

  const dealRows = accepted.map((d) => {
    const duePaise = commissionOn(d.valuePaise ?? 0, node.commissionBps);
    const paidPaise = paidByDeal.get(d.id) ?? 0;
    return { id: d.id, title: d.title, companyName: d.companyName, valuePaise: d.valuePaise ?? 0, duePaise, paidPaise, owedPaise: Math.max(0, duePaise - paidPaise) };
  });

  return ok({
    node: { id: node.id, name: node.name, commissionPercent: node.commissionBps / 100 },
    deals: dealRows,
    payments,
    totals: {
      duePaise: dealRows.reduce((t, d) => t + d.duePaise, 0),
      paidPaise: payments.reduce((t, p) => t + p.amountPaise, 0),
      owedPaise: dealRows.reduce((t, d) => t + d.owedPaise, 0),
    },
  });
}

/**
 * Records a commission paid to a node for one of its accepted deals and books the EXPENSE ledger entry in the
 * same transaction. Refuses a deal that is not the node's or not accepted, a node with no commission rate, and
 * a payment that would take the deal past the commission due on it (fix the rate first if the agreement changed).
 */
export async function recordCommissionPayment(db: Db, ctx: ServiceContext, nodeId: string, raw: unknown) {
  const parsed = commissionPaymentInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid commission payment", parsed.error.flatten());
  const input = parsed.data;
  const paidOn = input.paidOn ?? todayIst();

  const found = await db.select().from(salesNodes).where(and(eq(salesNodes.id, nodeId), eq(salesNodes.orgId, ctx.orgId))).limit(1);
  const node = found[0];
  if (!node) return fail("NOT_FOUND", "Sales node not found");
  if (node.commissionBps <= 0) return fail("CONFLICT", "No commission rate is set for this sales node. Set the rate first.");

  type Outcome = { ok: true; id: string } | { ok: false; code: "NOT_FOUND" | "CONFLICT"; error: string };
  const outcome: Outcome = await db.transaction(async (tx) => {
    // Lock the deal so two payments recorded at once cannot both pass the "not more than due" check.
    const dealRows = await tx
      .select({ id: deals.id, title: deals.title, stage: deals.stage, valuePaise: deals.valuePaise, salesNodeId: deals.salesNodeId, companyId: deals.companyId })
      .from(deals)
      .where(and(eq(deals.id, input.dealId), eq(deals.orgId, ctx.orgId)))
      .for("update")
      .limit(1);
    const deal = dealRows[0];
    if (!deal || deal.salesNodeId !== nodeId) return { ok: false, code: "NOT_FOUND", error: "That deal was not brought by this sales node" };
    if (deal.stage !== "WON") return { ok: false, code: "CONFLICT", error: "Commission is paid only on accepted deals" };

    const due = commissionOn(deal.valuePaise ?? 0, node.commissionBps);
    const already = await tx
      .select({ paid: sql<number>`coalesce(sum(${commissionPayments.amountPaise}), 0)` })
      .from(commissionPayments)
      .where(and(eq(commissionPayments.orgId, ctx.orgId), eq(commissionPayments.dealId, deal.id)));
    const paidSoFar = Number(already[0]?.paid ?? 0);
    if (paidSoFar + input.amountPaise > due) {
      return { ok: false, code: "CONFLICT", error: `That is more than the commission still owed on this deal (${formatINR(Math.max(0, due - paidSoFar))})` };
    }

    const inserted = await tx
      .insert(commissionPayments)
      .values({ orgId: ctx.orgId, salesNodeId: nodeId, dealId: deal.id, amountPaise: input.amountPaise, paidOn, note: input.note ?? null, createdBy: ctx.userId })
      .returning({ id: commissionPayments.id });
    const id = inserted[0].id;
    await tx.insert(ledgerEntries).values({
      orgId: ctx.orgId,
      kind: "EXPENSE",
      entryDate: paidOn,
      amountPaise: input.amountPaise,
      description: `Referral commission: ${node.name} (${deal.title})`,
      companyId: deal.companyId,
      sourceType: "COMMISSION",
      sourceId: id,
      createdBy: ctx.userId,
    });
    return { ok: true, id };
  });

  if (!outcome.ok) return fail(outcome.code, outcome.error);
  await logActivity(
    { actorId: ctx.userId, action: "commission.paid", module: "sales", entityType: "commission_payment", entityId: outcome.id, metadata: { salesNodeId: nodeId, dealId: input.dealId, amountPaise: input.amountPaise } },
    db
  );
  const view = await listNodeCommissions(db, ctx, nodeId);
  return view.ok ? ok({ id: outcome.id, ...view.data }) : view;
}

/** Removes a commission payment recorded by mistake, with its ledger entry, in one transaction. Admins only (the route checks). */
export async function deleteCommissionPayment(db: Db, ctx: ServiceContext, id: string) {
  const removed = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(commissionPayments)
      .where(and(eq(commissionPayments.id, id), eq(commissionPayments.orgId, ctx.orgId)))
      .returning();
    const row = rows[0];
    if (!row) return null;
    await tx.delete(ledgerEntries).where(and(eq(ledgerEntries.orgId, ctx.orgId), eq(ledgerEntries.sourceType, "COMMISSION"), eq(ledgerEntries.sourceId, id)));
    return row;
  });
  if (!removed) return fail("NOT_FOUND", "Commission payment not found");
  await logActivity(
    { actorId: ctx.userId, action: "commission.deleted", module: "sales", entityType: "commission_payment", entityId: id, metadata: { salesNodeId: removed.salesNodeId, dealId: removed.dealId, amountPaise: removed.amountPaise } },
    db
  );
  return ok({ id, deleted: true });
}
