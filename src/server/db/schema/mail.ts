import { index, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { newId } from "@/lib/ids";
import { ts } from "./_cols";

export const mailKindValues = ["FOLLOWUP", "OUTREACH", "PORTAL_INVITE", "SCOPE_LINK", "DIGEST"] as const;
export type MailKind = (typeof mailKindValues)[number];

/** SENDING is a short-lived claim so the click and the cron retry never send the same message twice. */
export const mailStatusValues = ["QUEUED", "SENDING", "SENT", "FAILED", "DEAD"] as const;
export type MailStatus = (typeof mailStatusValues)[number];

/** The company mailbox the dashboard sends from. One row per organisation; the refresh token is stored encrypted. */
export const mailConnections = pgTable(
  "mail_connections",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    email: text("email").notNull(),
    refreshTokenEnc: text("refresh_token_enc").notNull(),
    scope: text("scope"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | REVOKED
    connectedBy: text("connected_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_mail_connections_org").on(t.orgId)]
).enableRLS();

/** Every email the dashboard sends or tries to send: the outbox, with retry state and the Gmail ids once sent. */
export const outboundMessages = pgTable(
  "outbound_messages",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    orgId: text("org_id").notNull().default("default"),
    kind: text("kind").notNull(),
    toEmail: text("to_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    companyId: text("company_id"),
    contactId: text("contact_id"),
    dealId: text("deal_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("QUEUED"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    sentAt: ts("sent_at"),
    gmailMessageId: text("gmail_message_id"),
    gmailThreadId: text("gmail_thread_id"),
    lastError: text("last_error"),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_outbound_messages_org_key").on(t.orgId, t.idempotencyKey),
    index("idx_outbound_messages_due").on(t.status, t.nextAttemptAt),
    index("idx_outbound_messages_org_created").on(t.orgId, t.createdAt),
  ]
).enableRLS();
