import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { newId } from "@/lib/ids";
import { companies } from "./crm";

const createdAt = () => text("created_at").notNull().$defaultFn(() => new Date().toISOString());
const updatedAt = () => text("updated_at").notNull().$defaultFn(() => new Date().toISOString());

export const letterStatusValues = ["DRAFT", "ISSUED"] as const;
export type LetterStatus = (typeof letterStatusValues)[number];

/** Free-text letters on letterhead. The number is assigned at issue and the snapshot is frozen. */
export const letters = sqliteTable(
  "letters",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    companyId: text("company_id").references(() => companies.id),
    status: text("status").notNull().default("DRAFT"),
    number: text("number"),
    fy: text("fy"),
    recipientName: text("recipient_name").notNull().default(""),
    recipientAddress: text("recipient_address"),
    subject: text("subject").notNull().default(""),
    body: text("body").notNull().default(""),
    issueDate: text("issue_date"),
    issueKey: text("issue_key"),
    snapshotJson: text("snapshot_json"),
    issuedAt: text("issued_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_letters_org_status").on(t.orgId, t.status),
    uniqueIndex("uq_letters_org_number").on(t.orgId, t.number),
  ]
);
