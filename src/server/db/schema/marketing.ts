import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";
import { verticals } from "./crm";

export const contentStatusValues = ["IDEA", "DRAFT", "SCHEDULED", "POSTED"] as const;
export type ContentStatus = (typeof contentStatusValues)[number];
export const platformValues = ["Instagram", "LinkedIn", "YouTube", "X", "Facebook", "WhatsApp", "Other"] as const;

/** One social handle per vertical and platform. */
export const socialAccounts = pgTable(
  "social_accounts",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    verticalId: text("vertical_id").references(() => verticals.id),
    platform: text("platform").notNull(),
    handle: text("handle").notNull(),
    url: text("url"),
    notes: text("notes"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_social_accounts_org_platform_handle").on(t.orgId, t.platform, t.handle)]
).enableRLS();

/** A planned or published post. `publishDate` is a calendar day (`YYYY-MM-DD`). */
export const contentItems = pgTable(
  "content_items",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    accountId: text("account_id").references(() => socialAccounts.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    script: text("script"),
    platform: text("platform").notNull(),
    status: text("status").notNull().default("IDEA"),
    publishDate: text("publish_date").notNull(),
    postUrl: text("post_url"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_content_items_org_date").on(t.orgId, t.publishDate)]
).enableRLS();
