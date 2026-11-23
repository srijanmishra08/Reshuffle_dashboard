import { gzipSync, gunzipSync } from "node:zlib";
import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { supabaseStorage, type Storage } from "@/server/lib/storage";
import { chunk, orderTablesByForeignKeys, type ForeignKey } from "@/server/ops/copy-database";

/**
 * Database backups: every table in the `public` schema as JSON, gzipped into a private bucket, one file per
 * day, kept for 30 days. Restore reads such a file back. Short-lived login rows are left out because a
 * restored database should start with everyone signed out anyway.
 */
export const BACKUP_BUCKET = "db-backups";
export const BACKUP_PREFIX = "daily";
export const KEEP_DAYS = 30;
const SKIP_TABLES = new Set(["session", "verification", "rate_limits"]);

export type BackupFile = { version: 1; createdAt: string; tables: Record<string, Record<string, unknown>[]> };

function rowsOf<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function listTables(db: Db): Promise<string[]> {
  const rows = rowsOf<{ table_name: string }>(
    await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`)
  );
  return rows.map((r) => r.table_name).filter((t) => !SKIP_TABLES.has(t));
}

async function foreignKeys(db: Db): Promise<ForeignKey[]> {
  const rows = rowsOf<{ table: string; references: string }>(
    await db.execute(sql`
      select c.conrelid::regclass::text as "table", c.confrelid::regclass::text as "references"
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where c.contype = 'f' and n.nspname = 'public'`)
  );
  const clean = (s: string) => s.replace(/^"|"$/g, "");
  return rows.map((r) => ({ table: clean(r.table), references: clean(r.references) }));
}

/** Reads every table into one object. Fine at this size (a few thousand rows); revisit if it grows past memory. */
export async function createBackup(db: Db, now: Date = new Date()): Promise<BackupFile> {
  const tables: BackupFile["tables"] = {};
  for (const table of await listTables(db)) {
    const [row] = rowsOf<{ data: Record<string, unknown>[] | string }>(
      await db.execute(sql.raw(`select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as data from ${quote(table)} t`))
    );
    tables[table] = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
  }
  return { version: 1, createdAt: now.toISOString(), tables };
}

export function encodeBackup(backup: BackupFile): Buffer {
  return gzipSync(Buffer.from(JSON.stringify(backup)));
}

export function decodeBackup(file: Buffer): BackupFile {
  const parsed = JSON.parse(gunzipSync(file).toString("utf8")) as BackupFile;
  if (parsed.version !== 1 || typeof parsed.tables !== "object" || parsed.tables === null) throw new Error("Not a dashboard backup file");
  return parsed;
}

/** The file name for a day, `daily/2026-11-23.json.gz`. */
export function backupName(date: Date): string {
  return `${BACKUP_PREFIX}/${date.toISOString().slice(0, 10)}.json.gz`;
}

/** Files older than `keepDays` days, judged by the date in the name. Names that are not backups are never listed. */
export function expiredBackups(names: string[], now: Date, keepDays = KEEP_DAYS): string[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const cutoff = today - keepDays * 86_400_000;
  return names.filter((n) => {
    const m = /^(\d{4}-\d{2}-\d{2})\.json\.gz$/.exec(n);
    return m !== null && new Date(`${m[1]}T00:00:00Z`).getTime() < cutoff;
  });
}

/** Saves today's backup and deletes the ones past the retention window. */
export async function runBackup(db: Db, storage: Storage = supabaseStorage, now: Date = new Date()) {
  const backup = await createBackup(db, now);
  const body = encodeBackup(backup);
  await storage.put(BACKUP_BUCKET, backupName(now), body, "application/gzip");

  const old = expiredBackups(await storage.list(BACKUP_BUCKET, BACKUP_PREFIX), now);
  for (const name of old) await storage.remove(BACKUP_BUCKET, `${BACKUP_PREFIX}/${name}`);

  const rows = Object.values(backup.tables).reduce((n, r) => n + r.length, 0);
  return { file: backupName(now), bytes: body.length, tables: Object.keys(backup.tables).length, rows, removed: old.length };
}

/**
 * Replaces the contents of every table in the backup with the backup's rows, in one transaction (all or
 * nothing). Tables that exist now but not in the backup are left alone. The schema must match: apply the
 * same migrations first.
 */
export async function restoreBackup(db: Db, backup: BackupFile) {
  const names = Object.keys(backup.tables);
  const existing = new Set(await listTables(db));
  const unknown = names.filter((t) => !existing.has(t));
  if (unknown.length > 0) throw new Error(`The database has no table for: ${unknown.join(", ")}. Run the migrations first.`);

  const order = orderTablesByForeignKeys(names, await foreignKeys(db));
  await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`truncate ${names.map(quote).join(", ")} restart identity cascade`));
    for (const table of order) {
      for (const batch of chunk(backup.tables[table], 500)) {
        await tx.execute(sql`${sql.raw(`insert into ${quote(table)} select * from jsonb_populate_recordset(null::${quote(table)}, `)}${JSON.stringify(batch)}::jsonb)`);
      }
    }
  });
  return { tables: names.length, rows: names.reduce((n, t) => n + backup.tables[t].length, 0) };
}
