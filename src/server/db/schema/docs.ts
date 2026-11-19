import { index, pgTable, text } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";
import { companies } from "./crm";
import { deals } from "./deals";

export const docTypeValues = ["SOP", "PLAYBOOK", "DECISION", "NOTE", "RESOURCE"] as const;
export type DocType = (typeof docTypeValues)[number];

export const docStatusValues = ["DRAFT", "IN_REVIEW", "PUBLISHED", "DEPRECATED"] as const;
export type DocStatus = (typeof docStatusValues)[number];

/** Internal knowledge base. Body is Markdown. A doc can be linked to a client and/or a lead. */
export const docs = pgTable(
  "docs",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    type: text("type").notNull().default("NOTE"),
    title: text("title").notNull(),
    status: text("status").notNull().default("DRAFT"),
    body: text("body").notNull().default(""),
    companyId: text("company_id").references(() => companies.id, { onDelete: "set null" }),
    dealId: text("deal_id").references(() => deals.id, { onDelete: "set null" }),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_docs_org_type").on(t.orgId, t.type),
    index("idx_docs_company").on(t.companyId),
    index("idx_docs_deal").on(t.dealId),
  ]
).enableRLS();
