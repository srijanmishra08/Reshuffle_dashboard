import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Works for postgres-js (runtime) and PGlite (tests). */
export type Db = PgDatabase<PostgresJsQueryResultHKT, typeof schema>;

declare global {
  var dbInstance: Db | undefined;
}

/**
 * Runtime connection through the Supabase transaction pooler (`DATABASE_URL`, port 6543).
 * Transaction pooling does not support prepared statements, hence `prepare: false`.
 * One connection per serverless instance; the pooler fans connections in.
 */
export function getDb(): Db {
  if (global.dbInstance) {
    return global.dbInstance;
  }

  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  const db = drizzle(postgres(url, { prepare: false, max: 1, ssl: "require" }), { schema });

  if (process.env.NODE_ENV !== "production") {
    global.dbInstance = db;
  }

  return db;
}

export { schema };
