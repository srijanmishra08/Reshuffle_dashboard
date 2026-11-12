import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

// The production Turso DB already has tables created by the old runtime
// `CREATE TABLE IF NOT EXISTS` code. The baseline migration must adopt them
// without touching their rows.
describe("baseline migration on a database that already has legacy tables", () => {
  it("keeps existing rows and applies cleanly", async () => {
    const dir = mkdtempSync(join(tmpdir(), "reshuffle-legacy-"));
    const client = createClient({ url: `file:${join(dir, "legacy.db")}` });

    try {
      await client.execute(`CREATE TABLE clients (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, company TEXT, notes TEXT,
        stage TEXT NOT NULL DEFAULT 'LEAD', status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      await client.execute(`CREATE TABLE activity_logs (
        id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, module TEXT NOT NULL,
        entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
      await client.execute(
        "CREATE INDEX idx_activity_module_created ON activity_logs (module, created_at DESC)"
      );
      await client.execute("INSERT INTO clients (id, name, created_at, updated_at) VALUES ('c1', 'Fake Co', '2026-05-01 10:30:00', '2026-05-01 10:30:00')");
      await client.execute(
        "INSERT INTO activity_logs (id, action, module, entity_type, entity_id) VALUES ('a1','x','crm','client','c1')"
      );

      await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
      await migrate(drizzle(client), { migrationsFolder: "./drizzle" }); // idempotent

      const clients = await client.execute("SELECT name FROM clients");
      const logs = await client.execute("SELECT id FROM activity_logs");
      const companies = await client.execute("SELECT count(*) AS n FROM companies");
      const verticals = await client.execute("SELECT count(*) AS n FROM verticals");

      expect(clients.rows).toHaveLength(1);

      // Legacy "YYYY-MM-DD HH:MM:SS" timestamps are normalised to ISO 8601 (UTC).
      const stamped = await client.execute("SELECT created_at FROM clients WHERE id = 'c1'");
      expect(stamped.rows[0].created_at).toBe("2026-05-01T10:30:00.000Z");
      expect(logs.rows).toHaveLength(1);
      expect(Number(companies.rows[0].n)).toBe(0);
      expect(Number(verticals.rows[0].n)).toBe(8);
    } finally {
      client.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
