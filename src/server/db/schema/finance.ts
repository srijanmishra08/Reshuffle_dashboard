import { index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";

const createdAt = () => ts("created_at").notNull().defaultNow();

export const ledgerKindValues = ["INCOME", "EXPENSE"] as const;
export type LedgerKind = (typeof ledgerKindValues)[number];
export const ledgerSourceValues = ["MANUAL", "PAYMENT", "PAYOUT"] as const;
export type LedgerSource = (typeof ledgerSourceValues)[number];

export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("uq_expense_categories_org_name").on(t.orgId, t.name)]
).enableRLS();

/**
 * Money in and out. Amounts are positive integer paise; `kind` gives the direction.
 * Entries made automatically (invoice payments, later payouts) carry the source row id, and the
 * unique index on (org, source type, source id) makes writing them idempotent.
 */
export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    kind: text("kind").notNull(),
    entryDate: text("entry_date").notNull(), // YYYY-MM-DD
    amountPaise: integer("amount_paise").notNull(),
    categoryId: text("category_id").references(() => expenseCategories.id),
    description: text("description").notNull().default(""),
    companyId: text("company_id"),
    projectId: text("project_id"),
    sourceType: text("source_type").notNull().default("MANUAL"),
    sourceId: text("source_id"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_ledger_org_date").on(t.orgId, t.entryDate),
    uniqueIndex("uq_ledger_source").on(t.orgId, t.sourceType, t.sourceId),
  ]
).enableRLS();
