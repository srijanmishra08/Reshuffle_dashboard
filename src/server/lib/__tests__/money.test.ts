import { describe, expect, it } from "vitest";
import { amountInWords, formatINR, toPaise } from "@/server/lib/money";

describe("toPaise", () => {
  it("parses without float drift", () => {
    expect(toPaise("1234.50")).toBe(123450);
    expect(toPaise("0.1")).toBe(10);
    expect(toPaise(19.99)).toBe(1999);
    expect(toPaise("1,00,000")).toBe(10000000);
  });

  it("rejects bad input", () => {
    expect(() => toPaise("12.345")).toThrow();
    expect(() => toPaise("abc")).toThrow();
  });
});

describe("amountInWords", () => {
  it("handles zero and small values", () => {
    expect(amountInWords(0)).toBe("Rupees Zero Only");
    expect(amountInWords(100)).toBe("Rupees One Only");
    expect(amountInWords(9900)).toBe("Rupees Ninety Nine Only");
  });

  it("uses lakh and crore", () => {
    expect(amountInWords(10000000)).toBe("Rupees One Lakh Only");
    expect(amountInWords(123456789_50)).toBe(
      "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine and Fifty Paise Only"
    );
  });

  it("handles paise only", () => {
    expect(amountInWords(5)).toBe("Rupees Zero and Five Paise Only");
  });
});

describe("formatINR", () => {
  it("groups in the Indian system", () => {
    expect(formatINR(12345650).replace(/\s/g, "")).toBe("₹1,23,456.50");
  });
});
