import { index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";
import { invoices } from "./billing";

/**
 * Keys that let another tool, such as the invoice software, send documents to the dashboard. A key can only
 * upload; it cannot read anything. Only a hash is stored, so the key is shown once when it is made.
 */
export const ingestKeys = pgTable(
  "ingest_keys",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    label: text("label").notNull(),
    tokenHash: text("token_hash").notNull(),
    /** The first characters of the key, so people can tell keys apart in a list. */
    prefix: text("prefix").notNull(),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
  },
  (t) => [uniqueIndex("uq_ingest_keys_hash").on(t.tokenHash)]
).enableRLS();

export const uploadedDocTypeValues = ["INVOICE", "WORK_ORDER"] as const;
export type UploadedDocType = (typeof uploadedDocTypeValues)[number];

/** A PDF generated in the invoice software and saved here. The file lives in private storage under `blobKey` (`bucket/path`). */
export const uploadedDocuments = pgTable(
  "uploaded_documents",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    source: text("source").notNull().default("invoice-site"),
    docType: text("doc_type").notNull(),
    number: text("number").notNull().default(""),
    partyName: text("party_name").notNull().default(""),
    amountPaise: integer("amount_paise"),
    /** Calendar day, `YYYY-MM-DD`, when the date typed in the software could be read. */
    documentDate: text("document_date"),
    filename: text("filename").notNull(),
    blobKey: text("blob_key").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    /** What the software sent about the invoice: client, line items and so on. Used to record it as a dashboard invoice. */
    details: jsonb("details").$type<Record<string, unknown>>(),
    /** Why the invoice was not recorded automatically, as a short code, or null. */
    recordNote: text("record_note"),
    /** The dashboard invoice with the same number, when there is one. */
    invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    keyId: text("key_id").references(() => ingestKeys.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_uploaded_documents_hash").on(t.orgId, t.sha256), index("idx_uploaded_documents_org_created").on(t.orgId, t.createdAt)]
).enableRLS();
