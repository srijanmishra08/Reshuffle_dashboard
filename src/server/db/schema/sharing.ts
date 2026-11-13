import { bigint, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";
import { scopes } from "./scopes";

const createdAt = () => ts("created_at").notNull().defaultNow();

/** Public links to a sent scope. Only the SHA-256 hash of the token is stored. */
export const scopeShares = pgTable(
  "scope_shares",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    scopeId: text("scope_id")
      .notNull()
      .references(() => scopes.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("uq_scope_shares_hash").on(t.tokenHash), index("idx_scope_shares_scope").on(t.scopeId)]
).enableRLS();

/** Evidence captured when a client accepts a scope through a public link. */
export const scopeAcceptances = pgTable(
  "scope_acceptances",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    scopeId: text("scope_id")
      .notNull()
      .references(() => scopes.id, { onDelete: "cascade" }),
    shareId: text("share_id")
      .notNull()
      .references(() => scopeShares.id),
    typedName: text("typed_name").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    acceptedAt: ts("accepted_at").notNull(),
  },
  (t) => [uniqueIndex("uq_scope_acceptances_scope").on(t.scopeId)]
).enableRLS();

/** Fixed-window counters for unauthenticated endpoints. `window_start` is epoch milliseconds. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: bigint("window_start", { mode: "number" }).notNull(),
  count: integer("count").notNull().default(0),
}).enableRLS();
