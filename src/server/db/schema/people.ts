import { index, pgTable, text } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";

const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

export const peopleKindValues = ["EMPLOYEE", "INTERN", "CONTRACTOR"] as const;

/** Team members who receive offer letters and salary slips. PAN and bank account are encrypted (AES-256-GCM). */
export const people = pgTable(
  "people",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    role: text("role").notNull().default(""),
    kind: text("kind").notNull().default("EMPLOYEE"),
    joinedOn: text("joined_on"),
    panEnc: text("pan_enc"),
    panLast4: text("pan_last4"),
    bankAccountEnc: text("bank_account_enc"),
    bankAccountLast4: text("bank_account_last4"),
    bankIfsc: text("bank_ifsc"),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_people_org").on(t.orgId)]
).enableRLS();
