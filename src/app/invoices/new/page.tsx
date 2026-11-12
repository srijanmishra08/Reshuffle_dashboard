import { InvoiceEditor } from "@/components/billing/invoice-editor";
import { DashboardShell } from "@/components/dashboard-shell";

export default function NewInvoicePage() {
  return (
    <DashboardShell title="New invoice" subtitle="Pick a client, add lines, save a draft, then issue.">
      <InvoiceEditor />
    </DashboardShell>
  );
}
