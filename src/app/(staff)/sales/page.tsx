import { DashboardShell } from "@/components/dashboard-shell";
import { LeadForm } from "@/components/sales/lead-form";

export default function Page() {
  return (
    <DashboardShell title="Record sales" subtitle="Add a new lead and how to reach them. Follow it up on Outreach.">
      <LeadForm />
    </DashboardShell>
  );
}
