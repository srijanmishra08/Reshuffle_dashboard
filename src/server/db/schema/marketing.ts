import { index, pgTable, text } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";
import { verticals } from "./crm";

export const contentStatusValues = ["IDEA", "DRAFT", "SCHEDULED", "PUBLISHED"] as const;
export type ContentStatus = (typeof contentStatusValues)[number];
export const platformValues = ["INSTAGRAM", "LINKEDIN", "YOUTUBE", "X", "WHATSAPP", "OTHER"] as const;

/** One social account per platform, optionally tied to a vertical. */
export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    platform: text("platform").notNull(),
    handle: text("handle").notNull(),
    url: text("url"),
    verticalId: text("vertical_id").references(() => verticals.id),
    notes: text("notes"),
    archivedAt: ts("archived_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_social_accounts_org").on(t.orgId)]
).enableRLS();

/** Content calendar entry. `publishDate` is a calendar day (`YYYY-MM-DD`). */
export const contentItems = pgTable(
  "content_items",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    accountId: text("account_id").references(() => socialAccounts.id),
    title: text("title").notNull(),
    platform: text("platform").notNull(),
    status: text("status").notNull().default("IDEA"),
    publishDate: text("publish_date"),
    caption: text("caption"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_content_items_org_date").on(t.orgId, t.publishDate)]
).enableRLS();
