import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";
import { createCompany } from "../companies";
import type { Storage } from "@/server/lib/storage";
import { backupName, createBackup, decodeBackup, encodeBackup, expiredBackups, restoreBackup, runBackup } from "../backup";

const ctx = { orgId: "default", userId: "user-1" };
let db: Db;
let cleanup: () => void;

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function rowsOf<T>(result: unknown): T[] {
  return ((result as { rows?: T[] }).rows ?? (result as T[])) as T[];
}

async function companyNames(): Promise<string[]> {
  return rowsOf<{ name: string }>(await db.execute(sql`select name from companies order by name`)).map((r) => r.name);
}

function fakeStorage() {
  const files = new Map<string, Buffer>();
  const storage: Storage = {
    async put(bucket, path, body) {
      files.set(`${bucket}/${path}`, body);
    },
    async get(bucket, path) {
      return files.get(`${bucket}/${path}`) ?? null;
    },
    async remove(bucket, path) {
      files.delete(`${bucket}/${path}`);
    },
    async list(bucket, prefix) {
      return [...files.keys()].filter((k) => k.startsWith(`${bucket}/${prefix}/`)).map((k) => k.slice(`${bucket}/${prefix}/`.length));
    },
  };
  return { storage, files };
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  must(await createCompany(db, ctx, { name: "Fake Dairy Co" }));
  must(await createCompany(db, ctx, { name: "Fake Bakery, \"Quoted\" ₹ Ltd" }));
});
afterAll(() => cleanup());

describe("backup file names", () => {
  it("names a file by day and expires only backups older than 30 days", () => {
    expect(backupName(new Date("2026-11-23T20:30:00Z"))).toBe("daily/2026-11-23.json.gz");
    const names = ["2026-10-01.json.gz", "2026-10-23.json.gz", "2026-10-24.json.gz", "2026-11-23.json.gz", "notes.txt"];
    expect(expiredBackups(names, new Date("2026-11-23T20:30:00Z"))).toEqual(["2026-10-01.json.gz", "2026-10-23.json.gz"]);
  });
});

describe("backup and restore", () => {
  it("leaves out login sessions and keeps the other tables", async () => {
    const backup = await createBackup(db);
    expect(backup.tables.companies).toHaveLength(2);
    expect(backup.tables).not.toHaveProperty("session");
    expect(backup.tables).not.toHaveProperty("rate_limits");
  });

  it("round-trips through gzip and rejects other files", async () => {
    const backup = await createBackup(db);
    expect(decodeBackup(encodeBackup(backup)).tables.companies).toEqual(backup.tables.companies);
    const bad = encodeBackup({ version: 2 } as never);
    expect(() => decodeBackup(bad)).toThrow(/Not a dashboard backup/);
  });

  it("restores the saved rows and removes what was added after the backup", async () => {
    const backup = decodeBackup(encodeBackup(await createBackup(db)));
    const before = await companyNames();
    must(await createCompany(db, ctx, { name: "Added After Backup" }));
    await db.execute(sql`delete from companies where name = 'Fake Dairy Co'`);

    const result = await restoreBackup(db, backup);

    expect(result.rows).toBeGreaterThanOrEqual(2);
    expect(await companyNames()).toEqual(before);
  });

  it("refuses a backup with a table the database does not have, and changes nothing", async () => {
    const before = await companyNames();
    await expect(restoreBackup(db, { version: 1, createdAt: "x", tables: { companies: [], not_a_table: [] } })).rejects.toThrow(/not_a_table/);
    expect(await companyNames()).toEqual(before);
  });

  it("rolls back when a row cannot be restored", async () => {
    const before = await companyNames();
    const backup = await createBackup(db);
    backup.tables.companies = [{ ...backup.tables.companies[0], id: null }];
    await expect(restoreBackup(db, backup)).rejects.toThrow();
    expect(await companyNames()).toEqual(before);
  });
});

describe("runBackup", () => {
  it("saves today's file and prunes only the expired ones", async () => {
    const { storage, files } = fakeStorage();
    files.set("db-backups/daily/2026-09-01.json.gz", Buffer.from("old"));
    files.set("db-backups/daily/2026-11-20.json.gz", Buffer.from("recent"));

    const now = new Date("2026-11-23T20:30:00Z");
    const result = await runBackup(db, storage, now);

    expect(result).toMatchObject({ file: "daily/2026-11-23.json.gz", removed: 1 });
    expect([...files.keys()].sort()).toEqual(["db-backups/daily/2026-11-20.json.gz", "db-backups/daily/2026-11-23.json.gz"]);
    const saved = decodeBackup(files.get("db-backups/daily/2026-11-23.json.gz")!);
    expect(saved.tables.companies).toHaveLength(2);
  });
});
