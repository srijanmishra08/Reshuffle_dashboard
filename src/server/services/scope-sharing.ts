import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { fail, ok } from "@/server/lib/result";
import { allowRequest } from "@/server/lib/rate-limit";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";

const { scopes, scopeShares, scopeAcceptances, deals } = schema;

const LINK_DAYS = 30;
const dayMs = 24 * 60 * 60 * 1000;

export const acceptInputSchema = z.object({
  typedName: z.string().trim().min(2, "Type your full name to accept").max(200),
});

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Creates a link for a SENT scope and revokes earlier links. The raw token is returned once and never stored. */
export async function createShareLink(db: Db, ctx: ServiceContext, scopeId: string, now = new Date()) {
  const rows = await db
    .select({ id: scopes.id, status: scopes.status })
    .from(scopes)
    .where(and(eq(scopes.id, scopeId), eq(scopes.orgId, ctx.orgId)))
    .limit(1);
  const scope = rows[0];
  if (!scope) return fail("NOT_FOUND", "Scope not found");
  if (scope.status !== "SENT") return fail("CONFLICT", "Only a sent scope can be shared");

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + LINK_DAYS * dayMs).toISOString();
  await db
    .update(scopeShares)
    .set({ revokedAt: now.toISOString() })
    .where(and(eq(scopeShares.scopeId, scopeId), isNull(scopeShares.revokedAt)));
  await db.insert(scopeShares).values({
    orgId: ctx.orgId,
    scopeId,
    tokenHash: hashToken(token),
    expiresAt,
    createdBy: ctx.userId,
  });
  await logActivity(
    { actorId: ctx.userId, action: "scope.shared", module: "sales", entityType: "scope", entityId: scopeId },
    db
  );
  return ok({ token, path: `/p/${token}`, expiresAt });
}

export async function revokeShareLinks(db: Db, ctx: ServiceContext, scopeId: string) {
  const revoked = await db
    .update(scopeShares)
    .set({ revokedAt: new Date().toISOString() })
    .where(
      and(eq(scopeShares.scopeId, scopeId), eq(scopeShares.orgId, ctx.orgId), isNull(scopeShares.revokedAt))
    )
    .returning({ id: scopeShares.id });
  if (revoked.length > 0) {
    await logActivity(
      { actorId: ctx.userId, action: "scope.share_revoked", module: "sales", entityType: "scope", entityId: scopeId },
      db
    );
  }
  return ok({ revoked: revoked.length });
}

type Resolved = { share: typeof scopeShares.$inferSelect; scope: typeof scopes.$inferSelect };

async function resolveToken(db: Db, token: string, now: Date): Promise<Resolved | null> {
  if (!token || token.length > 200) return null;
  const rows = await db
    .select({ share: scopeShares, scope: scopes })
    .from(scopeShares)
    .innerJoin(scopes, eq(scopes.id, scopeShares.scopeId))
    .where(eq(scopeShares.tokenHash, hashToken(token)))
    .limit(1);
  const row = rows[0];
  if (!row || row.share.revokedAt || row.share.expiresAt <= now.toISOString()) return null;
  return row;
}

/** What the client sees. Only the frozen snapshot and acceptance state; no internal ids. */
export async function getPublicScope(db: Db, token: string, now = new Date()) {
  const resolved = await resolveToken(db, token, now);
  const snapshotJson = resolved?.scope.snapshotJson;
  if (!resolved || !snapshotJson) return fail("NOT_FOUND", "This link is not valid");
  const { scope } = resolved;
  return ok({
    snapshot: JSON.parse(snapshotJson) as Record<string, unknown>,
    status: scope.status as string,
    acceptedAt: scope.acceptedAt,
    acceptedBy: scope.acceptedBy,
  });
}

/** Client accepts. Compare-and-set on SENT, so a second click or a superseded scope returns 409. */
export async function acceptScope(
  db: Db,
  token: string,
  raw: unknown,
  meta: { ip: string | null; userAgent: string | null; now?: Date }
) {
  const now = meta.now ?? new Date();
  const allowed = await allowRequest(db, `accept:${meta.ip ?? "unknown"}`, { limit: 10, windowSeconds: 600 });
  if (!allowed) return fail("FORBIDDEN", "Too many attempts. Try again later.");

  const parsed = acceptInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid request", parsed.error.flatten());

  const resolved = await resolveToken(db, token, now);
  if (!resolved) return fail("NOT_FOUND", "This link is not valid");
  const { scope, share } = resolved;

  const accepted = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(scopes)
      .set({
        status: "ACCEPTED",
        acceptedAt: now.toISOString(),
        acceptedBy: parsed.data.typedName,
        updatedAt: now.toISOString(),
      })
      .where(and(eq(scopes.id, scope.id), eq(scopes.status, "SENT")))
      .returning({ id: scopes.id });
    if (claimed.length === 0) return false;
    await tx.insert(scopeAcceptances).values({
      scopeId: scope.id,
      shareId: share.id,
      typedName: parsed.data.typedName,
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
      acceptedAt: now.toISOString(),
    });
    return true;
  });
  if (!accepted) return fail("CONFLICT", "This scope can no longer be accepted");

  await logActivity(
    {
      action: "scope.accepted",
      module: "sales",
      entityType: "scope",
      entityId: scope.id,
      metadata: { by: parsed.data.typedName, dealId: scope.dealId },
    },
    db
  );
  await db.update(deals).set({ updatedAt: now.toISOString() }).where(eq(deals.id, scope.dealId));
  return ok({ acceptedAt: now.toISOString(), acceptedBy: parsed.data.typedName });
}
