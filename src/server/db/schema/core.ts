import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const ts = (name: string) => text(name).notNull().default(sql`CURRENT_TIMESTAMP`);

// ---------------------------------------------------------------------------
// Legacy tables. Columns match what `src/lib/turso.ts` used to create at runtime
// so production rows survive the move to migrations. Do not change columns here
// without a migration plan; they are replaced by real domain tables in later phases.
// ---------------------------------------------------------------------------

export const legacyClients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  notes: text("notes"),
  stage: text("stage").notNull().default("LEAD"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull().default("TODO"),
    deadline: text("deadline"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [index("idx_projects_client").on(t.clientId)]
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    assignedTo: text("assigned_to"),
    title: text("title").notNull(),
    details: text("details"),
    status: text("status").notNull().default("TODO"),
    priority: text("priority").notNull().default("MEDIUM"),
    dueDate: text("due_date"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [index("idx_tasks_project").on(t.projectId)]
);

export const activityLogs = sqliteTable(
  "activity_logs",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    module: text("module").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: text("metadata"),
    createdAt: ts("created_at"),
  },
  (t) => [index("idx_activity_module_created").on(t.module, t.createdAt)]
);

export const automationRules = sqliteTable("automation_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  trigger: text("trigger").notNull(),
  conditionJson: text("condition_json"),
  actionJson: text("action_json").notNull(),
  enabled: integer("enabled").notNull().default(1),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const pipelineItems = sqliteTable(
  "pipeline_items",
  {
    id: text("id").primaryKey(),
    module: text("module").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    stage: text("stage").notNull(),
    metadata: text("metadata"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    uniqueIndex("idx_pipeline_items_module_entity").on(t.module, t.entityId),
    index("idx_pipeline_items_module_stage").on(t.module, t.stage),
  ]
);

export const socialEntries = sqliteTable(
  "social_entries",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    script: text("script").notNull().default(""),
    platform: text("platform").notNull(),
    date: text("date").notNull(),
    status: text("status").notNull(),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [index("idx_social_entries_date").on(t.date)]
);

export const legacyFreelancers = sqliteTable(
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
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [index("idx_freelancers_name").on(t.freelancer)]
);

// ---------------------------------------------------------------------------
// Phase 0 tables
// ---------------------------------------------------------------------------

export const orgSettings = sqliteTable("org_settings", {
  orgId: text("org_id").primaryKey().default("default"),
  legalName: text("legal_name").notNull().default(""),
  address: text("address").notNull().default(""),
  stateCode: text("state_code").notNull().default(""),
  gstin: text("gstin").notNull().default(""),
  pan: text("pan").notNull().default(""),
  bankDetails: text("bank_details").notNull().default("{}"),
  defaultTerms: text("default_terms").notNull().default(""),
  logoBlobKey: text("logo_blob_key"),
  signatureBlobKey: text("signature_blob_key"),
  signatoryName: text("signatory_name").notNull().default(""),
  signatoryTitle: text("signatory_title").notNull().default(""),
  fyStartMonth: integer("fy_start_month").notNull().default(4),
  updatedAt: ts("updated_at"),
});

export const numberSeries = sqliteTable(
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
);
