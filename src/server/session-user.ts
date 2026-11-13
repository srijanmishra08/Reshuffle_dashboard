import { eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { isRole, type Role } from "@/server/roles";

export type AuthedUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgId: string;
};

type RawSessionUser = {
  id: string;
  email: string;
  name: string;
  role?: string | null;
  orgId?: string | null;
  active?: boolean | null;
};

function bootstrapAdminEmails(): string[] {
  return (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/** Decide whether an email may sign in, and with which role. Returns null if not allowed. */
export async function resolveRoleForEmail(db: Db, email: string): Promise<Role | null> {
  const normalized = email.trim().toLowerCase();

  if (bootstrapAdminEmails().includes(normalized)) {
    return "ADMIN";
  }

  const rows = await db
    .select({ role: schema.allowedEmails.role })
    .from(schema.allowedEmails)
    .where(eq(schema.allowedEmails.email, normalized))
    .limit(1);

  const role = rows[0]?.role;
  return role && isRole(role) ? role : null;
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

  const role = await resolveRoleForEmail(db, raw.email);

  if (!role) {
    return null;
  }

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
  };
}
