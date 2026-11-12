import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { newId } from "@/lib/ids";

const id = () => text("id").primaryKey().$defaultFn(newId);
const orgId = () => text("org_id").notNull().default("default");
const externalId = () => text("external_id");
const createdAt = () => text("created_at").notNull().$defaultFn(() => new Date().toISOString());
const updatedAt = () =>
  text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString());

export const companyLifecycleValues = [
  "PROSPECT",
  "ONBOARDING",
  "ACTIVE",
  "MAINTENANCE",
  "CLOSED",
] as const;
export type CompanyLifecycle = (typeof companyLifecycleValues)[number];

export const interactionTypeValues = [
  "CALL",
  "MEETING",
  "WHATSAPP",
  "EMAIL",
  "NOTE",
  "SITE_VISIT",
] as const;
export type InteractionType = (typeof interactionTypeValues)[number];

export const verticals = sqliteTable(
  "verticals",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    externalId: externalId(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("uq_verticals_org_name").on(t.orgId, t.name)]
);

export const companies = sqliteTable(
  "companies",
  {
    id: id(),
    orgId: orgId(),
    externalId: externalId(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    gstin: text("gstin"),
    stateCode: text("state_code"),
    address: text("address"),
    verticalId: text("vertical_id").references(() => verticals.id),
    website: text("website"),
    lifecycle: text("lifecycle").notNull().default("PROSPECT"),
    ownerId: text("owner_id"),
    source: text("source"),
    referrer: text("referrer"),
    notes: text("notes"),
    archivedAt: text("archived_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_companies_org_lifecycle").on(t.orgId, t.lifecycle),
    index("idx_companies_vertical").on(t.verticalId),
    uniqueIndex("uq_companies_org_external").on(t.orgId, t.externalId),
  ]
);

export const contacts = sqliteTable(
  "contacts",
  {
    id: id(),
    orgId: orgId(),
    externalId: externalId(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    phone: text("phone"),
    email: text("email"),
    whatsapp: text("whatsapp"),
    whatsappRole: text("whatsapp_role"), // CLIENT | CLIENT_TEAM
    onboarded: integer("onboarded", { mode: "boolean" }).notNull().default(false),
    approved: integer("approved", { mode: "boolean" }).notNull().default(false),
    archivedAt: text("archived_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_contacts_company").on(t.companyId),
    uniqueIndex("uq_contacts_org_external").on(t.orgId, t.externalId),
  ]
);

export const interactions = sqliteTable(
  "interactions",
  {
    id: id(),
    orgId: orgId(),
    externalId: externalId(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    dealId: text("deal_id"),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    at: text("at").notNull(),
    nextAction: text("next_action"),
    nextActionAt: text("next_action_at"),
    nextActionDoneAt: text("next_action_done_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_interactions_company_at").on(t.companyId, t.at),
    index("idx_interactions_next_action").on(t.orgId, t.nextActionAt),
    uniqueIndex("uq_interactions_org_external").on(t.orgId, t.externalId),
  ]
);

export const meetings = sqliteTable(
  "meetings",
  {
    id: id(),
    orgId: orgId(),
    externalId: externalId(),
    companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
    dealId: text("deal_id"),
    projectId: text("project_id"),
    title: text("title").notNull(),
    at: text("at").notNull(),
    location: text("location"),
    attendees: text("attendees").notNull().default("[]"),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_meetings_company_at").on(t.companyId, t.at),
    uniqueIndex("uq_meetings_org_external").on(t.orgId, t.externalId),
  ]
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: id(),
    orgId: orgId(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    blobKey: text("blob_key").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime"),
    size: integer("size"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("idx_attachments_entity").on(t.entityType, t.entityId)]
);

