import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/server/db/schema";
import type { Db } from "@/server/db/client";

/** Fresh in-memory Postgres (PGlite) with every migration applied. Call `cleanup` in afterAll. */
export async function createTestDb(): Promise<{ db: Db; cleanup: () => void }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });

  return {
    db: db as unknown as Db,
    cleanup: () => {
      void client.close();
    },
  };
}
