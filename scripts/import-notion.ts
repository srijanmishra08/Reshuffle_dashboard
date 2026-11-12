/**
 * Usage:
 *   npx tsx scripts/import-notion.ts <export-dir> [--only=clients,products,meetings] [--dry-run]
 *
 * <export-dir> is an unzipped Notion "Markdown & CSV" export kept OUTSIDE this repo.
 * CSV files are found by name: any file whose name contains "client", "product" or "meeting"
 * (case-insensitive). Re-running is safe; rows are keyed on a stable external_id.
 * Prints counts and row numbers only, never names or contact details.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/server/db/schema";
import { importNotion, type ImportInput, type ImportKind } from "../src/server/import/notion";

const kinds: ImportKind[] = ["clients", "products", "meetings"];

function findCsvs(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return findCsvs(full);
    return entry.toLowerCase().endsWith(".csv") ? [full] : [];
  });
}

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((arg) => !arg.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const only = args.find((arg) => arg.startsWith("--only="))?.slice(7).split(",") ?? kinds;

  if (!dir) {
    throw new Error("Pass the path to the unzipped Notion export directory.");
  }
  if (resolve(dir).startsWith(resolve(process.cwd()))) {
    throw new Error("Keep the Notion export outside this repository (it contains client data).");
  }
  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DIRECT_URL or DATABASE_URL is required (use --dry-run first).");
  }

  const csvs = findCsvs(resolve(dir));
  const input: ImportInput = {};

  for (const kind of kinds) {
    if (!only.includes(kind)) continue;
    const needle = kind.slice(0, -1); // client, product, meeting
    // Prefer the "_all" export when Notion produced both.
    const matches = csvs.filter((file) => file.toLowerCase().includes(needle)).sort((a, b) => Number(/_all/i.test(b)) - Number(/_all/i.test(a)));
    if (matches[0]) {
      input[kind] = readFileSync(matches[0], "utf8");
    } else {
      console.warn(`No CSV found for ${kind}`);
    }
  }

  const client = postgres(databaseUrl, { max: 1, ssl: "require" });
  const report = await importNotion(drizzle(client, { schema }), input, { dryRun });

  console.log(dryRun ? "DRY RUN (nothing written)" : "IMPORT COMPLETE");
  for (const kind of kinds) {
    const r = report[kind];
    console.log(`${kind}: created ${r.created}, updated ${r.updated}, skipped ${r.skipped}`);
    r.warnings.forEach((warning) => console.log(`  - ${warning}`));
  }
  await client.end();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
