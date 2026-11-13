import { DashboardShell } from "@/components/dashboard-shell";
import { DeliveryProjectDetailView } from "@/components/projects/delivery-project-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <DashboardShell title="Project" subtitle="Milestones and billing.">
      <DeliveryProjectDetailView id={id} />
    </DashboardShell>
  );
}
