import { DashboardShell } from "@/components/dashboard-shell";
import { PipelineBoard } from "@/components/pipeline-board";

export default function AppDevPage() {
  return (
    <DashboardShell title="App Development" subtitle="Kanban-only board for sprint and release delivery.">
      <PipelineBoard module="app-dev" />
    </DashboardShell>
  );
}
