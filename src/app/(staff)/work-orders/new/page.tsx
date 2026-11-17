import { DashboardShell } from "@/components/dashboard-shell";
import { WorkOrderEditor } from "@/components/billing/work-order-editor";

export default function NewWorkOrderPage() {
  return (
    <DashboardShell title="New work order" subtitle="Pick a client, describe the job, save a draft, then issue.">
      <WorkOrderEditor />
    </DashboardShell>
  );
}
