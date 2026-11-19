import { and, desc, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import { mailInviteSchema, mailSendSchema, outboxQuerySchema } from "@/lib/schemas/mail";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { followUpDigest, portalInvite, scopeLink, type DigestItem } from "@/server/lib/mail/templates";
import { MailError, type MailProvider } from "@/server/lib/mail/provider";
import { fail, ok, type Result } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";
import { getMailProvider, markRevoked } from "@/server/services/mail-connection";
import { openDealStages } from "@/server/models/deals";
import type { MailKind } from "@/server/db/schema/mail";

const { outboundMessages, companies, contacts, deals, scopes, allowedEmails, interactions, user } = schema;

export const MAX_ATTEMPTS = 5;
/** Delay before retry n (1-based): 5 min, 10, 20, 40. */
const backoffMs = (attempt: number) => 5 * 60 * 1000 * 2 ** (attempt - 1);
const istDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);

type Message = typeof outboundMessages.$inferSelect;

/** What callers and the outbox page see. The body stays in the database. */
function toView(m: Message) {
  return {
    id: m.id,
    kind: m.kind,
    to: m.toEmail,
    subject: m.subject,
    status: m.status,
    attempts: m.attempts,
    lastError: m.lastError,
    sentAt: m.sentAt,
    createdAt: m.createdAt,
  };
}
export type MailView = ReturnType<typeof toView>;

type Prepared = {
  kind: MailKind;
  to: string;
  subject: string;
  body: string;
  idempotencyKey: string;
  entityType?: string;
  entityId?: string;
  companyId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
};

type Options = { provider?: MailProvider | null; now?: Date };

/** Inserts the message once per idempotency key, then tries to send it. A repeat of the same key returns the first message. */
async function enqueue(db: Db, ctx: ServiceContext, prepared: Prepared, options: Options): Promise<Result<MailView>> {
  const now = options.now ?? new Date();
  const provider = options.provider === undefined ? await getMailProvider(db, ctx.orgId) : options.provider;
  if (!provider) return fail("CONFLICT", "Gmail is not connected. An admin can connect it in Settings.");

  const inserted = await db
    .insert(outboundMessages)
    .values({
      orgId: ctx.orgId,
      kind: prepared.kind,
      toEmail: prepared.to,
      subject: prepared.subject,
      body: prepared.body,
      entityType: prepared.entityType ?? null,
      entityId: prepared.entityId ?? null,
      companyId: prepared.companyId ?? null,
      contactId: prepared.contactId ?? null,
      dealId: prepared.dealId ?? null,
      idempotencyKey: prepared.idempotencyKey,
      createdBy: ctx.userId,
      nextAttemptAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) {
    const existing = await db
      .select()
      .from(outboundMessages)
      .where(and(eq(outboundMessages.orgId, ctx.orgId), eq(outboundMessages.idempotencyKey, prepared.idempotencyKey)))
      .limit(1);
    return existing[0] ? ok(toView(existing[0])) : fail("CONFLICT", "This message could not be queued");
  }

  const after = await deliver(db, inserted[0], provider, now);
  return ok(toView(after));
}

/**
 * One send attempt. The row is claimed first (QUEUED/FAILED -> SENDING) so the click and the cron retry cannot both send it.
 * A message stuck in SENDING after a crash is left for an admin to see in the outbox rather than risk a duplicate.
 */
export async function deliver(db: Db, message: Message, provider: MailProvider, now = new Date()): Promise<Message> {
  const claimed = await db
    .update(outboundMessages)
    .set({ status: "SENDING", updatedAt: now })
    .where(and(eq(outboundMessages.id, message.id), inArray(outboundMessages.status, ["QUEUED", "FAILED"])))
    .returning();
  const row = claimed[0];
  if (!row) return message;

  const attempts = row.attempts + 1;
  try {
    const sent = await provider.send({ to: row.toEmail, subject: row.subject, body: row.body });
    const [done] = await db
      .update(outboundMessages)
      .set({ status: "SENT", attempts, sentAt: now, gmailMessageId: sent.id, gmailThreadId: sent.threadId, lastError: null, updatedAt: now })
      .where(eq(outboundMessages.id, row.id))
      .returning();
    await logActivity(
      { actorId: row.createdBy ?? undefined, action: "mail.sent", module: "mail", entityType: row.entityType ?? "mail", entityId: row.entityId ?? row.id, metadata: { kind: row.kind, messageId: row.id } },
      db
    );
    if (row.companyId && (row.kind === "FOLLOWUP" || row.kind === "OUTREACH" || row.kind === "SCOPE_LINK")) {
      await db.insert(interactions).values({
        orgId: row.orgId,
        companyId: row.companyId,
        contactId: row.contactId,
        dealId: row.dealId,
        type: "EMAIL",
        summary: `Emailed ${row.toEmail}: ${row.subject}`.slice(0, 500),
        at: now,
        createdBy: row.createdBy,
      });
    }
    return done;
  } catch (error) {
    const mailError = error instanceof MailError ? error : new MailError(error instanceof Error ? error.message : "Send failed", false);
    if (mailError.revoked) await markRevoked(db, row.orgId);
    const dead = mailError.permanent || attempts >= MAX_ATTEMPTS;
    const [failed] = await db
      .update(outboundMessages)
      .set({
        status: dead ? "DEAD" : "FAILED",
        attempts,
        lastError: mailError.message.slice(0, 500),
        nextAttemptAt: dead ? row.nextAttemptAt : new Date(now.getTime() + backoffMs(attempts)),
        updatedAt: now,
      })
      .where(eq(outboundMessages.id, row.id))
      .returning();
    await logActivity(
      { actorId: row.createdBy ?? undefined, action: dead ? "mail.dead" : "mail.failed", module: "mail", entityType: row.entityType ?? "mail", entityId: row.entityId ?? row.id, metadata: { kind: row.kind, messageId: row.id, error: mailError.message.slice(0, 200) } },
      db
    );
    return failed;
  }
}

async function companyChecks(db: Db, orgId: string, ids: { companyId?: string; contactId?: string; dealId?: string }) {
  if (!ids.companyId) {
    return ids.contactId || ids.dealId ? fail("VALIDATION", "Choose the client first") : null;
  }
  const company = await db.select({ id: companies.id }).from(companies).where(and(eq(companies.id, ids.companyId), eq(companies.orgId, orgId))).limit(1);
  if (company.length === 0) return fail("NOT_FOUND", "Client not found");
  if (ids.contactId) {
    const c = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.id, ids.contactId), eq(contacts.companyId, ids.companyId))).limit(1);
    if (c.length === 0) return fail("NOT_FOUND", "Contact not found for this client");
  }
  if (ids.dealId) {
    const d = await db.select({ id: deals.id }).from(deals).where(and(eq(deals.id, ids.dealId), eq(deals.companyId, ids.companyId), eq(deals.orgId, orgId))).limit(1);
    if (d.length === 0) return fail("NOT_FOUND", "Lead not found for this client");
  }
  return null;
}

/** Team send: a follow-up or outreach email the staff member wrote, or the email that carries a scope link. */
export async function sendMail(db: Db, ctx: ServiceContext, raw: unknown, options: Options = {}) {
  const parsed = mailSendSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid email", parsed.error.flatten());
  const input = parsed.data;

  if (input.kind === "SCOPE_LINK") {
    const rows = await db
      .select({ id: scopes.id, title: scopes.title, status: scopes.status, dealId: scopes.dealId, companyId: deals.companyId })
      .from(scopes)
      .leftJoin(deals, eq(deals.id, scopes.dealId))
      .where(and(eq(scopes.id, input.scopeId), eq(scopes.orgId, ctx.orgId)))
      .limit(1);
    const scope = rows[0];
    if (!scope) return fail("NOT_FOUND", "Scope not found");
    if (scope.status !== "SENT") return fail("CONFLICT", "Only a sent scope can be emailed");
    const content = scopeLink({ path: input.path, title: scope.title });
    return enqueue(
      db,
      ctx,
      { kind: "SCOPE_LINK", to: input.to, ...content, idempotencyKey: input.idempotencyKey, entityType: "scope", entityId: scope.id, companyId: scope.companyId, dealId: scope.dealId },
      options
    );
  }

  const invalid = await companyChecks(db, ctx.orgId, input);
  if (invalid) return invalid;
  return enqueue(
    db,
    ctx,
    {
      kind: input.kind,
      to: input.to,
      subject: input.subject,
      body: input.body,
      idempotencyKey: input.idempotencyKey,
      entityType: input.dealId ? "deal" : input.companyId ? "company" : undefined,
      entityId: input.dealId ?? input.companyId,
      companyId: input.companyId,
      contactId: input.contactId,
      dealId: input.dealId,
    },
    options
  );
}

/** Admin send: tells someone who was just given access how to sign in. Only emails on the allowlist can be invited. */
export async function sendInvite(db: Db, ctx: ServiceContext, raw: unknown, options: Options = {}) {
  const parsed = mailInviteSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid email", parsed.error.flatten());
  const rows = await db
    .select({ email: allowedEmails.email, role: allowedEmails.role })
    .from(allowedEmails)
    .where(and(eq(allowedEmails.email, parsed.data.email), eq(allowedEmails.orgId, ctx.orgId)))
    .limit(1);
  if (rows.length === 0) return fail("NOT_FOUND", "Give this email access before inviting it");
  const content = portalInvite({ role: rows[0].role });
  return enqueue(
    db,
    ctx,
    { kind: "PORTAL_INVITE", to: rows[0].email, ...content, idempotencyKey: parsed.data.idempotencyKey, entityType: "access", entityId: rows[0].email },
    options
  );
}

export async function listOutbox(db: Db, ctx: ServiceContext, query: unknown) {
  const parsed = outboxQuerySchema.safeParse(query);
  if (!parsed.success) return fail("VALIDATION", "Invalid filter");
  const rows = await db
    .select()
    .from(outboundMessages)
    .where(and(eq(outboundMessages.orgId, ctx.orgId), parsed.data.status ? eq(outboundMessages.status, parsed.data.status) : undefined))
    .orderBy(desc(outboundMessages.createdAt))
    .limit(parsed.data.limit);
  return ok(rows.map(toView));
}

/** Retries everything that failed and is due again. Called by the cron route. */
export async function processQueue(db: Db, orgId: string, provider: MailProvider, now = new Date()) {
  const due = await db
    .select()
    .from(outboundMessages)
    .where(and(eq(outboundMessages.orgId, orgId), inArray(outboundMessages.status, ["QUEUED", "FAILED"]), lte(outboundMessages.nextAttemptAt, now)))
    .limit(25);
  let sent = 0;
  for (const message of due) {
    const after = await deliver(db, message, provider, now);
    if (after.status === "SENT") sent += 1;
  }
  return { attempted: due.length, sent };
}

/** One email per team member listing their follow-ups due today or overdue. Once per person per day. */
export async function sendFollowUpDigests(db: Db, orgId: string, provider: MailProvider, now = new Date()) {
  const today = istDay(now);
  const cutoff = new Date(`${today}T23:59:59+05:30`);

  const [touches, leads] = await Promise.all([
    db
      .select({ owner: interactions.createdBy, company: companies.name, nextAction: interactions.nextAction, at: interactions.nextActionAt })
      .from(interactions)
      .innerJoin(companies, eq(companies.id, interactions.companyId))
      .where(
        and(
          eq(interactions.orgId, orgId),
          isNotNull(interactions.createdBy),
          isNotNull(interactions.nextActionAt),
          isNull(interactions.nextActionDoneAt),
          isNull(companies.archivedAt),
          lte(interactions.nextActionAt, cutoff)
        )
      ),
    db
      .select({ owner: deals.ownerId, company: companies.name, title: deals.title, due: deals.nextFollowUp })
      .from(deals)
      .innerJoin(companies, eq(companies.id, deals.companyId))
      .where(
        and(
          eq(deals.orgId, orgId),
          inArray(deals.stage, [...openDealStages]),
          isNotNull(deals.ownerId),
          isNotNull(deals.nextFollowUp),
          lte(deals.nextFollowUp, today),
          isNull(companies.archivedAt)
        )
      ),
  ]);

  const byOwner = new Map<string, DigestItem[]>();
  const add = (owner: string | null, item: DigestItem) => {
    if (!owner) return;
    byOwner.set(owner, [...(byOwner.get(owner) ?? []), item]);
  };
  for (const t of touches) add(t.owner, { label: t.company, detail: t.nextAction ?? "Follow up", when: t.at ? istDay(t.at) : today });
  for (const l of leads) add(l.owner, { label: l.company, detail: l.title, when: l.due ?? today });
  if (byOwner.size === 0) return { digests: 0 };

  const people = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(and(inArray(user.id, [...byOwner.keys()]), eq(user.orgId, orgId), eq(user.active, true)));

  let digests = 0;
  const ctxFor = (userId: string): ServiceContext => ({ orgId, userId });
  for (const person of people) {
    const items = byOwner.get(person.id) ?? [];
    const content = followUpDigest({ date: today, items });
    const result = await enqueue(
      db,
      ctxFor(person.id),
      { kind: "DIGEST", to: person.email, ...content, idempotencyKey: `digest:${person.id}:${today}`, entityType: "user", entityId: person.id },
      { provider, now }
    );
    if (result.ok && result.data.status === "SENT") digests += 1;
  }
  return { digests };
}
