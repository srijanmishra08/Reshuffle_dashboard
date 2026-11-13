import { DashboardShell } from "@/components/dashboard-shell";
import { PersonDetailView } from "@/components/people/person-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <DashboardShell title="Person" subtitle="Profile and salary slips.">
      <PersonDetailView id={id} />
    </DashboardShell>
  );
}
