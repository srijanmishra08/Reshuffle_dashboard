import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import {
  accessInputSchema,
  accessRevokeSchema,
  agencyInputSchema,
  agencyMemberSchema,
  agencyPatchSchema,
} from "@/lib/schemas/access";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";
import { bootstrapAdminEmails } from "@/server/session-user";
import { LINK_FOR_ROLE, PORTAL_ROLES, type Role } from "@/server/roles";

const { allowedEmails, agencies, agencyFreelancers, companies, legacyFreelancers, user } = schema;

function audit(db: Db, ctx: ServiceContext, action: string, id: string, metadata?: Record<string, unknown>) {
  return logActivity({ actorId: ctx.userId, action: `access.${action}`, module: "settings", entityType: "access", entityId: id, metadata }, db);
}

/** Everyone who may sign in, with the record each outside person is linked to. */
export async function listAccess(db: Db, ctx: ServiceContext) {
  const rows = await db
    .select({
      email: allowedEmails.email,
      role: allowedEmails.role,
      createdAt: allowedEmails.createdAt,
      companyName: companies.name,
      freelancerName: legacyFreelancers.freelancer,
      agencyName: agencies.name,
      signedInAs: user.id,
    })
    .from(allowedEmails)
    .leftJoin(companies, eq(companies.id, allowedEmails.companyId))
    .leftJoin(legacyFreelancers, eq(legacyFreelancers.id, allowedEmails.freelancerId))
    .leftJoin(agencies, eq(agencies.id, allowedEmails.agencyId))
    .leftJoin(user, eq(user.email, allowedEmails.email))
    .where(eq(allowedEmails.orgId, ctx.orgId))
    .orderBy(asc(allowedEmails.role), asc(allowedEmails.email));
  return ok(
    rows.map((r) => ({
      email: r.email,
      role: r.role,
      linkedTo: r.companyName ?? r.freelancerName ?? r.agencyName ?? null,
      hasSignedIn: r.signedInAs !== null,
      createdAt: r.createdAt,
    }))
  );
}

/**
 * Adds or changes an email on the allowlist. Outside roles must link to exactly the record that fits them,
 * and staff roles to none. An admin cannot change their own access, so nobody locks themselves out.
 */
export async function grantAccess(db: Db, ctx: ServiceContext, actorEmail: string, raw: unknown) {
  const parsed = accessInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid access", parsed.error.flatten());
  const input = parsed.data;
  if (input.email === actorEmail.trim().toLowerCase()) return fail("CONFLICT", "You cannot change your own access");
  if (bootstrapAdminEmails().includes(input.email)) return fail("CONFLICT", "This email is an admin set in the server settings");

  const role = input.role as Role;
  const linkKey = (LINK_FOR_ROLE as Record<string, "companyId" | "freelancerId" | "agencyId">)[role];
  const links = { companyId: null as string | null, freelancerId: null as string | null, agencyId: null as string | null };
  if (linkKey) {
    const id = input[linkKey];
    if (!id) return fail("VALIDATION", role === "CLIENT" ? "Choose the client" : role === "AGENCY" ? "Choose the agency" : "Choose the freelancer");
    const exists =
      linkKey === "companyId"
        ? await db.select({ id: companies.id }).from(companies).where(and(eq(companies.id, id), eq(companies.orgId, ctx.orgId))).limit(1)
        : linkKey === "agencyId"
          ? await db.select({ id: agencies.id }).from(agencies).where(and(eq(agencies.id, id), eq(agencies.orgId, ctx.orgId))).limit(1)
          : await db.select({ id: legacyFreelancers.id }).from(legacyFreelancers).where(eq(legacyFreelancers.id, id)).limit(1);
    if (exists.length === 0) return fail("NOT_FOUND", "The linked record was not found");
    links[linkKey] = id;
  } else if (input.companyId || input.freelancerId || input.agencyId) {
    return fail("VALIDATION", "Team roles are not linked to a client, freelancer or agency");
  }

  await db
    .insert(allowedEmails)
    .values({ email: input.email, orgId: ctx.orgId, role, ...links, createdBy: ctx.userId })
    .onConflictDoUpdate({ target: allowedEmails.email, set: { orgId: ctx.orgId, role, ...links, createdBy: ctx.userId } });
  await audit(db, ctx, "granted", input.email, { role });
  return ok({ email: input.email, role });
}

/** Removes an email from the allowlist. Their next request is refused, so access ends at once. */
export async function revokeAccess(db: Db, ctx: ServiceContext, actorEmail: string, raw: unknown) {
  const parsed = accessRevokeSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid email");
  const email = parsed.data.email;
  if (email === actorEmail.trim().toLowerCase()) return fail("CONFLICT", "You cannot remove your own access");
  if (bootstrapAdminEmails().includes(email)) return fail("CONFLICT", "This email is an admin set in the server settings");
  const removed = await db
    .delete(allowedEmails)
    .where(and(eq(allowedEmails.email, email), eq(allowedEmails.orgId, ctx.orgId)))
    .returning({ email: allowedEmails.email });
  if (removed.length === 0) return fail("NOT_FOUND", "That email has no access");
  await audit(db, ctx, "revoked", email);
  return ok({ email });
}

/* --------------------------------- agencies -------------------------------- */

export async function listAgencies(db: Db, ctx: ServiceContext) {
  const rows = await db.select().from(agencies).where(eq(agencies.orgId, ctx.orgId)).orderBy(asc(agencies.name));
  if (rows.length === 0) return ok([]);
  const members = await db
    .select({ agencyId: agencyFreelancers.agencyId, freelancerId: legacyFreelancers.id, name: legacyFreelancers.freelancer })
    .from(agencyFreelancers)
    .innerJoin(legacyFreelancers, eq(legacyFreelancers.id, agencyFreelancers.freelancerId))
    .where(inArray(agencyFreelancers.agencyId, rows.map((r) => r.id)))
    .orderBy(asc(legacyFreelancers.freelancer));
  return ok(rows.map((a) => ({ ...a, members: members.filter((m) => m.agencyId === a.id).map(({ freelancerId, name }) => ({ freelancerId, name })) })));
}

async function findAgency(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db.select().from(agencies).where(and(eq(agencies.id, id), eq(agencies.orgId, ctx.orgId))).limit(1);
  return rows[0] ?? null;
}

async function nameTaken(db: Db, ctx: ServiceContext, name: string, exceptId?: string) {
  const rows = await db.select({ id: agencies.id }).from(agencies).where(and(eq(agencies.orgId, ctx.orgId), eq(agencies.name, name)));
  return rows.some((r) => r.id !== exceptId);
}

export async function createAgency(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = agencyInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid agency", parsed.error.flatten());
  const input = parsed.data;
  if (await nameTaken(db, ctx, input.name)) return fail("CONFLICT", "An agency with this name already exists");
  const [row] = await db
    .insert(agencies)
    .values({ orgId: ctx.orgId, name: input.name, contactName: input.contactName ?? null, contactEmail: input.contactEmail ?? null, notes: input.notes ?? null })
    .returning();
  await audit(db, ctx, "agency_created", row.id, { name: row.name });
  return ok(row);
}

export async function updateAgency(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = agencyPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid agency", parsed.error.flatten());
  if (!(await findAgency(db, ctx, id))) return fail("NOT_FOUND", "Agency not found");
  if (parsed.data.name && (await nameTaken(db, ctx, parsed.data.name, id))) return fail("CONFLICT", "An agency with this name already exists");
  const changes: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(parsed.data)) if (v !== undefined) changes[k] = v;
  const [row] = await db.update(agencies).set(changes).where(eq(agencies.id, id)).returning();
  await audit(db, ctx, "agency_updated", id);
  return ok(row);
}

/** Deleting an agency also ends the sign-ins linked to it and frees its freelancers. */
export async function deleteAgency(db: Db, ctx: ServiceContext, id: string) {
  if (!(await findAgency(db, ctx, id))) return fail("NOT_FOUND", "Agency not found");
  await db.delete(agencies).where(eq(agencies.id, id));
  await audit(db, ctx, "agency_deleted", id);
  return ok({ id });
}

export async function addAgencyMember(db: Db, ctx: ServiceContext, agencyId: string, raw: unknown) {
  const parsed = agencyMemberSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid member");
  if (!(await findAgency(db, ctx, agencyId))) return fail("NOT_FOUND", "Agency not found");
  const { freelancerId } = parsed.data;
  const freelancer = await db.select({ id: legacyFreelancers.id }).from(legacyFreelancers).where(eq(legacyFreelancers.id, freelancerId)).limit(1);
  if (freelancer.length === 0) return fail("NOT_FOUND", "Freelancer not found");
  const existing = await db
    .select({ agencyId: agencyFreelancers.agencyId, agencyName: agencies.name })
    .from(agencyFreelancers)
    .innerJoin(agencies, eq(agencies.id, agencyFreelancers.agencyId))
    .where(eq(agencyFreelancers.freelancerId, freelancerId))
    .limit(1);
  if (existing[0]) {
    return existing[0].agencyId === agencyId
      ? ok({ agencyId, freelancerId })
      : fail("CONFLICT", `This freelancer already belongs to ${existing[0].agencyName}`);
  }
  await db.insert(agencyFreelancers).values({ agencyId, freelancerId, orgId: ctx.orgId });
  await audit(db, ctx, "member_added", agencyId, { freelancerId });
  return ok({ agencyId, freelancerId });
}

export async function removeAgencyMember(db: Db, ctx: ServiceContext, agencyId: string, raw: unknown) {
  const parsed = agencyMemberSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid member");
  if (!(await findAgency(db, ctx, agencyId))) return fail("NOT_FOUND", "Agency not found");
  const removed = await db
    .delete(agencyFreelancers)
    .where(and(eq(agencyFreelancers.agencyId, agencyId), eq(agencyFreelancers.freelancerId, parsed.data.freelancerId)))
    .returning({ freelancerId: agencyFreelancers.freelancerId });
  if (removed.length === 0) return fail("NOT_FOUND", "That freelancer is not in this agency");
  await audit(db, ctx, "member_removed", agencyId, { freelancerId: parsed.data.freelancerId });
  return ok({ agencyId, freelancerId: parsed.data.freelancerId });
}

export const isPortalRole = (role: string) => (PORTAL_ROLES as readonly string[]).includes(role);
