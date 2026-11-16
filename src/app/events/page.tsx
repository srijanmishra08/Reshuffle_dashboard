import { DashboardShell } from "@/components/dashboard-shell";
import { EventsWorkspace } from "@/components/events/events-workspace";

export default function EventsPage() {
  return (
    <DashboardShell title="Events" subtitle="Plan, confirm and run workshops, sprints, ideathons and meetups.">
      <EventsWorkspace />
    </DashboardShell>
  );
}
