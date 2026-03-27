import { DashboardShell } from "@/components/dashboard-shell";
import { PipelineBoard } from "@/components/pipeline-board";
import { pipelineSeedItems } from "@/lib/pipeline-seeds";

export default function OutreachPage() {
  return (
    <DashboardShell title="Client Outreach" subtitle="Track outbound leads from first touch to closed deals.">
      <PipelineBoard module="outreach" initialItems={pipelineSeedItems.outreach} />
    </DashboardShell>
  );
}
