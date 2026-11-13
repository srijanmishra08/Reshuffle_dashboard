import { InvoiceEditor } from "@/components/billing/invoice-editor";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <DashboardShell title="Invoice" subtitle="Drafts are editable. Issued invoices are frozen.">
      <InvoiceEditor invoiceId={id} />
    </DashboardShell>
  );
}
