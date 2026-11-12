import { DashboardShell } from "@/components/dashboard-shell";
import { PipelineBoard } from "@/components/pipeline-board";

export default function EventsPage() {
  return (
    <DashboardShell title="Events" subtitle="Plan, confirm and run workshops, sprints, ideathons and meetups.">
      <PipelineBoard module="events" />
    </DashboardShell>
  );
}
