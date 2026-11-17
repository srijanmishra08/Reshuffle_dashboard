import { DashboardShell } from "@/components/dashboard-shell";
import { PipelineBoard } from "@/components/pipeline-board";
import { LegacyImport } from "@/components/projects/legacy-import";

export default function OutreachPage() {
  return (
    <DashboardShell title="Client Outreach" subtitle="Older outbound-lead board. Move a card to Sales to make it a client and a deal.">
      <div className="space-y-6">
        <LegacyImport kind="outreach" />
        <PipelineBoard module="outreach" />
      </div>
    </DashboardShell>
  );
}
