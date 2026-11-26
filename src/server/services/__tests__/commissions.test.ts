import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createDeal, transitionDeal } from "../deals";
import { createSalesNode, deleteCommissionPayment, listNodeCommissions, listSalesNodes, recordCommissionPayment } from "../sales-nodes";

const ctx = { orgId: "default", userId: "user-1" };
const other = { orgId: "other", userId: "user-2" };
const manager = { includeMoney: true };
let db: Db;
let cleanup: () => void;

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

async function wonDeal(name: string, nodeId: string, valuePaise: number) {
  const deal = must(await createDeal(db, ctx, { companyName: name, title: `${name} build`, salesNodeId: nodeId, valuePaise }));
  for (const to of ["CONTACTED", "PROPOSAL_SENT", "WON"] as const) must(await transitionDeal(db, ctx, deal.id, { to }));
  return deal;
}

async function ledgerFor(id: string) {
  return db
    .select()
    .from(schema.ledgerEntries)
    .where(and(eq(schema.ledgerEntries.sourceType, "COMMISSION"), eq(schema.ledgerEntries.sourceId, id)));
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(() => cleanup());

describe("referral commission payments", () => {
  it("records part payments on an accepted deal, books each as an expense, and shows what is still owed", async () => {
    const node = must(await createSalesNode(db, ctx, manager, { name: "Commission Partner", kind: "FREELANCER", commissionPercent: 10 }));
    const deal = await wonDeal("Paid Lead Co", node.id, 2_000_000); // commission due: 2,00,000 paise

    const first = must(await recordCommissionPayment(db, ctx, node.id, { dealId: deal.id, amountPaise: 50_000, paidOn: "2026-11-20", note: "first half" }));
    expect(first.totals).toEqual({ duePaise: 200_000, paidPaise: 50_000, owedPaise: 150_000 });
    expect(first.deals[0]).toMatchObject({ id: deal.id, companyName: "Paid Lead Co", duePaise: 200_000, paidPaise: 50_000, owedPaise: 150_000 });

    const [entry] = await ledgerFor(first.id);
    expect(entry).toMatchObject({ kind: "EXPENSE", amountPaise: 50_000, entryDate: "2026-11-20", companyId: deal.companyId, orgId: "default" });
    expect(entry.description).toContain("Commission Partner");

    must(await recordCommissionPayment(db, ctx, node.id, { dealId: deal.id, amountPaise: 150_000 }));
    const stats = must(await listSalesNodes(db, ctx, manager)).find((n) => n.id === node.id)!;
    expect(stats).toMatchObject({ commissionDuePaise: 200_000, commissionPaidPaise: 200_000, commissionOwedPaise: 0 });
    expect(must(await listSalesNodes(db, ctx, { includeMoney: false })).find((n) => n.id === node.id)).not.toHaveProperty("commissionPaidPaise");

    // Nothing left to pay.
    expect(await recordCommissionPayment(db, ctx, node.id, { dealId: deal.id, amountPaise: 1 })).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("refuses overpayment, open deals, other nodes' deals, nodes with no rate, other organisations and bad input", async () => {
    const node = must(await createSalesNode(db, ctx, manager, { name: "Strict Partner", kind: "AGENCY", commissionPercent: 5 }));
    const deal = await wonDeal("Strict Lead Co", node.id, 1_000_000); // due 50,000
    expect(await recordCommissionPayment(db, ctx, node.id, { dealId: deal.id, amountPaise: 50_001 })).toMatchObject({ ok: false, code: "CONFLICT" });

    const open = must(await createDeal(db, ctx, { companyName: "Open Lead Co", title: "Open", salesNodeId: node.id, valuePaise: 1_000_000 }));
    expect(await recordCommissionPayment(db, ctx, node.id, { dealId: open.id, amountPaise: 100 })).toMatchObject({ ok: false, code: "CONFLICT" });

    const elsewhere = must(await createSalesNode(db, ctx, manager, { name: "Elsewhere Partner", commissionPercent: 5 }));
    expect(await recordCommissionPayment(db, ctx, elsewhere.id, { dealId: deal.id, amountPaise: 100 })).toMatchObject({ ok: false, code: "NOT_FOUND" });

    const noRate = must(await createSalesNode(db, ctx, manager, { name: "No Rate Partner" }));
    const noRateDeal = await wonDeal("No Rate Co", noRate.id, 1_000_000);
    expect(await recordCommissionPayment(db, ctx, noRate.id, { dealId: noRateDeal.id, amountPaise: 100 })).toMatchObject({ ok: false, code: "CONFLICT" });

    expect(await recordCommissionPayment(db, other, node.id, { dealId: deal.id, amountPaise: 100 })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await listNodeCommissions(db, other, node.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await recordCommissionPayment(db, ctx, node.id, { dealId: deal.id, amountPaise: 0 })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await recordCommissionPayment(db, ctx, node.id, { dealId: deal.id, amountPaise: 10.5 })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await recordCommissionPayment(db, ctx, node.id, { dealId: deal.id, amountPaise: 100, paidOn: "20-11-2026" })).toMatchObject({ ok: false, code: "VALIDATION" });

    const view = must(await listNodeCommissions(db, ctx, node.id));
    expect(view.payments).toHaveLength(0);
    expect(view.deals.map((d) => d.id)).toEqual([deal.id]);
  });

  it("deletes a payment with its ledger entry, only inside the organisation", async () => {
    const node = must(await createSalesNode(db, ctx, manager, { name: "Undo Partner", commissionPercent: 10 }));
    const deal = await wonDeal("Undo Lead Co", node.id, 1_000_000);
    const paid = must(await recordCommissionPayment(db, ctx, node.id, { dealId: deal.id, amountPaise: 10_000 }));
    expect(await ledgerFor(paid.id)).toHaveLength(1);

    expect(await deleteCommissionPayment(db, other, paid.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(must(await deleteCommissionPayment(db, ctx, paid.id))).toEqual({ id: paid.id, deleted: true });
    expect(await ledgerFor(paid.id)).toHaveLength(0);
    expect(must(await listNodeCommissions(db, ctx, node.id)).totals).toEqual({ duePaise: 100_000, paidPaise: 0, owedPaise: 100_000 });
    expect(await deleteCommissionPayment(db, ctx, paid.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});
