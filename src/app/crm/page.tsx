import { DashboardShell } from "@/components/dashboard-shell";
import { PipelineBoard } from "@/components/pipeline-board";

export default function CrmPage() {
  return (
    <DashboardShell title="Client CRM + Outreach" subtitle="Unified lead-to-retention workspace for relationship and conversion tracking.">
      <PipelineBoard module="crm" />
    </DashboardShell>
  );
}
