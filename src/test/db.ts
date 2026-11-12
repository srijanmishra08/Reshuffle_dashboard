import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/client";

/** Fresh migrated SQLite file database for a test file. Call `cleanup` in afterAll. */
export async function createTestDb(): Promise<{ db: Db; cleanup: () => void }> {
  const dir = mkdtempSync(join(tmpdir(), "reshuffle-test-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });

  return {
    db,
    cleanup: () => {
      client.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
