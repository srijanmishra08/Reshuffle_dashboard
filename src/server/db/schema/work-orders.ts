import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { newId } from "@/lib/ids";
import { companies } from "./crm";

const id = () => text("id").primaryKey().$defaultFn(newId);
const createdAt = () => text("created_at").notNull().$defaultFn(() => new Date().toISOString());
const updatedAt = () => text("updated_at").notNull().$defaultFn(() => new Date().toISOString());

export const workOrderStatusValues = ["DRAFT", "ISSUED", "COMPLETED", "CANCELLED"] as const;
export type WorkOrderStatus = (typeof workOrderStatusValues)[number];

/** All money columns are integer paise. */
export const workOrders = sqliteTable(
  "work_orders",
  {
    id: id(),
    orgId: text("org_id").notNull().default("default"),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id),
    dealId: text("deal_id"),
    projectId: text("project_id"),
    status: text("status").notNull().default("DRAFT"),
    /** Assigned only at issue, inside the issuing transaction. */
    number: text("number"),
    fy: text("fy"),
    customerRef: text("customer_ref"),
    requestedBy: text("requested_by"),
    department: text("department"),
    jobDetails: text("job_details"),
    comments: text("comments"),
    issueDate: text("issue_date"),
    completedDate: text("completed_date"),
    placeOfSupply: text("place_of_supply").notNull().default(""),
    taxMode: text("tax_mode").notNull().default("INTRA"),
    rateBps: integer("rate_bps").notNull().default(1800),
    subtotalPaise: integer("subtotal_paise").notNull().default(0),
    cgstPaise: integer("cgst_paise").notNull().default(0),
    sgstPaise: integer("sgst_paise").notNull().default(0),
    igstPaise: integer("igst_paise").notNull().default(0),
    roundOffPaise: integer("round_off_paise").notNull().default(0),
    totalPaise: integer("total_paise").notNull().default(0),
    issueKey: text("issue_key"),
    snapshotJson: text("snapshot_json"),
    issuedAt: text("issued_at"),
    cancelledAt: text("cancelled_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_work_orders_org_status").on(t.orgId, t.status),
    index("idx_work_orders_company").on(t.companyId),
    uniqueIndex("uq_work_orders_org_number").on(t.orgId, t.number),
  ]
);

export const workOrderItems = sqliteTable(
  "work_order_items",
  {
    id: id(),
    workOrderId: text("work_order_id")
      .notNull()
      .references(() => workOrders.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    sacCode: text("sac_code"),
    quantity: integer("quantity").notNull().default(1),
    ratePaise: integer("rate_paise").notNull().default(0),
    amountPaise: integer("amount_paise").notNull().default(0),
    taxable: integer("taxable", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("idx_work_order_items_wo").on(t.workOrderId, t.position)]
);
