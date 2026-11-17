import { cookies, headers } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getAuth } from "@/server/auth";
import { getDb } from "@/server/db/client";
import { parsePreviewChoice, PREVIEW_COOKIE, previewUser } from "@/server/preview";
import { roleAllowed, STAFF, type Role } from "@/server/roles";
import { resolveSessionUser, type AuthedUser } from "@/server/session-user";

export type { AuthedUser };

export type Guard =
  | { ok: true; user: AuthedUser }
  | { ok: false; response: NextResponse };

function deny(status: 401 | 403, error: string): Guard {
  return { ok: false, response: NextResponse.json({ error }, { status }) };
}

/**
 * The signed-in user as their own account, ignoring any portal preview. Wrapped in React's `cache`, so the layout,
 * page and components of one page render share a single lookup instead of repeating it.
 */
export const getRealSessionUser = cache(async (): Promise<AuthedUser | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const user = session?.user as
    | (NonNullable<typeof session>["user"] & { role?: string; orgId?: string; active?: boolean })
    | undefined;

  if (!user) {
    return null;
  }

  return resolveSessionUser(getDb(), user);
});

async function previewChoiceFromCookie() {
  try {
    return parsePreviewChoice((await cookies()).get(PREVIEW_COOKIE)?.value);
  } catch {
    // No request cookies here (for example a test without a request): no preview.
    return null;
  }
}

/**
 * Resolve the acting user from the request cookies, or null. An admin who is previewing a portal
 * acts as that portal's role against demo data; nobody else can preview.
 */
export const getSessionUser = cache(async (): Promise<AuthedUser | null> => {
  const real = await getRealSessionUser();
  if (!real || real.role !== "ADMIN") return real;
  const choice = await previewChoiceFromCookie();
  return choice ? previewUser(real, choice) : real;
});

/** Guard for starting or ending a preview and managing demo data: the real account must be an admin. */
export async function requireRealAdmin(): Promise<Guard> {
  const user = await getRealSessionUser();
  if (!user) return deny(401, "Authentication required");
  if (user.role !== "ADMIN") return deny(403, "You do not have access to this resource");
  return { ok: true, user };
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
