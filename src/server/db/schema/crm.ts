import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";

const id = () => text("id").primaryKey().$defaultFn(newId);
const orgId = () => text("org_id").notNull().default("default");
const externalId = () => text("external_id");
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

export const companyLifecycleValues = ["PROSPECT", "ONBOARDING", "ACTIVE", "MAINTENANCE", "CLOSED"] as const;
export type CompanyLifecycle = (typeof companyLifecycleValues)[number];

export const interactionTypeValues = ["CALL", "MEETING", "WHATSAPP", "EMAIL", "NOTE", "SITE_VISIT"] as const;
export type InteractionType = (typeof interactionTypeValues)[number];

export const verticals = pgTable(
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
).enableRLS();

export const companies = pgTable(
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
    archivedAt: ts("archived_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_companies_org_list").on(t.orgId, t.archivedAt, t.updatedAt.desc()),
    index("idx_companies_org_lifecycle").on(t.orgId, t.lifecycle),
    index("idx_companies_vertical").on(t.verticalId),
    uniqueIndex("uq_companies_org_external").on(t.orgId, t.externalId),
  ]
).enableRLS();

export const contacts = pgTable(
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
    onboarded: boolean("onboarded").notNull().default(false),
    approved: boolean("approved").notNull().default(false),
    archivedAt: ts("archived_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_contacts_company").on(t.companyId),
    uniqueIndex("uq_contacts_org_external").on(t.orgId, t.externalId),
  ]
).enableRLS();

export const interactions = pgTable(
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
    at: ts("at").notNull(),
    nextAction: text("next_action"),
    nextActionAt: ts("next_action_at"),
    nextActionDoneAt: ts("next_action_done_at"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_interactions_company_at").on(t.companyId, t.at),
    index("idx_interactions_contact").on(t.contactId),
    index("idx_interactions_pending_org")
      .on(t.orgId, t.nextActionAt)
      .where(sql`${t.nextActionAt} is not null and ${t.nextActionDoneAt} is null`),
    index("idx_interactions_pending_company")
      .on(t.companyId, t.nextActionAt)
      .where(sql`${t.nextActionAt} is not null and ${t.nextActionDoneAt} is null`),
    uniqueIndex("uq_interactions_org_external").on(t.orgId, t.externalId),
  ]
).enableRLS();

export const meetings = pgTable(
  "meetings",
  {
    id: id(),
    orgId: orgId(),
    externalId: externalId(),
    companyId: text("company_id").references(() => companies.id, { onDelete: "cascade" }),
    dealId: text("deal_id"),
    projectId: text("project_id"),
    title: text("title").notNull(),
    at: ts("at").notNull(),
    location: text("location"),
    attendees: jsonb("attendees").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("idx_meetings_company_at").on(t.companyId, t.at),
    uniqueIndex("uq_meetings_org_external").on(t.orgId, t.externalId),
  ]
).enableRLS();

export const attachments = pgTable(
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
).enableRLS();
