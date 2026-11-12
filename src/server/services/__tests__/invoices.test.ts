import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@/server/db/client";
import { createCompany } from "@/server/services/companies";
import {
  cancelInvoice,
  createInvoice,
  deleteDraftInvoice,
  getInvoiceSnapshot,
  issueInvoice,
  listInvoices,
  markOverdue,
  recordPayment,
  updateInvoice,
} from "@/server/services/invoices";

const ctx = { orgId: "default", userId: "user-1" };

let db: Db;
let cleanup: () => void;
let inState: string;
let outState: string;
let b2c: string;

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

const items = [{ description: "Dashboard build", sacCode: "998314", quantity: 1, ratePaise: 100_000_00, taxable: true }];
let keySeq = 0;
const key = () => `test-key-${++keySeq}-abcdef`;

async function draft(companyId: string, extra: Record<string, unknown> = {}) {
  return must(await createInvoice(db, ctx, { companyId, items, ...extra }));
}

async function issued(companyId: string, extra: Record<string, unknown> = {}) {
  const d = await draft(companyId, extra);
  return must(await issueInvoice(db, ctx, d.id, { idempotencyKey: key(), issueDate: "2026-06-10" }));
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await db.insert(schema.orgSettings).values({
    orgId: "default",
    legalName: "Test Studio",
    address: "1 Test Road",
    stateCode: "22",
    gstin: "22AAAAA0000A1Z5",
  });

  inState = must(
    await createCompany(db, ctx, { name: "In State Co", gstin: "22BBBBB1111B1Z5", stateCode: "22" })
  ).id;
  outState = must(
    await createCompany(db, ctx, { name: "Out State Co", gstin: "27CCCCC2222C1Z5", stateCode: "27" })
  ).id;
  b2c = must(await createCompany(db, ctx, { name: "Walk-in Co", stateCode: "27" })).id;
});
afterAll(() => cleanup());

describe("drafts", () => {
  it("computes CGST+SGST for an intra-state client", async () => {
    const inv = await draft(inState);
    expect(inv.status).toBe("DRAFT");
    expect(inv.number).toBeNull();
    expect(inv.taxMode).toBe("INTRA");
    expect(inv.subtotalPaise).toBe(100_000_00);
    expect(inv.cgstPaise).toBe(9_000_00);
    expect(inv.sgstPaise).toBe(9_000_00);
    expect(inv.igstPaise).toBe(0);
    expect(inv.totalPaise).toBe(118_000_00);
  });

  it("computes IGST 18% for an out-of-state client with GSTIN", async () => {
    const inv = await draft(outState);
    expect(inv.taxMode).toBe("INTER");
    expect(inv.igstPaise).toBe(18_000_00);
    expect(inv.cgstPaise).toBe(0);
    expect(inv.sgstPaise).toBe(0);
  });

  it("treats a client without GSTIN as intra-state even when out of state", async () => {
    const inv = await draft(b2c);
    expect(inv.taxMode).toBe("INTRA");
  });

  it("recomputes tax when items change and replaces the lines", async () => {
    const inv = await draft(inState);
    const updated = must(
      await updateInvoice(db, ctx, inv.id, {
        items: [{ description: "Retainer", quantity: 2, ratePaise: 50_000_00, taxable: false }],
      })
    );
    expect(updated.items).toHaveLength(1);
    expect(updated.subtotalPaise).toBe(100_000_00);
    expect(updated.cgstPaise).toBe(0);
    expect(updated.totalPaise).toBe(100_000_00);
  });

  it("rejects an empty item list and unknown companies", async () => {
    const empty = await createInvoice(db, ctx, { companyId: inState, items: [] });
    expect(empty.ok).toBe(false);
    const missing = await createInvoice(db, ctx, { companyId: "nope", items });
    expect(missing).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("does not let another org touch the invoice", async () => {
    const inv = await draft(inState);
    const other = { orgId: "other", userId: "u2" };
    const result = await issueInvoice(db, other, inv.id, { idempotencyKey: key() });
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("deletes a draft", async () => {
    const inv = await draft(inState);
    must(await deleteDraftInvoice(db, ctx, inv.id));
    const again = await deleteDraftInvoice(db, ctx, inv.id);
    expect(again).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("issuing", () => {
  it("issues consecutive numbers with a frozen snapshot", async () => {
    const a = await issued(inState);
    const b = await issued(outState);
    expect(a.status).toBe("ISSUED");
    expect(a.number).toMatch(/^RS\/26-27\/\d{3}$/);
    expect(Number(b.number!.slice(-3))).toBe(Number(a.number!.slice(-3)) + 1);
    expect(a.number!.length).toBeLessThanOrEqual(16);
    expect(a.dueDate).toBe("2026-06-25");

    const snap = must(await getInvoiceSnapshot(db, ctx, a.id));
    expect(snap.number).toBe(a.number);
    expect((snap.seller as { legalName: string }).legalName).toBe("Test Studio");
  });

  it("does not burn two numbers when issue is submitted twice with the same key", async () => {
    const d = await draft(inState);
    const k = key();
    const first = must(await issueInvoice(db, ctx, d.id, { idempotencyKey: k, issueDate: "2026-06-11" }));
    const second = must(await issueInvoice(db, ctx, d.id, { idempotencyKey: k, issueDate: "2026-06-11" }));
    expect(second.number).toBe(first.number);

    const next = await issued(inState);
    expect(Number(next.number!.slice(-3))).toBe(Number(first.number!.slice(-3)) + 1);
  });

  it("returns 409 for a different key on an already issued invoice", async () => {
    const inv = await issued(inState);
    const again = await issueInvoice(db, ctx, inv.id, { idempotencyKey: key() });
    expect(again).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("requires an idempotency key", async () => {
    const d = await draft(inState);
    const result = await issueInvoice(db, ctx, d.id, {});
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("refuses to edit or delete an issued invoice", async () => {
    const inv = await issued(inState);
    const edit = await updateInvoice(db, ctx, inv.id, { notes: "sneaky" });
    expect(edit).toMatchObject({ ok: false, code: "CONFLICT" });
    const del = await deleteDraftInvoice(db, ctx, inv.id);
    expect(del).toMatchObject({ ok: false, code: "CONFLICT" });
  });
});

describe("payments", () => {
  it("moves ISSUED -> PARTIALLY_PAID -> PAID", async () => {
    const inv = await issued(inState);
    const partial = must(
      await recordPayment(db, ctx, inv.id, { amountPaise: 50_000_00, paidAt: "2026-06-12", method: "UPI" })
    );
    expect(partial.status).toBe("PARTIALLY_PAID");
    expect(partial.outstandingPaise).toBe(68_000_00);

    const full = must(await recordPayment(db, ctx, inv.id, { amountPaise: 68_000_00, paidAt: "2026-06-20" }));
    expect(full.status).toBe("PAID");
    expect(full.outstandingPaise).toBe(0);
    expect(full.payments).toHaveLength(2);

    // Each payment booked one INCOME ledger entry, linked by payment id.
    const entries = await db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.sourceType, "PAYMENT"));
    const mine = entries.filter((e) => full.payments.some((p) => p.id === e.sourceId));
    expect(mine).toHaveLength(2);
    expect(mine.every((e) => e.kind === "INCOME")).toBe(true);
    expect(mine.reduce((s, e) => s + e.amountPaise, 0)).toBe(118_000_00);
  });

  it("rejects overpayment and payments on drafts", async () => {
    const inv = await issued(inState);
    const over = await recordPayment(db, ctx, inv.id, { amountPaise: 999_999_00, paidAt: "2026-06-12" });
    expect(over).toMatchObject({ ok: false, code: "VALIDATION" });

    const d = await draft(inState);
    const onDraft = await recordPayment(db, ctx, d.id, { amountPaise: 100, paidAt: "2026-06-12" });
    expect(onDraft).toMatchObject({ ok: false, code: "CONFLICT" });
  });
});

describe("cancel with credit note", () => {
  it("cancels an unpaid invoice and numbers the credit note in its own series", async () => {
    const inv = await issued(inState);
    const cancelled = must(await cancelInvoice(db, ctx, inv.id, { reason: "Raised in error" }));
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.creditNote?.number).toMatch(/^RS-CN\/\d{2}-\d{2}\/\d{3}$/);
    expect(cancelled.creditNote?.amountPaise).toBe(inv.totalPaise);
    expect(cancelled.outstandingPaise).toBe(0);
  });

  it("blocks cancelling when payments exist, and cancelling twice", async () => {
    const inv = await issued(inState);
    must(await recordPayment(db, ctx, inv.id, { amountPaise: 1000_00, paidAt: "2026-06-12" }));
    const blocked = await cancelInvoice(db, ctx, inv.id, { reason: "Changed mind" });
    expect(blocked).toMatchObject({ ok: false, code: "CONFLICT" });

    const other = await issued(inState);
    must(await cancelInvoice(db, ctx, other.id, { reason: "Duplicate" }));
    const twice = await cancelInvoice(db, ctx, other.id, { reason: "Duplicate" });
    expect(twice).toMatchObject({ ok: false, code: "CONFLICT" });
  });
});

describe("overdue and receivables", () => {
  it("flags open invoices past due and reports receivables", async () => {
    const late = await issued(inState, { dueDate: "2026-06-15" });
    const notYet = await issued(inState, { dueDate: "2099-01-01" });

    expect(await markOverdue(db, "2026-07-01")).toBeGreaterThanOrEqual(1);
    expect(await markOverdue(db, "2026-07-01")).toBe(0);

    const list = must(await listInvoices(db, ctx, { overdue: "true" }));
    const ids = list.invoices.map((i) => i.id);
    expect(ids).toContain(late.id);
    expect(ids).not.toContain(notYet.id);
    expect(list.summary.overdueCount).toBeGreaterThanOrEqual(1);
    expect(list.summary.outstandingPaise).toBeGreaterThanOrEqual(list.summary.overduePaise);

    must(await recordPayment(db, ctx, late.id, { amountPaise: late.totalPaise, paidAt: "2026-07-02" }));
    const after = must(await listInvoices(db, ctx, { status: "PAID" }));
    expect(after.invoices.find((i) => i.id === late.id)?.overdueAt).toBeNull();
  });
});
