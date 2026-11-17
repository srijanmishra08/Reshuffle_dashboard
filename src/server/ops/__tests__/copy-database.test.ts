import { describe, expect, it } from "vitest";
import { chunk, compareFingerprints, orderTablesByForeignKeys, parseEnvFile, projectRefFromUrl, redactUrl } from "../copy-database";

describe("copy-database helpers", () => {
  it("reads an env file with quotes, comments and blank lines", () => {
    const env = parseEnvFile('# note\n\nA="one"\nB=two\nC=\'three\'\nD=a=b=c\n  E = spaced  \nnot a line\n');
    expect(env).toEqual({ A: "one", B: "two", C: "three", D: "a=b=c", E: "spaced" });
  });

  it("hides the password in a database URL and finds the project ref", () => {
    const url = "postgresql://postgres.abcdefghijklmnopqrst:s3cret!@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";
    expect(redactUrl(url)).toBe("postgresql://postgres.abcdefghijklmnopqrst:***@aws-0-ap-south-1.pooler.supabase.com:6543/postgres");
    expect(redactUrl(url)).not.toContain("s3cret");
    expect(projectRefFromUrl(url)).toBe("abcdefghijklmnopqrst");
    expect(projectRefFromUrl("postgresql://postgres:pw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres")).toBe("abcdefghijklmnopqrst");
    expect(projectRefFromUrl("postgresql://u:p@localhost/db")).toBeNull();
  });

  it("puts every table after the tables it points at", () => {
    const order = orderTablesByForeignKeys(
      ["invoice_items", "invoices", "companies", "session", "user", "tree"],
      [
        { table: "invoice_items", references: "invoices" },
        { table: "invoices", references: "companies" },
        { table: "session", references: "user" },
        { table: "tree", references: "tree" },
      ]
    );
    const at = (t: string) => order.indexOf(t);
    expect(order).toHaveLength(6);
    expect(at("companies")).toBeLessThan(at("invoices"));
    expect(at("invoices")).toBeLessThan(at("invoice_items"));
    expect(at("user")).toBeLessThan(at("session"));
  });

  it("is stable, ignores unknown tables, and refuses a cycle", () => {
    expect(orderTablesByForeignKeys(["b", "a"], [])).toEqual(["a", "b"]);
    expect(orderTablesByForeignKeys(["a"], [{ table: "a", references: "elsewhere" }])).toEqual(["a"]);
    expect(() => orderTablesByForeignKeys(["a", "b"], [{ table: "a", references: "b" }, { table: "b", references: "a" }])).toThrow(/cycle/);
  });

  it("splits lists into chunks", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 3)).toEqual([]);
  });

  it("describes every difference between two databases", () => {
    const same = { count: 2, hash: "x" };
    expect(compareFingerprints({ a: same, b: same }, { a: same, b: same })).toEqual([]);
    const problems = compareFingerprints({ a: same, b: same, c: same }, { a: { count: 3, hash: "x" }, b: { count: 2, hash: "y" }, d: same });
    expect(problems).toEqual([
      "a: 2 rows in the old database, 3 in the new one",
      "b: same row count but the contents differ",
      "c: missing in the new database",
      "d: only in the new database",
    ]);
  });
});
