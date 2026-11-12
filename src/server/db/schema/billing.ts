import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { newId } from "@/lib/ids";
import { companies } from "./crm";

const id = () => text("id").primaryKey().$defaultFn(newId);
const orgId = () => text("org_id").notNull().default("default");
const createdAt = () => text("created_at").notNull().$defaultFn(() => new Date().toISOString());
const updatedAt = () => text("updated_at").notNull().$defaultFn(() => new Date().toISOString());

export const invoiceStatusValues = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "CANCELLED",
] as const;
export type InvoiceStatus = (typeof invoiceStatusValues)[number];

export const paymentMethodValues = ["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "CARD", "OTHER"] as const;
export type PaymentMethod = (typeof paymentMethodValues)[number];

/** All money columns are integer paise. */
export const invoices = sqliteTable(
  "invoices",
  {
    id: id(),
    orgId: orgId(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    dealId: text("deal_id"),
    projectId: text("project_id"),
    status: text("status").notNull().default("DRAFT"),
    /** Assigned only at issue, inside the issuing transaction. */
    number: text("number"),
    fy: text("fy"),
    issueDate: text("issue_date"), // YYYY-MM-DD
    dueDate: text("due_date"), // YYYY-MM-DD
    placeOfSupply: text("place_of_supply").notNull().default(""),
    taxMode: text("tax_mode").notNull().default("INTRA"), // INTRA | INTER
    rateBps: integer("rate_bps").notNull().default(1800),
    subtotalPaise: integer("subtotal_paise").notNull().default(0),
    cgstPaise: integer("cgst_paise").notNull().default(0),
    sgstPaise: integer("sgst_paise").notNull().default(0),
    igstPaise: integer("igst_paise").notNull().default(0),
    roundOffPaise: integer("round_off_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull().default(0),
    paidPaise: integer("paid_paise").notNull().default(0),
    notes: text("notes"),
    terms: text("terms"),
    /** Idempotency key of the request that issued this invoice. */
    issueKey: text("issue_key"),
    /** Frozen copy of everything the PDF needs. Set at issue, never edited. */
    snapshotJson: text("snapshot_json"),
    issuedAt: text("issued_at"),
    overdueAt: text("overdue_at"),
    cancelledAt: text("cancelled_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_invoices_org_status").on(t.orgId, t.status),
    index("idx_invoices_company").on(t.companyId),
    uniqueIndex("uq_invoices_org_number").on(t.orgId, t.number),
  ]
);

export const invoiceItems = sqliteTable(
  "invoice_items",
  {
    id: id(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    sacCode: text("sac_code"),
    quantity: integer("quantity").notNull().default(1),
    ratePaise: integer("rate_paise").notNull().default(0),
    amountPaise: integer("amount_paise").notNull().default(0),
    taxable: integer("taxable", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("idx_invoice_items_invoice").on(t.invoiceId, t.position)]
);

export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    orgId: orgId(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    amountPaise: integer("amount_paise").notNull(),
    paidAt: text("paid_at").notNull(), // YYYY-MM-DD
    method: text("method").notNull().default("BANK_TRANSFER"),
    reference: text("reference"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("idx_payments_invoice").on(t.invoiceId)]
);

export const creditNotes = sqliteTable(
  "credit_notes",
  {
    id: id(),
    orgId: orgId(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    number: text("number").notNull(),
    fy: text("fy").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    reason: text("reason").notNull(),
    issuedAt: text("issued_at").notNull(),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    index("idx_credit_notes_invoice").on(t.invoiceId),
    uniqueIndex("uq_credit_notes_org_number").on(t.orgId, t.number),
  ]
);
