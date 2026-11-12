import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { newId } from "@/lib/ids";
import { people } from "./people";

const createdAt = () => text("created_at").notNull().$defaultFn(() => new Date().toISOString());
const updatedAt = () => text("updated_at").notNull().$defaultFn(() => new Date().toISOString());

export const salarySlipStatusValues = ["DRAFT", "ISSUED"] as const;

/** Monthly pay slip for a team member. ADMIN only. The snapshot holds masked PAN and bank digits, never the full values. */
export const salarySlips = sqliteTable(
  "salary_slips",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    personId: text("person_id")
      .notNull()
      .references(() => people.id),
    /** YYYY-MM */
    payPeriod: text("pay_period").notNull(),
    payDate: text("pay_date"),
    status: text("status").notNull().default("DRAFT"),
    /** JSON arrays of { label, amountPaise }. */
    earningsJson: text("earnings_json").notNull().default("[]"),
    deductionsJson: text("deductions_json").notNull().default("[]"),
    grossPaise: integer("gross_paise").notNull().default(0),
    deductionsPaise: integer("deductions_paise").notNull().default(0),
    netPaise: integer("net_paise").notNull().default(0),
    number: text("number"),
    fy: text("fy"),
    issueKey: text("issue_key"),
    snapshotJson: text("snapshot_json"),
    issuedAt: text("issued_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_salary_slips_person").on(t.personId, t.payPeriod),
    uniqueIndex("uq_salary_slips_org_number").on(t.orgId, t.number),
  ]
);
