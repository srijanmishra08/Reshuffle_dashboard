import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/server/db/schema";
import type { Db } from "../src/server/db/client";
import { decodeBackup, restoreBackup } from "../src/server/services/backup";

/**
 * Restores a backup file (downloaded from the private `db-backups` bucket) into the database named by
 * DIRECT_URL. Without `--yes` it only reads the file and says what it would do.
 *
 *   npx tsx --env-file=.env scripts/restore-backup.ts ~/Downloads/2026-11-23.json.gz
 *   npx tsx --env-file=.env scripts/restore-backup.ts ~/Downloads/2026-11-23.json.gz --yes
 *
 * It REPLACES the contents of every table in the file, in one transaction. Apply the migrations first
 * (`npm run db:migrate`) so the schema matches. See docs/RUNBOOK.md before running it on production.
 */
async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!file) throw new Error("Usage: restore-backup.ts <backup-file.json.gz> [--yes]");

  const backup = decodeBackup(readFileSync(file));
  const rows = Object.values(backup.tables).reduce((n, r) => n + r.length, 0);
  console.log(`Backup taken ${backup.createdAt}: ${Object.keys(backup.tables).length} tables, ${rows} rows.`);

  if (!process.argv.includes("--yes")) {
    console.log("Dry run. Nothing was changed. Add --yes to replace the database contents with this backup.");
    return;
  }

  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("DIRECT_URL is required (the session pooler or direct connection, not the transaction pooler)");
  const client = postgres(url, { max: 1, ssl: "require" });
  try {
    const result = await restoreBackup(drizzle(client, { schema }) as unknown as Db, backup);
    console.log(`Restored ${result.rows} rows into ${result.tables} tables.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
