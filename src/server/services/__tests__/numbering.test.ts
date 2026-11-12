import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";
import { financialYear, formatDocNumber, nextNumber } from "@/server/services/numbering";

describe("financialYear", () => {
  it("rolls over on 1 April (India time)", () => {
    expect(financialYear(new Date("2026-03-31T10:00:00+05:30"))).toBe("2025-26");
    expect(financialYear(new Date("2026-04-01T00:30:00+05:30"))).toBe("2026-27");
    expect(financialYear(new Date("2027-01-15T10:00:00+05:30"))).toBe("2026-27");
  });
});

describe("formatDocNumber", () => {
  it("is within the 16 character GST limit", () => {
    expect(formatDocNumber("RS", "2026-27", 1)).toBe("RS/26-27/001");
    expect(formatDocNumber("RS", "2026-27", 1).length).toBeLessThanOrEqual(16);
  });
});

describe("nextNumber", () => {
  let db: Db;
  let cleanup: () => void;

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
  });
  afterAll(() => cleanup());

  it("allocates consecutive numbers and restarts each FY", async () => {
    const a = await nextNumber(db, { docType: "INVOICE", date: new Date("2026-04-02T10:00:00+05:30") });
    const b = await nextNumber(db, { docType: "INVOICE", date: new Date("2026-05-02T10:00:00+05:30") });
    const nextFy = await nextNumber(db, { docType: "INVOICE", date: new Date("2027-04-01T10:00:00+05:30") });

    expect(a.number).toBe("RS/26-27/001");
    expect(b.number).toBe("RS/26-27/002");
    expect(nextFy.number).toBe("RS/27-28/001");
  });

  it("keeps separate series per document type", async () => {
    const wo = await nextNumber(db, { docType: "WORK_ORDER", date: new Date("2026-06-01T10:00:00+05:30") });
    expect(wo.number).toBe("WO/26-27/001");
  });

  it("gives distinct numbers under concurrent issue", async () => {
    // Allocation is a single atomic UPDATE ... RETURNING, so parallel callers never collide.
    const date = new Date("2026-07-01T10:00:00+05:30");
    const results = await Promise.all(
      Array.from({ length: 12 }, () => nextNumber(db, { docType: "CREDIT_NOTE", date }))
    );
    const numbers = results.map((r) => r.number);
    expect(new Set(numbers).size).toBe(12);
    expect(results.map((r) => r.sequence).sort((x, y) => x - y)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1)
    );
  });

  it("gives distinct numbers under concurrent issuing transactions", async () => {
    const date = new Date("2026-09-01T10:00:00+05:30");
    const results = await Promise.all(
      Array.from({ length: 10 }, () => db.transaction((tx) => nextNumber(tx, { docType: "AGREEMENT", date })))
    );
    expect(new Set(results.map((r) => r.number)).size).toBe(10);
    expect(results.map((r) => r.sequence).sort((x, y) => x - y)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1));
  });

  it("does not burn a number when the issuing transaction rolls back", async () => {
    const date = new Date("2026-08-01T10:00:00+05:30");
    const first = await nextNumber(db, { docType: "LETTER", date });

    await expect(
      db.transaction(async (tx) => {
        await nextNumber(tx, { docType: "LETTER", date });
        throw new Error("issue failed");
      })
    ).rejects.toThrow("issue failed");

    const second = await nextNumber(db, { docType: "LETTER", date });
    expect(first.sequence).toBe(1);
    expect(second.sequence).toBe(2);
  });
});
