import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { isRole, type Role } from "@/server/roles";

/** The one record an outside person's sign-in is linked to. All null for staff. */
export type AccessLinks = { companyId: string | null; freelancerId: string | null; agencyId: string | null };

export type AuthedUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgId: string;
  links: AccessLinks;
  /** True when an admin is previewing an outside portal with demo data. */
  previewing?: boolean;
};

const NO_LINKS: AccessLinks = { companyId: null, freelancerId: null, agencyId: null };

type RawSessionUser = {
  id: string;
  email: string;
  name: string;
  role?: string | null;
  orgId?: string | null;
  active?: boolean | null;
};

export function bootstrapAdminEmails(): string[] {
  return (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/** Decide whether an email may sign in, with which role and which linked record. Returns null if not allowed. */
export async function resolveAccessForEmail(db: Db, email: string): Promise<{ role: Role; links: AccessLinks } | null> {
  const normalized = email.trim().toLowerCase();

  if (bootstrapAdminEmails().includes(normalized)) {
    return { role: "ADMIN", links: NO_LINKS };
  }

  const rows = await db
    .select({
      role: schema.allowedEmails.role,
      companyId: schema.allowedEmails.companyId,
      freelancerId: schema.allowedEmails.freelancerId,
      agencyId: schema.allowedEmails.agencyId,
    })
    .from(schema.allowedEmails)
    .where(eq(schema.allowedEmails.email, normalized))
    .limit(1);

  const row = rows[0];
  if (!row || !isRole(row.role)) return null;
  return { role: row.role, links: { companyId: row.companyId, freelancerId: row.freelancerId, agencyId: row.agencyId } };
}

/** Decide whether an email may sign in, and with which role. Returns null if not allowed. */
export async function resolveRoleForEmail(db: Db, email: string): Promise<Role | null> {
  return (await resolveAccessForEmail(db, email))?.role ?? null;
}

/**
 * Turn a session's user record into the acting user, re-checking the allowlist every time.
 * Returns null when the user is deactivated or the email is no longer allowed (revoked).
 * When the allowlist role differs from the stored role the allowlist wins and the stored role is synced.
 */
export async function resolveSessionUser(db: Db, raw: RawSessionUser): Promise<AuthedUser | null> {
  if (raw.active === false) {
    return null;
  }

  const access = await resolveAccessForEmail(db, raw.email);

  if (!access) {
    return null;
  }

  const { role, links } = access;

  if (raw.role !== role) {
    try {
      await db.update(schema.user).set({ role, updatedAt: new Date() }).where(eq(schema.user.id, raw.id));
    } catch (error) {
      // The effective role for this request is already correct; a failed sync is retried on the next request.
      console.error("Could not sync user role from allowlist", error);
    }
  }

  return {
    id: raw.id,
    email: raw.email,
    name: raw.name,
    role,
    orgId: raw.orgId ?? "default",
    links,
  };
}
