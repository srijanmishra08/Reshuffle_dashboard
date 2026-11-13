import { index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";
import { companies } from "./crm";
import { deals } from "./deals";
import { scopes } from "./scopes";

const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

export const deliveryStatusValues = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
export type DeliveryStatus = (typeof deliveryStatusValues)[number];
export const milestoneStatusValues = ["PENDING", "DONE", "INVOICED"] as const;
export type MilestoneStatus = (typeof milestoneStatusValues)[number];

/**
 * Delivery projects created from won deals. The legacy `projects` table stays until its rows
 * are migrated, so this one has its own name.
 */
export const deliveryProjects = pgTable(
  "delivery_projects",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    dealId: text("deal_id").references(() => deals.id),
    scopeId: text("scope_id").references(() => scopes.id),
    name: text("name").notNull(),
    status: text("status").notNull().default("PLANNED"),
    budgetPaise: integer("budget_paise").notNull().default(0),
    /** Calendar days, `YYYY-MM-DD`. */
    startDate: text("start_date"),
    dueDate: text("due_date"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_delivery_projects_org_status").on(t.orgId, t.status),
    index("idx_delivery_projects_company").on(t.companyId),
    // One project per deal, so converting twice cannot create duplicates.
    uniqueIndex("uq_delivery_projects_deal").on(t.orgId, t.dealId),
  ]
).enableRLS();

/** Payment-schedule steps become milestones. Amounts are integer paise and pre-GST. */
export const projectMilestones = pgTable(
  "project_milestones",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    projectId: text("project_id")
      .notNull()
      .references(() => deliveryProjects.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    label: text("label").notNull(),
    percent: integer("percent").notNull().default(0),
    amountPaise: integer("amount_paise").notNull().default(0),
    dueDate: text("due_date"),
    status: text("status").notNull().default("PENDING"),
    invoiceId: text("invoice_id"),
    completedAt: ts("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("idx_project_milestones_project").on(t.projectId, t.position)]
).enableRLS();
