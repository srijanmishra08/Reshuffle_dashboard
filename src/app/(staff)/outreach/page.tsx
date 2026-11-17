import { DashboardShell } from "@/components/dashboard-shell";
import { PipelineBoard } from "@/components/pipeline-board";

export default function OutreachPage() {
  return (
    <DashboardShell title="Client Outreach" subtitle="Track outbound leads from first touch to closed deals.">
      <PipelineBoard module="outreach" />
    </DashboardShell>
  );
}
