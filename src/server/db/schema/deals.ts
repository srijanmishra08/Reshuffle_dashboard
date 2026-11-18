import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";
import { companies } from "./crm";

const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

/**
 * A source of leads: a sales staff member, freelancer, agency or individual who refers clients.
 * `freelancerId`, `agencyId` and `userId` optionally point at the matching record (plain text, no foreign key,
 * so this file does not depend on the team tables).
 */
export const salesNodes = pgTable(
  "sales_nodes",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("INDIVIDUAL"),
    phone: text("phone"),
    email: text("email"),
    /** Referral commission in basis points of the accepted deal value (1000 = 10%). 0 means none agreed. */
    commissionBps: integer("commission_bps").notNull().default(0),
    notes: text("notes"),
    userId: text("user_id"),
    freelancerId: text("freelancer_id"),
    agencyId: text("agency_id"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_sales_nodes_org_name").on(t.orgId, sql`lower(${t.name})`), index("idx_sales_nodes_org_kind").on(t.orgId, t.kind)]
).enableRLS();

export const deals = pgTable(
  "deals",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    title: text("title").notNull(),
    stage: text("stage").notNull().default("LEAD"),
    valuePaise: integer("value_paise").notNull().default(0),
    engagementModel: text("engagement_model"),
    source: text("source"),
    referrer: text("referrer"),
    /** The sales node that brought this lead. `source` and `referrer` keep its kind and name as text. */
    salesNodeId: text("sales_node_id").references(() => salesNodes.id, { onDelete: "set null" }),
    quotationStatus: text("quotation_status").notNull().default("NONE"),
    currentBlock: text("current_block"),
    temperature: text("temperature"),
    lostReason: text("lost_reason"),
    /** Calendar days, `YYYY-MM-DD`. */
    expectedClose: text("expected_close"),
    nextFollowUp: text("next_follow_up"),
    ownerId: text("owner_id"),
    externalId: text("external_id"),
    closedAt: ts("closed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_deals_org_stage").on(t.orgId, t.stage),
    index("idx_deals_company").on(t.companyId),
    index("idx_deals_sales_node").on(t.salesNodeId),
  ]
).enableRLS();

export const dealStageHistory = pgTable(
  "deal_stage_history",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    fromStage: text("from_stage"),
    toStage: text("to_stage").notNull(),
    note: text("note"),
    changedBy: text("changed_by"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("idx_deal_history_deal").on(t.dealId)]
).enableRLS();

/** One answer from the discovery call (8 levels x 5 buckets). */
export const diagnoses = pgTable(
  "diagnoses",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    bucket: text("bucket").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull().default(""),
    painScore: integer("pain_score").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_diagnoses_deal").on(t.dealId)]
).enableRLS();
