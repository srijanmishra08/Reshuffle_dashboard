import { boolean, index, pgTable, text } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";
import { verticals } from "./crm";

export const contentStatusValues = ["IDEA", "DRAFT", "SCHEDULED", "PUBLISHED"] as const;
export type ContentStatus = (typeof contentStatusValues)[number];
export const platformValues = ["INSTAGRAM", "LINKEDIN", "YOUTUBE", "X", "FACEBOOK", "OTHER"] as const;

/** One social account per vertical and platform. `handle` is public, never a credential. */
export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    verticalId: text("vertical_id").references(() => verticals.id),
    platform: text("platform").notNull(),
    handle: text("handle").notNull(),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_social_accounts_org").on(t.orgId)]
).enableRLS();

/** A planned or published post. `scheduledDate` is a calendar day (`YYYY-MM-DD`). */
export const contentItems = pgTable(
  "content_items",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    accountId: text("account_id").references(() => socialAccounts.id),
    title: text("title").notNull(),
    status: text("status").notNull().default("IDEA"),
    scheduledDate: text("scheduled_date"),
    caption: text("caption"),
    link: text("link"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_content_items_org_date").on(t.orgId, t.scheduledDate)]
).enableRLS();
