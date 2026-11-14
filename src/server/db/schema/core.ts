import { boolean, index, integer, jsonb, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";
import { ts } from "./_cols";

const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow();

// ---------------------------------------------------------------------------
// Early-module tables (clients, projects, tasks, boards, social, freelancers).
// They are replaced by real domain tables in later phases.
// ---------------------------------------------------------------------------

export const legacyClients = pgTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  notes: text("notes"),
  stage: text("stage").notNull().default("LEAD"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: created(),
  updatedAt: updated(),
}).enableRLS();

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("TODO"),
    deadline: ts("deadline"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("idx_projects_client").on(t.clientId)]
).enableRLS();

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    assignedTo: text("assigned_to"),
    title: text("title").notNull(),
    details: text("details"),
    status: text("status").notNull().default("TODO"),
    priority: text("priority").notNull().default("MEDIUM"),
    dueDate: ts("due_date"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("idx_tasks_project").on(t.projectId)]
).enableRLS();

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    module: text("module").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: created(),
  },
  (t) => [index("idx_activity_module_created").on(t.module, t.createdAt.desc())]
).enableRLS();

export const automationRules = pgTable("automation_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  trigger: text("trigger").notNull(),
  conditionJson: jsonb("condition_json"),
  actionJson: jsonb("action_json").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
}).enableRLS();

export const pipelineItems = pgTable(
  "pipeline_items",
  {
    id: text("id").primaryKey(),
    module: text("module").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    stage: text("stage").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("idx_pipeline_items_module_entity").on(t.module, t.entityId),
    index("idx_pipeline_items_module_stage").on(t.module, t.stage),
  ]
).enableRLS();

export const socialEntries = pgTable(
  "social_entries",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    script: text("script").notNull().default(""),
    platform: text("platform").notNull(),
    /** Calendar day, YYYY-MM-DD. */
    date: text("date").notNull(),
    status: text("status").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("idx_social_entries_date").on(t.date)]
).enableRLS();

export const legacyFreelancers = pgTable(
  "freelancers",
  {
    id: text("id").primaryKey(),
    freelancer: text("freelancer").notNull(),
    skill: text("skill"),
    availability: text("availability"),
    project: text("project"),
    utilization: text("utilization"),
    payout: text("payout"),
    performance: text("performance"),
    category: text("category"),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    whatsapp: text("whatsapp"),
    instagram: text("instagram"),
    linkedin: text("linkedin"),
    xHandle: text("x_handle"),
    website: text("website"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("idx_freelancers_name").on(t.freelancer)]
).enableRLS();

// ---------------------------------------------------------------------------
// Platform tables
// ---------------------------------------------------------------------------

export const orgSettings = pgTable("org_settings", {
  orgId: text("org_id").primaryKey().default("default"),
  legalName: text("legal_name").notNull().default(""),
  address: text("address").notNull().default(""),
  stateCode: text("state_code").notNull().default(""),
  gstin: text("gstin").notNull().default(""),
  pan: text("pan").notNull().default(""),
  bankDetails: jsonb("bank_details").$type<Record<string, string>>().notNull().default({}),
  defaultTerms: text("default_terms").notNull().default(""),
  logoBlobKey: text("logo_blob_key"),
  signatureBlobKey: text("signature_blob_key"),
  signatoryName: text("signatory_name").notNull().default(""),
  signatoryTitle: text("signatory_title").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  website: text("website").notNull().default(""),
  fyStartMonth: integer("fy_start_month").notNull().default(4),
  updatedAt: updated(),
}).enableRLS();

export const numberSeries = pgTable(
  "number_series",
  {
    orgId: text("org_id").notNull().default("default"),
    docType: text("doc_type").notNull(),
    fy: text("fy").notNull(),
    prefix: text("prefix").notNull(),
    nextValue: integer("next_value").notNull().default(1),
    padding: integer("padding").notNull().default(3),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.docType, t.fy] })]
).enableRLS();
