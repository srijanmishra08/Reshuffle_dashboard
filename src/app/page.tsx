import { DashboardShell } from "@/components/dashboard-shell";
import { OverviewDashboard } from "@/components/overview/overview-dashboard";

export default function Home() {
  return (
    <DashboardShell title="ReShuffle Dashboard" subtitle="Pipeline, receivables, delivery and this week's follow-ups.">
      <OverviewDashboard />
    </DashboardShell>
  );
}
