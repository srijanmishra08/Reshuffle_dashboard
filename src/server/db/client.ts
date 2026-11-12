import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { getTursoClient } from "@/lib/turso";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

let cached: Db | undefined;

export function getDb(): Db {
  if (!cached) {
    cached = drizzle(getTursoClient(), { schema });
  }
  return cached;
}

export { schema };
