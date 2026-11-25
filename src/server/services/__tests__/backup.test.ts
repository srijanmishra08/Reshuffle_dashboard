import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";
import type { BackupStore } from "@/server/lib/storage";
import { createCompany } from "../companies";
import { BACKUP_BUCKET, backupFileName, dumpDatabase, expiredBackups, runBackup } from "../backup";

let db: Db;
let cleanup: () => void;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await createCompany(db, { orgId: "default", userId: "u" }, { name: "Backup Test Co" } as never);
});
afterAll(() => cleanup());

function fakeStore(existing: string[] = []) {
  const files = new Map<string, Buffer>(existing.map((n) => [`daily/${n}`, Buffer.from("x")]));
  const store: BackupStore = {
    async ensureBucket() {},
    async put(_b, path, body) { files.set(path, body); },
    async list() { return [...files.keys()].map((k) => k.replace("daily/", "")); },
    async remove(_b, path) { files.delete(path); },
  };
  return { store, files };
}

describe("backup", () => {
  it("names files by date and expires only old dated files", () => {
    const now = new Date("2026-12-01T03:00:00Z");
    expect(backupFileName(now)).toBe("2026-12-01.json.gz");
    expect(expiredBackups(["2026-10-01.json.gz", "2026-11-20.json.gz", "notes.txt"], now)).toEqual(["2026-10-01.json.gz"]);
  });

  it("dumps tables but never sessions or tokens", async () => {
    const dump = await dumpDatabase(db);
    expect(dump.companies.length).toBe(1);
    for (const t of ["session", "verification", "account"]) expect(dump[t]).toBeUndefined();
  });

  it("writes a readable gzip dump and prunes old ones", async () => {
    const { store, files } = fakeStore(["2026-01-01.json.gz"]);
    const summary = await runBackup(db, store, new Date("2026-11-25T03:00:00Z"));
    expect(summary.pruned).toBe(1);
    expect(files.has("daily/2026-01-01.json.gz")).toBe(false);
    const parsed = JSON.parse(gunzipSync(files.get("daily/2026-11-25.json.gz")!).toString());
    expect(parsed.tables.companies[0].name).toBe("Backup Test Co");
    expect(BACKUP_BUCKET).toBe("db-backups");
  });
});
