import { CompanyDetail } from "@/components/crm/company-detail";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <DashboardShell title="Company" subtitle="Contacts, timeline and next actions.">
      <CompanyDetail companyId={id} />
    </DashboardShell>
  );
}
