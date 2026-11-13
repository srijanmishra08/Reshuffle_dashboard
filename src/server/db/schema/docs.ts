import { index, pgTable, text } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";

export const docTypeValues = ["SOP", "PLAYBOOK", "DECISION", "NOTE", "RESOURCE"] as const;
export type DocType = (typeof docTypeValues)[number];

/** Internal knowledge base. Body is Markdown. */
export const docs = pgTable(
  "docs",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    type: text("type").notNull().default("NOTE"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_docs_org_type").on(t.orgId, t.type)]
).enableRLS();
