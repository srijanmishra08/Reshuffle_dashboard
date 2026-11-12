import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";

// PGlite returns { rows }; postgres-js returns the array itself. Tests run on PGlite.
function rowsOf<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
}

describe("migrations", () => {
  let db: Db;
  let cleanup: () => void;

  beforeAll(async () => {
    ({ db, cleanup } = await createTestDb());
  });
  afterAll(() => cleanup());

  it("enables row level security on every public table, so the Supabase REST API cannot read them", async () => {
    const result = await db.execute(
      sql`select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`
    );
    const rows = rowsOf<{ tablename: string; rowsecurity: boolean }>(result);

    expect(rows.length).toBeGreaterThanOrEqual(21);
    expect(rows.filter((row) => !row.rowsecurity).map((row) => row.tablename)).toEqual([]);
  });

  it("seeds the 8 verticals", async () => {
    const rows = await db.select().from(schema.verticals);
    expect(rows.map((row) => row.name).sort()).toEqual(
      ["Dairy", "FMCG", "Fertiliser", "Interior", "Law", "Real Estate", "Rice Mill", "Travel Agency"].sort()
    );
  });

  it("stores timestamps as timestamptz and JSON as jsonb", async () => {
    const result = await db.execute(
      sql`select table_name, column_name, data_type from information_schema.columns
          where table_schema = 'public'
            and ((table_name = 'companies' and column_name = 'created_at')
              or (table_name = 'meetings' and column_name = 'attendees')
              or (table_name = 'pipeline_items' and column_name = 'metadata'))`
    );
    const types = Object.fromEntries(
      rowsOf<{ table_name: string; column_name: string; data_type: string }>(result).map((row) => [
        `${row.table_name}.${row.column_name}`,
        row.data_type,
      ])
    );
    expect(types).toEqual({
      "companies.created_at": "timestamp with time zone",
      "meetings.attendees": "jsonb",
      "pipeline_items.metadata": "jsonb",
    });
  });
});
