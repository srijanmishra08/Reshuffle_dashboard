import { index, pgTable, text } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";

export const goalStatusValues = ["TODO", "IN_PROGRESS", "DONE", "DROPPED"] as const;
export type GoalStatus = (typeof goalStatusValues)[number];
export const goalPriorityValues = ["LOW", "MEDIUM", "HIGH"] as const;

/** Monthly goals by team. `month` is `YYYY-MM`; dates are calendar days (`YYYY-MM-DD`). */
export const goals = pgTable(
  "goals",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    month: text("month").notNull(),
    title: text("title").notNull(),
    team: text("team"),
    priority: text("priority").notNull().default("MEDIUM"),
    status: text("status").notNull().default("TODO"),
    startDate: text("start_date"),
    dueDate: text("due_date"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_goals_org_month").on(t.orgId, t.month)]
).enableRLS();
