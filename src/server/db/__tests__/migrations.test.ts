import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { createTestDb } from "@/test/db";
import { createCompany } from "@/server/services/companies";
import { createDeal, transitionDeal } from "@/server/services/deals";
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

  it("has no verticals table or vertical columns left", async () => {
    const result = await db.execute(
      sql`select table_name, column_name from information_schema.columns
          where table_schema = 'public' and (table_name = 'verticals' or column_name = 'vertical_id')`
    );
    expect(rowsOf<{ table_name: string; column_name: string }>(result)).toEqual([]);
  });

  it("backfills client modules from deals that are not lost (migration 0026)", async () => {
    const ctx = { orgId: "default", userId: "u" };
    await db.insert(schema.modulesLibrary).values([
      { id: "bf-a", orgId: "default", name: "A" },
      { id: "bf-b", orgId: "default", name: "B" },
    ]);
    const open = await createCompany(db, ctx, { name: "Backfill Open" });
    const lostCo = await createCompany(db, ctx, { name: "Backfill Lost" });
    if (!open.ok || !lostCo.ok) throw new Error("setup");
    await createDeal(db, ctx, { companyId: open.data.id, title: "Live", moduleIds: ["bf-a"] });
    const lost = await createDeal(db, ctx, { companyId: lostCo.data.id, title: "Dropped", moduleIds: ["bf-b"] });
    if (!lost.ok) throw new Error("setup");
    await transitionDeal(db, ctx, lost.data.id, { to: "LOST", lostReason: "x" });

    // Pretend the table was just created: empty it, run the migration's own INSERT, and check what comes back.
    await db.execute(sql`delete from company_modules`);
    const file = readFileSync("drizzle/0026_company_modules.sql", "utf8");
    await db.execute(sql.raw(file.slice(file.indexOf('INSERT INTO "company_modules"'))));
    const rows = rowsOf<{ company_id: string; module_id: string }>(await db.execute(sql`select company_id, module_id from company_modules`));
    expect(rows).toEqual([{ company_id: open.data.id, module_id: "bf-a" }]);
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
