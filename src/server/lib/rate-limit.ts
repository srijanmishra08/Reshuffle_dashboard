import { sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";

/**
 * Fixed-window counter in the database (Vercel has no shared memory).
 * Returns true when the call is allowed. One atomic upsert, so concurrent calls cannot undercount.
 */
export async function allowRequest(
  db: Db,
  key: string,
  opts: { limit: number; windowSeconds: number; now?: number }
): Promise<boolean> {
  const now = opts.now ?? Date.now();
  const windowMs = opts.windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const rows = await db
    .insert(schema.rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        windowStart,
        count: sql`CASE WHEN ${schema.rateLimits.windowStart} = ${windowStart} THEN ${schema.rateLimits.count} + 1 ELSE 1 END`,
      },
    })
    .returning({ count: schema.rateLimits.count });
  return (rows[0]?.count ?? 1) <= opts.limit;
}
