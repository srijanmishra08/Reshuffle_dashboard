import { AccessManager } from "@/components/access/access-manager";
import { DashboardShell } from "@/components/dashboard-shell";
import { requirePageRole } from "@/server/authz";
import { ADMIN_ONLY } from "@/server/roles";

export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const user = await requirePageRole(ADMIN_ONLY, "/access");
  return (
    <DashboardShell title="Access" subtitle="Who can sign in: your team, clients, partner agencies and freelancers.">
      {user ? <AccessManager /> : <p className="text-sm text-slate-600">Only admins can manage access.</p>}
    </DashboardShell>
  );
}
