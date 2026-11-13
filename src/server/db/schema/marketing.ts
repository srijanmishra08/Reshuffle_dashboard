import { index, pgTable, text } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";
import { verticals } from "./crm";

export const contentStatusValues = ["IDEA", "DRAFT", "SCHEDULED", "POSTED"] as const;
export const platformValues = ["Instagram", "LinkedIn", "YouTube", "X", "Facebook"] as const;

/** One social account per platform, optionally tied to a vertical. */
export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    platform: text("platform").notNull(),
    handle: text("handle").notNull(),
    verticalId: text("vertical_id").references(() => verticals.id),
    notes: text("notes"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_social_accounts_org").on(t.orgId)]
).enableRLS();

/** A planned or published piece of content. `publishDate` is a calendar day (`YYYY-MM-DD`). */
export const contentItems = pgTable(
  "content_items",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    accountId: text("account_id").references(() => socialAccounts.id),
    title: text("title").notNull(),
    script: text("script"),
    status: text("status").notNull().default("IDEA"),
    publishDate: text("publish_date"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_content_items_org_date").on(t.orgId, t.publishDate)]
).enableRLS();
