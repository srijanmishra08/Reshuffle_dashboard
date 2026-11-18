import { DashboardShell } from "@/components/dashboard-shell";
import { DealBoard } from "@/components/sales/deal-board";

export default function Page() {
  return (
    <DashboardShell title="Sales" subtitle="Leads from first contact to an accepted project, with value per stage.">
      <DealBoard />
    </DashboardShell>
  );
}
