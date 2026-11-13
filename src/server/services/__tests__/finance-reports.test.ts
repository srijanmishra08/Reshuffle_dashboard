import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createCompany } from "@/server/services/companies";
import { createInvoice, issueInvoice, recordPayment } from "@/server/services/invoices";
import {
  bucketFor,
  csvCell,
  gstB2bCsv,
  gstSummary,
  paiseToRupeeString,
  receivablesAging,
} from "../finance-reports";

const ctx = { orgId: "default", userId: "user-1" };
let db: Db;
let cleanup: () => void;
let gstCo: string;
let walkIn: string;
let seq = 0;

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

const items = [{ description: "Build", sacCode: "998314", quantity: 1, ratePaise: 100_000_00, taxable: true }];

async function issue(companyId: string, issueDate: string, extra: Record<string, unknown> = {}) {
  const d = must(await createInvoice(db, ctx, { companyId, items, ...extra }));
  return must(await issueInvoice(db, ctx, d.id, { idempotencyKey: `rep-key-${++seq}-abcdefgh`, issueDate }));
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
  gstCo = must(await createCompany(db, ctx, { name: "=Evil, Co", gstin: "27CCCCC2222C1Z5", stateCode: "27" })).id;
  walkIn = must(await createCompany(db, ctx, { name: "Walk-in Co", stateCode: "22" })).id;
});
afterAll(() => cleanup());

describe("helpers", () => {
  it("buckets days past due", () => {
    expect(bucketFor(-1)).toBe("NOT_DUE");
    expect(bucketFor(0)).toBe("0-30");
    expect(bucketFor(30)).toBe("0-30");
    expect(bucketFor(31)).toBe("31-60");
    expect(bucketFor(61)).toBe("61-90");
    expect(bucketFor(91)).toBe("90+");
  });

  it("formats paise without floats and guards CSV cells", () => {
    expect(paiseToRupeeString(5)).toBe("0.05");
    expect(paiseToRupeeString(118_000_00)).toBe("118000.00");
    expect(paiseToRupeeString(-250)).toBe("-2.50");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-2.50")).toBe("-2.50");
  });
});

describe("receivables aging", () => {
  it("groups open invoices by days past due and nets partial payments", async () => {
    const a = await issue(gstCo, "2026-04-01"); // due 2026-04-16
    const b = await issue(walkIn, "2026-06-20"); // due 2026-07-05
    must(await recordPayment(db, ctx, a.id, { amountPaise: 18_000_00, paidAt: "2026-04-10", method: "UPI" }));

    const report = must(await receivablesAging(db, ctx, { asOf: "2026-07-10" }));
    const a90 = report.invoices.find((i) => i.id === a.id)!;
    const b05 = report.invoices.find((i) => i.id === b.id)!;
    expect(a90.daysPastDue).toBe(85);
    expect(a90.bucket).toBe("61-90");
    expect(a90.outstandingPaise).toBe(100_000_00);
    expect(b05.daysPastDue).toBe(5);
    expect(b05.bucket).toBe("0-30");
    expect(report.totalOutstandingPaise).toBe(218_000_00);
    expect(report.buckets.map((x) => x.bucket)).toEqual(["NOT_DUE", "0-30", "31-60", "61-90", "90+"]);
  });

  it("rejects a malformed date", async () => {
    expect((await receivablesAging(db, ctx, { asOf: "10/07/2026" })).ok).toBe(false);
  });
});

describe("gst summary", () => {
  it("totals output tax by month and splits B2B from B2C", async () => {
    const report = must(await gstSummary(db, ctx, { fy: "2026" }));
    expect(report.months.map((m) => m.month)).toEqual(["2026-04", "2026-06"]);
    expect(report.months[0]).toMatchObject({ taxableValuePaise: 100_000_00, igstPaise: 18_000_00, cgstPaise: 0 });
    expect(report.months[1]).toMatchObject({ cgstPaise: 9_000_00, sgstPaise: 9_000_00, igstPaise: 0 });
    expect(report.b2b).toHaveLength(1);
    expect(report.b2c).toHaveLength(1);
    expect(report.totals.taxableValuePaise).toBe(200_000_00);
  });

  it("narrows to one month and rejects a month outside the year", async () => {
    const june = must(await gstSummary(db, ctx, { fy: "2026", month: "2026-06" }));
    expect(june.b2b).toHaveLength(0);
    expect(june.b2c).toHaveLength(1);
    expect((await gstSummary(db, ctx, { fy: "2026", month: "2027-04" })).ok).toBe(false);
  });

  it("builds a B2B CSV that matches the issued invoice", async () => {
    const report = must(await gstSummary(db, ctx, { fy: "2026" }));
    const lines = gstB2bCsv(report.b2b).trim().split("\r\n");
    expect(lines).toHaveLength(2);
    const row = lines[1];
    expect(row).toContain("27CCCCC2222C1Z5");
    expect(row).toContain("'=Evil");
    expect(row).toContain(",118000.00,");
    expect(row).toContain(",18,100000.00,18000.00,0.00,0.00");
  });
});
