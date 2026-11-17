import { DashboardShell } from "@/components/dashboard-shell";
import { WorkOrderEditor } from "@/components/billing/work-order-editor";

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <DashboardShell title="Work order" subtitle="Drafts are editable. Issued work orders are frozen.">
      <WorkOrderEditor workOrderId={id} />
    </DashboardShell>
  );
}
