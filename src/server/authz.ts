import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth";
import { isRole, roleAllowed, STAFF, type Role } from "@/server/roles";

export type AuthedUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgId: string;
};

export type Guard =
  | { ok: true; user: AuthedUser }
  | { ok: false; response: NextResponse };

function deny(status: 401 | 403, error: string): Guard {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/** Resolve the signed-in user from the request cookies, or null. */
export async function getSessionUser(): Promise<AuthedUser | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const user = session?.user as
    | (NonNullable<typeof session>["user"] & { role?: string; orgId?: string; active?: boolean })
    | undefined;

  if (!user || user.active === false) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: isRole(user.role) ? user.role : "MEMBER",
    orgId: user.orgId ?? "default",
  };
}

/** Route-handler guard. Usage: `const g = await requireRole(["ADMIN"]); if (!g.ok) return g.response;` */
export async function requireRole(allowed: readonly Role[]): Promise<Guard> {
  const user = await getSessionUser();

  if (!user) {
    return deny(401, "Authentication required");
  }

  if (!roleAllowed(user.role, allowed)) {
    return deny(403, "You do not have access to this resource");
  }

  return { ok: true, user };
}

/** Any signed-in internal team member (not freelancers). */
export function requireStaff(): Promise<Guard> {
  return requireRole(STAFF);
}

/** Money documents (invoices, payments, work orders): admins and managers only. */
export function requireBilling(): Promise<Guard> {
  return requireRole(["ADMIN", "MANAGER"]);
}

/**
 * Server-component guard for pages. Redirects signed-out visitors to /login and returns null
 * when the user is signed in but their role is not allowed, so the page can render a no-access state.
 */
export async function requirePageRole(allowed: readonly Role[], returnTo: string): Promise<AuthedUser | null> {
  const user = await getSessionUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  }

  return roleAllowed(user.role, allowed) ? user : null;
}
