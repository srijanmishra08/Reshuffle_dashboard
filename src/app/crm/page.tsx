import { DashboardShell } from "@/components/dashboard-shell";
import { PipelineBoard } from "@/components/pipeline-board";
import { pipelineSeedItems } from "@/lib/pipeline-seeds";

export default function CrmPage() {
  return (
    <DashboardShell title="Client CRM + Outreach" subtitle="Unified lead-to-retention workspace for relationship and conversion tracking.">
      <PipelineBoard module="crm" initialItems={pipelineSeedItems.crm} />
    </DashboardShell>
  );
}
