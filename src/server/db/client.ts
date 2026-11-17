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
 *
 * The client is created once per server instance and reused for every request, in production as well
 * as in development. It must never be created per call: each new client opens its own TCP and TLS
 * connection to the pooler and was never closed, so under load the pooler ran out of connections and
 * queries waited until they were cancelled.
 *
 * `max` lets the queries of one request run side by side. `idle_timeout` returns idle connections to the
 * pooler quickly so a quiet instance holds none, and `connect_timeout` makes an unreachable database
 * fail in seconds instead of hanging the request.
 */
export function getDb(): Db {
  if (global.dbInstance) {
    return global.dbInstance;
  }

  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }

  global.dbInstance = drizzle(
    postgres(url, { prepare: false, max: 4, idle_timeout: 20, connect_timeout: 10, max_lifetime: 60 * 30, ssl: "require" }),
    { schema }
  );

  return global.dbInstance;
}

export { schema };
