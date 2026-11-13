import { index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";
import { companies, verticals } from "./crm";

const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

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
    verticalId: text("vertical_id").references(() => verticals.id),
    engagementModel: text("engagement_model"),
    source: text("source"),
    referrer: text("referrer"),
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
