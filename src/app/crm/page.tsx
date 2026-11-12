import { CrmWorkspace } from "@/components/crm/crm-workspace";
import { DashboardShell } from "@/components/dashboard-shell";

export default function CrmPage() {
  return (
    <DashboardShell title="Clients" subtitle="Companies, contacts and every touch, from first call to maintenance.">
      <CrmWorkspace />
    </DashboardShell>
  );
}
