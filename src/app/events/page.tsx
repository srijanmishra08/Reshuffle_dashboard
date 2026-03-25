import { DashboardShell } from "@/components/dashboard-shell";
import { ModulePanel } from "@/components/module-panel";
import { PipelineBoard } from "@/components/pipeline-board";
import { pipelineSeedItems } from "@/lib/pipeline-seeds";

export default function EventsPage() {
  return (
    <DashboardShell title="Social Calendar" subtitle="Calendar structure with kanban planning for campaigns and content.">
      <div className="grid gap-4 lg:grid-cols-2">
        <ModulePanel
          label="Calendar Structure"
          points={[
            "Week 1: Brand stories and founder content",
            "Week 2: Client wins and testimonials",
            "Week 3: Product updates and behind-the-scenes",
            "Week 4: Community collabs and event recaps",
          ]}
        />
        <ModulePanel
          label="Actions"
          points={[
            "Finalize monthly content themes",
            "Lock publishing windows across platforms",
            "Move cards from idea to scheduled",
          ]}
        />
      </div>
      <PipelineBoard module="social" initialItems={pipelineSeedItems.social} />
    </DashboardShell>
  );
}
