import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { newId } from "@/lib/ids";
import { deals } from "./deals";

const createdAt = () => text("created_at").notNull().$defaultFn(() => new Date().toISOString());
const updatedAt = () => text("updated_at").notNull().$defaultFn(() => new Date().toISOString());

export const scopeStatusValues = ["DRAFT", "SENT", "ACCEPTED", "SUPERSEDED"] as const;
export type ScopeStatus = (typeof scopeStatusValues)[number];

/** Reusable building blocks (inventory, billing, CRM...) that seed scope items. */
export const modulesLibrary = sqliteTable(
  "modules_library",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    name: text("name").notNull(),
    category: text("category").notNull().default("General"),
    description: text("description"),
    defaultDeliverables: text("default_deliverables"),
    defaultDays: integer("default_days").notNull().default(0),
    defaultPricePaise: integer("default_price_paise").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_modules_org").on(t.orgId, t.active)]
);

/** A proposal for a deal. Sending freezes a version; editing afterwards creates v+1. */
export const scopes = sqliteTable(
  "scopes",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("DRAFT"),
    title: text("title").notNull(),
    problemStatement: text("problem_statement").notNull().default(""),
    engagementModel: text("engagement_model"),
    /** JSON array of { label, percent }; percents sum to 100. */
    paymentScheduleJson: text("payment_schedule_json").notNull().default("[]"),
    terms: text("terms").notNull().default(""),
    totalPaise: integer("total_paise").notNull().default(0),
    timelineDays: integer("timeline_days").notNull().default(0),
    number: text("number"),
    fy: text("fy"),
    sendKey: text("send_key"),
    snapshotJson: text("snapshot_json"),
    sentAt: text("sent_at"),
    acceptedAt: text("accepted_at"),
    acceptedBy: text("accepted_by"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_scopes_deal").on(t.dealId),
    uniqueIndex("uq_scopes_deal_version").on(t.dealId, t.version),
    uniqueIndex("uq_scopes_org_number").on(t.orgId, t.number),
  ]
);

export const scopeItems = sqliteTable(
  "scope_items",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    scopeId: text("scope_id")
      .notNull()
      .references(() => scopes.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    phase: text("phase").notNull().default("Phase 1"),
    moduleId: text("module_id").references(() => modulesLibrary.id),
    title: text("title").notNull(),
    description: text("description"),
    days: integer("days").notNull().default(0),
    pricePaise: integer("price_paise").notNull().default(0),
  },
  (t) => [index("idx_scope_items_scope").on(t.scopeId, t.position)]
);
