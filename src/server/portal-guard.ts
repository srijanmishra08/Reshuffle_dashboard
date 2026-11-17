import { redirect } from "next/navigation";
import { getSessionUser, type AuthedUser } from "@/server/authz";
import { homeFor, type Role } from "@/server/roles";

/**
 * Page guard for the outside portals. Signed-out visitors go to sign-in; anyone signed in with a
 * different role goes to their own home, so a client never sees a freelancer page or the team dashboard.
 */
export async function requirePortalUser(role: Role): Promise<AuthedUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(homeFor(user.role));
  return user;
}
