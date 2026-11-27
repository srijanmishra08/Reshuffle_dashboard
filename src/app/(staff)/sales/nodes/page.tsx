import { DashboardShell } from "@/components/dashboard-shell";
import { SalesNodesManager } from "@/components/sales/sales-nodes-manager";
import { getSessionUser } from "@/server/authz";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getSessionUser();
  return (
    <DashboardShell title="Sales nodes" subtitle="Who brings us leads: sales staff, freelancers, agencies and individuals, what each one has brought, and the referral commission paid and owed.">
      <SalesNodesManager isAdmin={user?.role === "ADMIN"} />
    </DashboardShell>
  );
}
