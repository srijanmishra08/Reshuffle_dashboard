import { and, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { decryptSecret, encryptSecret } from "@/server/lib/crypto";
import { createGmailProvider } from "@/server/lib/mail/gmail";
import type { MailProvider } from "@/server/lib/mail/provider";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";

const { mailConnections } = schema;

async function findConnection(db: Db, orgId: string) {
  const rows = await db.select().from(mailConnections).where(eq(mailConnections.orgId, orgId)).limit(1);
  return rows[0] ?? null;
}

/** Whether the company mailbox is connected. Never returns the token. */
export async function mailStatus(db: Db, ctx: Pick<ServiceContext, "orgId">) {
  const row = await findConnection(db, ctx.orgId);
  return ok({
    connected: row?.status === "ACTIVE",
    revoked: row?.status === "REVOKED",
    email: row?.email ?? null,
    connectedAt: row?.updatedAt ?? null,
  });
}

/** Stores the mailbox the admin just connected. The refresh token is encrypted before it touches the database. */
export async function saveConnection(db: Db, ctx: ServiceContext, mailbox: { email: string; refreshToken: string; scope: string | null }) {
  const values = {
    email: mailbox.email,
    refreshTokenEnc: encryptSecret(mailbox.refreshToken),
    scope: mailbox.scope,
    status: "ACTIVE",
    connectedBy: ctx.userId,
    updatedAt: new Date(),
  };
  await db
    .insert(mailConnections)
    .values({ orgId: ctx.orgId, ...values })
    .onConflictDoUpdate({ target: mailConnections.orgId, set: values });
  await logActivity({ actorId: ctx.userId, action: "mail.connected", module: "settings", entityType: "mail", entityId: ctx.orgId, metadata: { email: mailbox.email } }, db);
  return ok({ email: mailbox.email });
}

export async function disconnect(db: Db, ctx: ServiceContext) {
  const removed = await db.delete(mailConnections).where(eq(mailConnections.orgId, ctx.orgId)).returning({ email: mailConnections.email });
  if (removed.length === 0) return fail("NOT_FOUND", "No mailbox is connected");
  await logActivity({ actorId: ctx.userId, action: "mail.disconnected", module: "settings", entityType: "mail", entityId: ctx.orgId, metadata: { email: removed[0].email } }, db);
  return ok({ email: removed[0].email });
}

/** Called when Google says the token is dead, so the UI asks the admin to connect again instead of failing quietly. */
export async function markRevoked(db: Db, orgId: string) {
  await db
    .update(mailConnections)
    .set({ status: "REVOKED", updatedAt: new Date() })
    .where(and(eq(mailConnections.orgId, orgId), eq(mailConnections.status, "ACTIVE")));
}

/** The Gmail sender for an organisation, or null when no working mailbox is connected. */
export async function getMailProvider(db: Db, orgId: string): Promise<MailProvider | null> {
  const row = await findConnection(db, orgId);
  if (!row || row.status !== "ACTIVE") return null;
  return createGmailProvider({ refreshToken: decryptSecret(row.refreshTokenEnc), fromEmail: row.email });
}

/** Organisations that have a working mailbox, for the cron route. */
export async function listConnectedOrgs(db: Db): Promise<string[]> {
  const rows = await db.select({ orgId: mailConnections.orgId }).from(mailConnections).where(eq(mailConnections.status, "ACTIVE"));
  return rows.map((r) => r.orgId);
}
