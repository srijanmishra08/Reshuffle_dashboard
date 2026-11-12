import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import {
  backfillPaymentEntries,
  createCategory,
  createEntry,
  deleteEntry,
  listEntries,
  monthlySummary,
} from "../finance";

const ctx = { orgId: "default", userId: "user-1" };
let db: Db;
let cleanup: () => void;

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(() => cleanup());

describe("finance ledger", () => {
  it("rejects bad entries", async () => {
    expect((await createEntry(db, ctx, { kind: "INCOME", entryDate: "10-06-2026", amountPaise: 100 })).ok).toBe(false);
    expect((await createEntry(db, ctx, { kind: "INCOME", entryDate: "2026-06-10", amountPaise: 10.5 })).ok).toBe(false);
    expect((await createEntry(db, ctx, { kind: "EXPENSE", entryDate: "2026-06-10", amountPaise: 100, categoryId: "nope" })).ok).toBe(false);
  });

  it("rejects a duplicate category", async () => {
    must(await createCategory(db, ctx, { name: "Software" }));
    const again = await createCategory(db, ctx, { name: "Software" });
    expect(again.ok).toBe(false);
  });

  it("sums a financial year by month, April to March", async () => {
    must(await createEntry(db, ctx, { kind: "INCOME", entryDate: "2026-04-15", amountPaise: 500_000 }));
    must(await createEntry(db, ctx, { kind: "EXPENSE", entryDate: "2026-04-20", amountPaise: 120_050 }));
    must(await createEntry(db, ctx, { kind: "INCOME", entryDate: "2027-03-31", amountPaise: 70_000 }));
    must(await createEntry(db, ctx, { kind: "INCOME", entryDate: "2027-04-01", amountPaise: 999_999 })); // next FY

    const summary = must(await monthlySummary(db, ctx, { fy: "2026" }));
    expect(summary.months).toHaveLength(12);
    expect(summary.months[0]).toMatchObject({ month: "2026-04", incomePaise: 500_000, expensePaise: 120_050, netPaise: 379_950 });
    expect(summary.months[11]).toMatchObject({ month: "2027-03", incomePaise: 70_000 });
    expect(summary.incomePaise).toBe(570_000);
  });

  it("filters by month and deletes manual entries only", async () => {
    const april = must(await listEntries(db, ctx, { month: "2026-04" }));
    expect(april).toHaveLength(2);

    await db.insert(schema.ledgerEntries).values({
      id: "auto-1",
      orgId: "default",
      kind: "INCOME",
      entryDate: "2026-05-01",
      amountPaise: 100,
      sourceType: "PAYMENT",
      sourceId: "pay-x",
    });
    const blocked = await deleteEntry(db, ctx, "auto-1");
    expect(blocked.ok).toBe(false);

    const manual = must(await createEntry(db, ctx, { kind: "EXPENSE", entryDate: "2026-05-02", amountPaise: 50 }));
    expect((await deleteEntry(db, ctx, manual.id)).ok).toBe(true);
  });

  it("backfill is idempotent on empty payments", async () => {
    const first = must(await backfillPaymentEntries(db, ctx));
    const second = must(await backfillPaymentEntries(db, ctx));
    expect(first.created).toBe(second.created);
    expect(second.created).toBe(0);
  });
});
