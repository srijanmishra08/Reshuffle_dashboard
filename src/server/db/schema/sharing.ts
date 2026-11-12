import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { newId } from "@/lib/ids";
import { scopes } from "./scopes";

const createdAt = () => text("created_at").notNull().$defaultFn(() => new Date().toISOString());

/** Public links to a sent scope. Only the SHA-256 hash of the token is stored. */
export const scopeShares = sqliteTable(
  "scope_shares",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    scopeId: text("scope_id")
      .notNull()
      .references(() => scopes.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("uq_scope_shares_hash").on(t.tokenHash), index("idx_scope_shares_scope").on(t.scopeId)]
);

/** Evidence captured when a client accepts a scope through a public link. */
export const scopeAcceptances = sqliteTable(
  "scope_acceptances",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    scopeId: text("scope_id")
      .notNull()
      .references(() => scopes.id, { onDelete: "cascade" }),
    shareId: text("share_id")
      .notNull()
      .references(() => scopeShares.id),
    typedName: text("typed_name").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    acceptedAt: text("accepted_at").notNull(),
  },
  (t) => [uniqueIndex("uq_scope_acceptances_scope").on(t.scopeId)]
);

/** Fixed-window counters for unauthenticated endpoints. */
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull().default(0),
});
