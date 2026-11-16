import { DashboardShell } from "@/components/dashboard-shell";
import { DealDetail } from "@/components/sales/deal-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <DashboardShell title="Deal" subtitle="Discovery, scope versions and conversion to a project.">
      <DealDetail id={id} />
    </DashboardShell>
  );
}
