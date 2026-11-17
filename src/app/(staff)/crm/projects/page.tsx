import { DashboardShell } from "@/components/dashboard-shell";
import { ProjectProgress } from "@/components/projects/project-progress";

export default function ClientProjectsPage() {
  return (
    <DashboardShell title="Client projects" subtitle="Every client's projects and how far along they are. Open a project for its task board.">
      <ProjectProgress groupByClient />
    </DashboardShell>
  );
}
