import { describe, expect, it } from "vitest";
import { computeTax, MAX_LINE_PAISE } from "@/server/services/gst";

const base = { orgState: "22", placeOfSupply: "22", hasGstin: true };

describe("computeTax", () => {
  it("splits CGST and SGST for intra-state", () => {
    const r = computeTax({ ...base, items: [{ amountPaise: 1000000 }] });
    expect(r.mode).toBe("INTRA");
    expect(r.cgst).toBe(90000);
    expect(r.sgst).toBe(90000);
    expect(r.igst).toBe(0);
    expect(r.total).toBe(1180000);
    expect(r.roundOff).toBe(0);
  });

  it("charges IGST for inter-state", () => {
    const r = computeTax({ ...base, placeOfSupply: "27", items: [{ amountPaise: 1000000 }] });
    expect(r.mode).toBe("INTER");
    expect(r.igst).toBe(180000);
    expect(r.cgst).toBe(0);
    expect(r.sgst).toBe(0);
  });

  it("treats a missing GSTIN as B2C on the org state", () => {
    const r = computeTax({ ...base, placeOfSupply: "27", hasGstin: false, items: [{ amountPaise: 1000000 }] });
    expect(r.mode).toBe("INTRA");
    expect(r.cgst).toBe(90000);
  });

  it("rounds the total to the rupee with a visible round-off", () => {
    // 3333.33 -> 9% = 300.00 (299.9997 rounds to 30000 paise)
    const r = computeTax({ ...base, items: [{ amountPaise: 333333 }] });
    expect(r.total % 100).toBe(0);
    expect(r.roundOff).toBe(r.total - (r.subtotal + r.cgst + r.sgst + r.igst));
    expect(Math.abs(r.roundOff)).toBeLessThan(100);
  });

  it("leaves non-taxable lines untaxed", () => {
    const r = computeTax({
      ...base,
      items: [{ amountPaise: 100000 }, { amountPaise: 50000, taxable: false }],
    });
    expect(r.subtotal).toBe(150000);
    expect(r.cgst).toBe(9000);
  });

  it("rejects negative or fractional amounts", () => {
    expect(() => computeTax({ ...base, items: [{ amountPaise: -1 }] })).toThrow();
    expect(() => computeTax({ ...base, items: [{ amountPaise: 1.5 }] })).toThrow();
  });

  it("rejects odd, fractional, negative or over-100% rates", () => {
    for (const rateBps of [1801, 1800.5, -2, 10_002, Number.NaN]) {
      expect(() => computeTax({ ...base, rateBps, items: [{ amountPaise: 100 }] })).toThrow(/basis points/);
    }
    expect(computeTax({ ...base, rateBps: 500, items: [{ amountPaise: 10000 }] }).cgst).toBe(250);
  });

  it("bounds a single line amount", () => {
    expect(() => computeTax({ ...base, items: [{ amountPaise: MAX_LINE_PAISE + 1 }] })).toThrow(/limit/);
    expect(() => computeTax({ ...base, items: [{ amountPaise: MAX_LINE_PAISE }] })).not.toThrow();
  });
});
