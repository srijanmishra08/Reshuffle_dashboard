import { InvoiceEditor } from "@/components/billing/invoice-editor";
import { DashboardShell } from "@/components/dashboard-shell";
import { getSessionUser } from "@/server/authz";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  return (
    <DashboardShell title="Invoice" subtitle="Drafts are editable. Issued invoices are frozen.">
      <InvoiceEditor invoiceId={id} canDelete={user?.role === "ADMIN"} />
    </DashboardShell>
  );
}
