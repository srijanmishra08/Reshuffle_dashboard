import { index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import type { SalarySlipSnapshot } from "@/server/documents/types";
import { ts } from "./_cols";
import { people } from "./people";

const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

export const salarySlipStatusValues = ["DRAFT", "ISSUED"] as const;

export type PayLine = { label: string; amountPaise: number };

/** Monthly pay slip for a team member. ADMIN only. The snapshot holds masked PAN and bank digits, never the full values. */
export const salarySlips = pgTable(
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
    earnings: jsonb("earnings").$type<PayLine[]>().notNull().default([]),
    deductions: jsonb("deductions").$type<PayLine[]>().notNull().default([]),
    grossPaise: integer("gross_paise").notNull().default(0),
    deductionsPaise: integer("deductions_paise").notNull().default(0),
    netPaise: integer("net_paise").notNull().default(0),
    number: text("number"),
    fy: text("fy"),
    issueKey: text("issue_key"),
    snapshotJson: jsonb("snapshot_json").$type<SalarySlipSnapshot>(),
    issuedAt: ts("issued_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_salary_slips_person").on(t.personId, t.payPeriod),
    uniqueIndex("uq_salary_slips_org_number").on(t.orgId, t.number),
  ]
).enableRLS();
