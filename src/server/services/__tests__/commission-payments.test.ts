import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createDeal, transitionDeal } from "../deals";
import { createSalesNode, deleteCommissionPayment, listCommissionPayments, listSalesNodes, recordCommissionPayment } from "../sales-nodes";

const ctx = { orgId: "default", userId: "user-1" };
const other = { orgId: "other", userId: "user-2" };
const manager = { includeMoney: true };
let db: Db;
let cleanup: () => void;

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

async function wonDeal(name: string, salesNodeId: string, valuePaise: number) {
  const deal = must(await createDeal(db, ctx, { companyName: name, title: name, salesNodeId, valuePaise }));
  for (const to of ["CONTACTED", "PROPOSAL_SENT", "WON"] as const) must(await transitionDeal(db, ctx, deal.id, { to }));
  return deal;
}

function ledgerFor(paymentId: string) {
  return db
    .select()
    .from(schema.ledgerEntries)
    .where(and(eq(schema.ledgerEntries.sourceType, "COMMISSION"), eq(schema.ledgerEntries.sourceId, paymentId)));
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(() => cleanup());

describe("commission payments", () => {
  it("records a payment against an accepted deal, books an expense, and lowers what is owed", async () => {
    const node = must(await createSalesNode(db, ctx, manager, { name: "Pay Node", kind: "FREELANCER", commissionPercent: 10 }));
    const deal = await wonDeal("Pay Deal Co", node.id, 5_000_000);

    const before = must(await listSalesNodes(db, ctx, manager)).find((n) => n.id === node.id)!;
    expect(before).toMatchObject({ commissionDuePaise: 500_000, commissionPaidPaise: 0, commissionOwedPaise: 500_000 });

    const payment = must(await recordCommissionPayment(db, ctx, node.id, { amountPaise: 300_000, paidOn: "2026-11-20", dealId: deal.id, reference: "UPI 123" }));
    expect(payment).toMatchObject({ amountPaise: 300_000, paidOn: "2026-11-20", dealId: deal.id, dealTitle: "Pay Deal Co", reference: "UPI 123" });

    const ledger = await ledgerFor(payment.id);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ kind: "EXPENSE", amountPaise: 300_000, entryDate: "2026-11-20", companyId: deal.companyId });
    expect(ledger[0].description).toContain("Pay Node");

    const after = must(await listSalesNodes(db, ctx, manager)).find((n) => n.id === node.id)!;
    expect(after).toMatchObject({ commissionPaidPaise: 300_000, commissionOwedPaise: 200_000 });
    expect(must(await listSalesNodes(db, ctx, { includeMoney: false })).find((n) => n.id === node.id)).not.toHaveProperty("commissionPaidPaise");

    const listed = must(await listCommissionPayments(db, ctx, node.id));
    expect(listed.map((p) => p.id)).toEqual([payment.id]);
    expect(listed[0].dealTitle).toBe("Pay Deal Co");
  });

  it("allows a lump sum with no deal and an advance beyond what is owed", async () => {
    const node = must(await createSalesNode(db, ctx, manager, { name: "Advance Node", commissionPercent: 5 }));
    must(await recordCommissionPayment(db, ctx, node.id, { amountPaise: 10_000 }));
    const row = must(await listSalesNodes(db, ctx, manager)).find((n) => n.id === node.id)!;
    expect(row).toMatchObject({ commissionDuePaise: 0, commissionPaidPaise: 10_000, commissionOwedPaise: -10_000 });
  });

  it("refuses bad amounts, deals from another node, deals not accepted and other organisations", async () => {
    const node = must(await createSalesNode(db, ctx, manager, { name: "Strict Node", commissionPercent: 10 }));
    const otherNode = must(await createSalesNode(db, ctx, manager, { name: "Other Node", commissionPercent: 10 }));
    const foreignDeal = await wonDeal("Other Node Deal", otherNode.id, 1_000_000);
    const openDeal = must(await createDeal(db, ctx, { companyName: "Open Deal Co", title: "Open", salesNodeId: node.id, valuePaise: 1_000_000 }));

    expect(await recordCommissionPayment(db, ctx, node.id, { amountPaise: 0 })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await recordCommissionPayment(db, ctx, node.id, { amountPaise: 12.5 })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await recordCommissionPayment(db, ctx, node.id, { amountPaise: 100, paidOn: "20/11/2026" })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await recordCommissionPayment(db, ctx, node.id, { amountPaise: 100, dealId: foreignDeal.id })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await recordCommissionPayment(db, ctx, node.id, { amountPaise: 100, dealId: openDeal.id })).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(await recordCommissionPayment(db, ctx, node.id, { amountPaise: 100, dealId: "missing" })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await recordCommissionPayment(db, other, node.id, { amountPaise: 100 })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await listCommissionPayments(db, other, node.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(must(await listCommissionPayments(db, ctx, node.id))).toEqual([]);
  });

  it("deletes a payment with its ledger entry, only within the organisation", async () => {
    const node = must(await createSalesNode(db, ctx, manager, { name: "Undo Node", commissionPercent: 10 }));
    const payment = must(await recordCommissionPayment(db, ctx, node.id, { amountPaise: 7_500 }));

    expect(await deleteCommissionPayment(db, other, payment.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await ledgerFor(payment.id)).toHaveLength(1);

    expect(must(await deleteCommissionPayment(db, ctx, payment.id))).toEqual({ id: payment.id });
    expect(await ledgerFor(payment.id)).toHaveLength(0);
    expect(must(await listCommissionPayments(db, ctx, node.id))).toEqual([]);
    expect(await deleteCommissionPayment(db, ctx, payment.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});
