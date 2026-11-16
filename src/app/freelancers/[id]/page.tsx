import { DashboardShell } from "@/components/dashboard-shell";
import { FreelancerDetail } from "@/components/freelancers/freelancer-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <DashboardShell title="Freelancer" subtitle="Project assignments, utilization and payouts.">
      <FreelancerDetail id={id} />
    </DashboardShell>
  );
}
