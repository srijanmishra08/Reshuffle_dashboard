import { DashboardShell } from "@/components/dashboard-shell";
import { MarketingWorkspace } from "@/components/marketing/marketing-workspace";

export default function MarketingPage() {
  return (
    <DashboardShell title="Marketing" subtitle="Content calendar and social accounts.">
      <MarketingWorkspace />
    </DashboardShell>
  );
}
