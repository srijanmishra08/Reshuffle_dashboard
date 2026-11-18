import { DashboardShell } from "@/components/dashboard-shell";
import { SalesNodesManager } from "@/components/sales/sales-nodes-manager";

export default function Page() {
  return (
    <DashboardShell title="Sales nodes" subtitle="Who brings us leads: sales staff, freelancers, agencies and individuals, and what each one has brought.">
      <SalesNodesManager />
    </DashboardShell>
  );
}
