import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/authz";
import { homeFor, roleAllowed, STAFF } from "@/server/roles";

/**
 * Everything in the team dashboard is for staff. Clients, partner agencies and freelancers who open
 * one of these addresses are sent to their own portal. The API checks the role again on every request.
 */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!roleAllowed(user.role, STAFF)) redirect(homeFor(user.role));
  return children;
}
