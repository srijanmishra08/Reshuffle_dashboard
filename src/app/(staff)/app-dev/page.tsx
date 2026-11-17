import { DashboardShell } from "@/components/dashboard-shell";
import { PipelineBoard } from "@/components/pipeline-board";
import { LegacyImport } from "@/components/projects/legacy-import";

export default function AppDevPage() {
  return (
    <DashboardShell title="App Development" subtitle="Sprints, bugs and releases. Move a card onto a client's project to put it on that project's task board.">
      <div className="space-y-6">
        <LegacyImport kind="app-dev" />
        <PipelineBoard module="app-dev" />
      </div>
    </DashboardShell>
  );
}
