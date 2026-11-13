import { boolean, index, pgTable, text } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";

export const contentStatusValues = ["IDEA", "DRAFT", "SCHEDULED", "POSTED"] as const;
export type ContentStatus = (typeof contentStatusValues)[number];
export const platformValues = ["Instagram", "LinkedIn", "YouTube", "X", "Facebook", "Other"] as const;

/** One row per brand or vertical account on a platform. */
export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    platform: text("platform").notNull(),
    handle: text("handle").notNull(),
    url: text("url"),
    /** Free text such as a vertical name, so no foreign key to verticals. */
    vertical: text("vertical"),
    notes: text("notes"),
    active: boolean("active").notNull().default(true),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_social_accounts_org").on(t.orgId)]
).enableRLS();

/** Content calendar. `scheduledDate` is a calendar day (`YYYY-MM-DD`). */
export const contentItems = pgTable(
  "content_items",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    accountId: text("account_id"),
    title: text("title").notNull(),
    platform: text("platform").notNull().default("Instagram"),
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
