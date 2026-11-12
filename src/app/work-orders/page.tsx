import { WorkOrderList } from "@/components/billing/work-order-list";
import { DashboardShell } from "@/components/dashboard-shell";

export default function Page() {
  return (
    <DashboardShell title="Work Orders" subtitle="Issued work orders and their completion.">
      <WorkOrderList />
    </DashboardShell>
  );
}
