import { InvoiceList } from "@/components/billing/invoice-list";
import { DashboardShell } from "@/components/dashboard-shell";

export default function Page() {
  return (
    <DashboardShell title="Invoices" subtitle="GST invoices, payments and what clients still owe.">
      <InvoiceList />
    </DashboardShell>
  );
}
