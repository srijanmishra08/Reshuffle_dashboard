import { gzipSync } from "node:zlib";
import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import type { BackupStore } from "@/server/lib/storage";

export const BACKUP_BUCKET = "db-backups";
export const BACKUP_PREFIX = "daily";
export const KEEP_DAYS = 30;

/** Tables that are never backed up: live sign-in sessions, one-time tokens and OAuth tokens. People sign in again after a restore. */
export const SKIPPED_TABLES = ["session", "verification", "account"];

export function backupFileName(now: Date): string {
  return `${now.toISOString().slice(0, 10)}.json.gz`;
}

/** Names older than the retention window, judged by the date in the file name (so unrelated files are never touched). */
export function expiredBackups(names: string[], now: Date, keepDays = KEEP_DAYS): string[] {
  const cutoff = now.getTime() - keepDays * 86_400_000;
  return names.filter((n) => {
    const m = /^(\d{4}-\d{2}-\d{2})\.json\.gz$/.exec(n);
    return m ? new Date(`${m[1]}T00:00:00Z`).getTime() < cutoff : false;
  });
}

/** postgres-js returns an array, PGlite an object with `rows`; accept both. */
function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows: T[] }).rows ?? []);
}

/** Reads every table in the public schema as JSON rows. */
export async function dumpDatabase(db: Db): Promise<Record<string, unknown[]>> {
  const tables = rowsOf<{ table_name: string }>(
    await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`),
  );
  const out: Record<string, unknown[]> = {};
  for (const { table_name } of tables) {
    if (SKIPPED_TABLES.includes(table_name)) continue;
    const rows = rowsOf<{ row: unknown }>(await db.execute(sql`select to_jsonb(t) as row from ${sql.identifier(table_name)} t`));
    out[table_name] = rows.map((r) => r.row);
  }
  return out;
}

export type BackupSummary = { file: string; tables: number; rows: number; bytes: number; pruned: number };

/** Writes today's compressed dump to the private backup bucket and deletes dumps older than 30 days. */
export async function runBackup(db: Db, store: BackupStore, now = new Date()): Promise<BackupSummary> {
  const data = await dumpDatabase(db);
  const rows = Object.values(data).reduce((n, r) => n + r.length, 0);
  const body = gzipSync(Buffer.from(JSON.stringify({ takenAt: now.toISOString(), skipped: SKIPPED_TABLES, tables: data })));
  const file = backupFileName(now);

  await store.ensureBucket(BACKUP_BUCKET);
  await store.put(BACKUP_BUCKET, `${BACKUP_PREFIX}/${file}`, body, "application/gzip");

  let pruned = 0;
  for (const name of expiredBackups(await store.list(BACKUP_BUCKET, BACKUP_PREFIX), now)) {
    await store.remove(BACKUP_BUCKET, `${BACKUP_PREFIX}/${name}`);
    pruned++;
  }
  return { file, tables: Object.keys(data).length, rows, bytes: body.length, pruned };
}
