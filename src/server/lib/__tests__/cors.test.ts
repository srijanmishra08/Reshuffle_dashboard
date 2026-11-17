import { describe, expect, it } from "vitest";
import { allowedOrigins, corsHeaders } from "../cors";

describe("cors", () => {
  it("allows the invoice software by default and nobody else", () => {
    expect(allowedOrigins(undefined)).toEqual(["https://invoice-eight-neon.vercel.app"]);
    expect(allowedOrigins("")).toEqual(["https://invoice-eight-neon.vercel.app"]);
    const ok = corsHeaders("https://invoice-eight-neon.vercel.app", allowedOrigins(undefined));
    expect(ok["Access-Control-Allow-Origin"]).toBe("https://invoice-eight-neon.vercel.app");
    expect(ok["Access-Control-Allow-Headers"]).toContain("Authorization");
    expect(ok.Vary).toBe("Origin");
    for (const origin of ["https://evil.example", "http://invoice-eight-neon.vercel.app", "https://invoice-eight-neon.vercel.app.evil.example", null]) {
      expect(corsHeaders(origin, allowedOrigins(undefined)), String(origin)).toEqual({});
    }
  });

  it("reads extra origins from the setting and ignores trailing slashes", () => {
    const list = allowedOrigins(" https://invoices.example.com/ , https://other.example.org ");
    expect(list).toEqual(["https://invoices.example.com", "https://other.example.org"]);
    expect(corsHeaders("https://invoices.example.com", list)["Access-Control-Allow-Origin"]).toBe("https://invoices.example.com");
    expect(corsHeaders("https://invoice-eight-neon.vercel.app", list)).toEqual({});
  });
});
