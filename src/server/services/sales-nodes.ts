import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { commissionPaymentInputSchema, salesNodeInputSchema, salesNodePatchSchema } from "@/lib/schemas/sales-nodes";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import { salesNodeKindLabels, openDealStages, type SalesNodeKind } from "@/server/models/deals";
import type { ServiceContext } from "@/server/services/companies";
import { todayIst } from "@/server/services/invoices";

const { salesNodes, deals, commissionPayments, ledgerEntries } = schema;

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
          .select({ nodeId: commissionPayments.salesNodeId, paidPaise: sql<number>`coalesce(sum(${commissionPayments.amountPaise}), 0)` })
          .from(commissionPayments)
          .where(eq(commissionPayments.orgId, ctx.orgId))
          .groupBy(commissionPayments.salesNodeId)
      : Promise.resolve([] as { nodeId: string; paidPaise: number }[]),
  ]);

  const paidByNode = new Map(paid.map((r) => [r.nodeId, Number(r.paidPaise)]));
  const byNode = new Map(stats.filter((r) => r.nodeId).map((r) => [r.nodeId as string, r]));
  return ok(
    nodes.map((n) => {
      const st = byNode.get(n.id);
      const acceptedPaise = Number(st?.acceptedPaise ?? 0);
      const commissionDuePaise = Math.round((acceptedPaise * n.commissionBps) / 10_000);
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
              /** Due minus paid. Negative when more has been paid than the accepted deals earn (an advance). */
              commissionOwedPaise: commissionDuePaise - commissionPaidPaise,
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

/** Payments made to one sales node, newest first. Admins and managers only (the route checks). */
export async function listCommissionPayments(db: Db, ctx: ServiceContext, salesNodeId: string) {
  const node = await db
    .select({ id: salesNodes.id })
    .from(salesNodes)
    .where(and(eq(salesNodes.id, salesNodeId), eq(salesNodes.orgId, ctx.orgId)))
    .limit(1);
  if (!node[0]) return fail("NOT_FOUND", "Sales node not found");
  const rows = await db
    .select({
      id: commissionPayments.id,
      salesNodeId: commissionPayments.salesNodeId,
      dealId: commissionPayments.dealId,
      dealTitle: deals.title,
      amountPaise: commissionPayments.amountPaise,
      paidOn: commissionPayments.paidOn,
      reference: commissionPayments.reference,
      notes: commissionPayments.notes,
      createdAt: commissionPayments.createdAt,
    })
    .from(commissionPayments)
    .leftJoin(deals, eq(deals.id, commissionPayments.dealId))
    .where(and(eq(commissionPayments.salesNodeId, salesNodeId), eq(commissionPayments.orgId, ctx.orgId)))
    .orderBy(desc(commissionPayments.paidOn), desc(commissionPayments.createdAt));
  return ok(rows);
}

/**
 * Records a commission payment and its EXPENSE ledger entry in one transaction.
 * A linked deal must belong to this node and be accepted (WON). Paying more than is owed is allowed
 * (an advance); the node then shows a negative balance.
 */
export async function recordCommissionPayment(db: Db, ctx: ServiceContext, salesNodeId: string, raw: unknown) {
  const parsed = commissionPaymentInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid commission payment", parsed.error.flatten());
  const input = parsed.data;
  const paidOn = input.paidOn ?? todayIst();

  const found = await db
    .select({ id: salesNodes.id, name: salesNodes.name })
    .from(salesNodes)
    .where(and(eq(salesNodes.id, salesNodeId), eq(salesNodes.orgId, ctx.orgId)))
    .limit(1);
  const node = found[0];
  if (!node) return fail("NOT_FOUND", "Sales node not found");

  let deal: { id: string; title: string; companyId: string } | null = null;
  if (input.dealId) {
    const rows = await db
      .select({ id: deals.id, title: deals.title, companyId: deals.companyId, stage: deals.stage, salesNodeId: deals.salesNodeId })
      .from(deals)
      .where(and(eq(deals.id, input.dealId), eq(deals.orgId, ctx.orgId)))
      .limit(1);
    const d = rows[0];
    if (!d) return fail("NOT_FOUND", "Lead not found");
    if (d.salesNodeId !== salesNodeId) return fail("VALIDATION", "That lead was not brought by this sales node");
    if (d.stage !== "WON") return fail("CONFLICT", "Commission is paid only on accepted deals");
    deal = { id: d.id, title: d.title, companyId: d.companyId };
  }

  const payment = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(commissionPayments)
      .values({
        orgId: ctx.orgId,
        salesNodeId,
        dealId: deal?.id ?? null,
        amountPaise: input.amountPaise,
        paidOn,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        createdBy: ctx.userId,
      })
      .returning();
    const row = inserted[0];
    await tx.insert(ledgerEntries).values({
      orgId: ctx.orgId,
      kind: "EXPENSE",
      entryDate: paidOn,
      amountPaise: input.amountPaise,
      description: `Referral commission: ${node.name}${deal ? ` (${deal.title})` : ""}`,
      companyId: deal?.companyId ?? null,
      sourceType: "COMMISSION",
      sourceId: row.id,
      createdBy: ctx.userId,
    });
    return row;
  });

  await logActivity(
    { actorId: ctx.userId, action: "commission.paid", module: "sales", entityType: "sales_node", entityId: salesNodeId, metadata: { paymentId: payment.id, amountPaise: input.amountPaise, dealId: deal?.id ?? null } },
    db
  );
  return ok({ ...payment, dealTitle: deal?.title ?? null });
}

/** Removes a payment recorded by mistake, with its ledger entry, in one transaction. Admins only (the route checks). */
export async function deleteCommissionPayment(db: Db, ctx: ServiceContext, id: string) {
  const removed = await db.transaction(async (tx) => {
    const rows = await tx
      .delete(commissionPayments)
      .where(and(eq(commissionPayments.id, id), eq(commissionPayments.orgId, ctx.orgId)))
      .returning();
    if (!rows[0]) return null;
    await tx
      .delete(ledgerEntries)
      .where(and(eq(ledgerEntries.orgId, ctx.orgId), eq(ledgerEntries.sourceType, "COMMISSION"), eq(ledgerEntries.sourceId, id)));
    return rows[0];
  });
  if (!removed) return fail("NOT_FOUND", "Payment not found");
  await logActivity(
    { actorId: ctx.userId, action: "commission.deleted", module: "sales", entityType: "sales_node", entityId: removed.salesNodeId, metadata: { paymentId: id, amountPaise: removed.amountPaise } },
    db
  );
  return ok({ id });
}
