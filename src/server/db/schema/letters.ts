import { index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";
import { companies } from "./crm";

const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

export const letterStatusValues = ["DRAFT", "ISSUED"] as const;
export type LetterStatus = (typeof letterStatusValues)[number];

/** Free-text letters on letterhead. The number is assigned at issue and the snapshot is frozen. */
export const letters = pgTable(
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
    /** Calendar day, `YYYY-MM-DD` in India time. */
    issueDate: text("issue_date"),
    issueKey: text("issue_key"),
    snapshotJson: jsonb("snapshot_json").$type<Record<string, unknown>>(),
    issuedAt: ts("issued_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_letters_org_status").on(t.orgId, t.status),
    uniqueIndex("uq_letters_org_number").on(t.orgId, t.number),
  ]
).enableRLS();
