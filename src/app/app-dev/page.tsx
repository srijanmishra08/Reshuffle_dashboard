import { DashboardShell } from "@/components/dashboard-shell";
import { PipelineBoard } from "@/components/pipeline-board";
import { pipelineSeedItems } from "@/lib/pipeline-seeds";

export default function AppDevPage() {
  return (
    <DashboardShell title="App Development" subtitle="Kanban-only board for sprint and release delivery.">
      <PipelineBoard module="app-dev" initialItems={pipelineSeedItems["app-dev"]} />
    </DashboardShell>
  );
}
