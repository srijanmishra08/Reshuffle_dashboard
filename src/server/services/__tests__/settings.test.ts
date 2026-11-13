import { describe, expect, it } from "vitest";
import { parseBank } from "@/server/services/settings";

describe("parseBank", () => {
  it("keeps known string fields and fills the rest", () => {
    expect(parseBank({ accountName: "Example Co", ifsc: "EXMP0000001", junk: "x" })).toEqual({
      accountName: "Example Co",
      accountNumber: "",
      ifsc: "EXMP0000001",
      bankName: "",
    });
  });

  it("survives null, arrays, scalars and non-string fields", () => {
    const empty = { accountName: "", accountNumber: "", ifsc: "", bankName: "" };
    for (const bad of [null, undefined, [], "text", 42, true]) {
      expect(parseBank(bad)).toEqual(empty);
    }
    expect(parseBank({ accountNumber: 12345, bankName: { nested: true } })).toEqual(empty);
  });
});
