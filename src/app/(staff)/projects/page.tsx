import { DashboardShell } from "@/components/dashboard-shell";
import { LegacyImport } from "@/components/projects/legacy-import";
import { ProjectProgress } from "@/components/projects/project-progress";

export default function ProjectsPage() {
  return (
    <DashboardShell title="Projects" subtitle="Progress of every client project. Open one for its task board, team and billing.">
      <div className="space-y-8">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase text-slate-500">All projects and their progress</h2>
          <ProjectProgress />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase text-slate-500">Old task board</h2>
          <LegacyImport kind="tasks" />
        </section>
      </div>
    </DashboardShell>
  );
}
