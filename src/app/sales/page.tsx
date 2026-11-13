import { DashboardShell } from "@/components/dashboard-shell";
import { DealBoard } from "@/components/sales/deal-board";

export default function Page() {
  return (
    <DashboardShell title="Sales" subtitle="Deals from lead to won, with value per stage.">
      <DealBoard />
    </DashboardShell>
  );
}
