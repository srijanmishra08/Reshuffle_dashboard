import { DashboardShell } from "@/components/dashboard-shell";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";

export default function Page() {
  return (
    <DashboardShell title="Finance" subtitle="Ledger, receivables, monthly totals and GST for the CA.">
      <FinanceWorkspace />
    </DashboardShell>
  );
}
