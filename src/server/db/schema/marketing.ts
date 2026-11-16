import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";
import { verticals } from "./crm";

export const platformValues = ["INSTAGRAM", "LINKEDIN", "YOUTUBE", "FACEBOOK", "X", "WHATSAPP", "OTHER"] as const;
export type Platform = (typeof platformValues)[number];
export const contentStatusValues = ["IDEA", "DRAFT", "SCHEDULED", "PUBLISHED"] as const;
export type ContentStatus = (typeof contentStatusValues)[number];

/** One row per social account (usually one per vertical and platform). */
export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    platform: text("platform").notNull(),
    handle: text("handle").notNull(),
    verticalId: text("vertical_id").references(() => verticals.id),
    plan: text("plan"),
    active: text("active").notNull().default("true"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_social_accounts_org_platform_handle").on(t.orgId, t.platform, t.handle)]
).enableRLS();

/** A planned or published post. `scheduledDate` is a calendar day (`YYYY-MM-DD`). */
export const contentItems = pgTable(
  "content_items",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    accountId: text("account_id").references(() => socialAccounts.id),
    title: text("title").notNull(),
    caption: text("caption"),
    status: text("status").notNull().default("IDEA"),
    scheduledDate: text("scheduled_date"),
    postUrl: text("post_url"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_content_items_org_date").on(t.orgId, t.scheduledDate)]
).enableRLS();
