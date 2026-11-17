import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";
import { legacyFreelancers } from "./core";
import { deliveryProjects } from "./delivery";

const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

export const assignmentStatusValues = ["ACTIVE", "ENDED"] as const;
export type AssignmentStatus = (typeof assignmentStatusValues)[number];
export const payoutStatusValues = ["PENDING", "PAID", "CANCELLED"] as const;
export type PayoutStatus = (typeof payoutStatusValues)[number];

/** A freelancer (or partner agency) working on a delivery project. */
export const freelancerAssignments = pgTable(
  "freelancer_assignments",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    freelancerId: text("freelancer_id")
      .notNull()
      .references(() => legacyFreelancers.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => deliveryProjects.id, { onDelete: "cascade" }),
    role: text("role").notNull().default(""),
    allocationPct: integer("allocation_pct").notNull().default(100),
    /** Calendar days, `YYYY-MM-DD`. */
    startDate: text("start_date"),
    endDate: text("end_date"),
    status: text("status").notNull().default("ACTIVE"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_assignments_freelancer").on(t.freelancerId, t.status),
    index("idx_assignments_project").on(t.projectId),
  ]
).enableRLS();

/** Money owed to a freelancer. Marking it paid books an EXPENSE ledger entry in the same transaction. */
export const payouts = pgTable(
  "payouts",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    freelancerId: text("freelancer_id")
      .notNull()
      .references(() => legacyFreelancers.id),
    projectId: text("project_id").references(() => deliveryProjects.id),
    description: text("description").notNull().default(""),
    amountPaise: integer("amount_paise").notNull(),
    dueDate: text("due_date"),
    paidOn: text("paid_on"),
    status: text("status").notNull().default("PENDING"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_payouts_org_status").on(t.orgId, t.status),
    index("idx_payouts_freelancer").on(t.freelancerId),
  ]
).enableRLS();

/** Saved planning sheets (for example the finance Plan tab), one JSON document per key. */
export const financePlans = pgTable(
  "finance_plans",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    key: text("key").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    updatedBy: text("updated_by"),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_finance_plans_org_key").on(t.orgId, t.key)]
).enableRLS();

export const taskStatusValues = ["BACKLOG", "TODO", "IN_PROGRESS", "CLIENT_REVIEW", "REVISION", "COMPLETED", "INVOICED"] as const;
export type TaskStatus = (typeof taskStatusValues)[number];
export const taskPriorityValues = ["NONE", "LOW", "MEDIUM", "HIGH"] as const;
export type TaskPriority = (typeof taskPriorityValues)[number];

/** Kanban tasks on a delivery project. A project's progress is the share of tasks that are COMPLETED or INVOICED. */
export const projectTasks = pgTable(
  "project_tasks",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    projectId: text("project_id")
      .notNull()
      .references(() => deliveryProjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("TODO"),
    priority: text("priority").notNull().default("NONE"),
    /** Calendar day, `YYYY-MM-DD`. */
    dueDate: text("due_date"),
    budgetPaise: integer("budget_paise").notNull().default(0),
    assigneeId: text("assignee_id").references(() => legacyFreelancers.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    completedAt: ts("completed_at"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("idx_project_tasks_project").on(t.projectId, t.status, t.position), index("idx_project_tasks_assignee").on(t.assigneeId)]
).enableRLS();

/** Partner agencies that supply freelancers. An agency sign-in sees the work and payouts of its own freelancers. */
export const agencies = pgTable(
  "agencies",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    notes: text("notes"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_agencies_org_name").on(t.orgId, t.name)]
).enableRLS();

/** A freelancer belongs to at most one agency. */
export const agencyFreelancers = pgTable(
  "agency_freelancers",
  {
    agencyId: text("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    freelancerId: text("freelancer_id")
      .notNull()
      .references(() => legacyFreelancers.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull().default("default"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_agency_freelancers_freelancer").on(t.freelancerId), index("idx_agency_freelancers_agency").on(t.agencyId)]
).enableRLS();

export const taskCommentKindValues = ["COMMENT", "REVISION_REQUEST", "APPROVAL"] as const;
export type TaskCommentKind = (typeof taskCommentKindValues)[number];
export const commentAuthorValues = ["TEAM", "CLIENT", "FREELANCER", "AGENCY"] as const;
export type CommentAuthor = (typeof commentAuthorValues)[number];

/**
 * The conversation on a task: the client's reason for asking for changes, replies from the team and the
 * freelancer, and plain notes. `internal` notes are for the team and the people doing the work, never the client.
 */
export const taskComments = pgTable(
  "task_comments",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    taskId: text("task_id")
      .notNull()
      .references(() => projectTasks.id, { onDelete: "cascade" }),
    authorRole: text("author_role").notNull(),
    authorName: text("author_name").notNull().default(""),
    authorUserId: text("author_user_id"),
    kind: text("kind").notNull().default("COMMENT"),
    body: text("body").notNull(),
    internal: boolean("internal").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("idx_task_comments_task").on(t.taskId, t.createdAt)]
).enableRLS();
