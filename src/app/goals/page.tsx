import { DashboardShell } from "@/components/dashboard-shell";
import { GoalsBoard } from "@/components/goals/goals-board";

export default function GoalsPage() {
  return (
    <DashboardShell title="Goals" subtitle="Monthly goals by team.">
      <GoalsBoard />
    </DashboardShell>
  );
}
