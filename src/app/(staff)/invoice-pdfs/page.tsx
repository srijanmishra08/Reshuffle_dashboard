import { DashboardShell } from "@/components/dashboard-shell";
import { InvoicePdfLibrary } from "@/components/invoice-pdfs/invoice-pdf-library";
import { requirePageRole } from "@/server/authz";
import { MANAGERS } from "@/server/roles";

export const dynamic = "force-dynamic";

export default async function InvoicePdfsPage() {
  const user = await requirePageRole(MANAGERS, "/invoice-pdfs");
  return (
    <DashboardShell title="Invoice PDFs" subtitle="PDFs made in the invoice software are saved here automatically.">
      {user ? <InvoicePdfLibrary isAdmin={user.role === "ADMIN"} /> : <p className="text-sm text-slate-600">Only admins and managers can see invoice PDFs.</p>}
    </DashboardShell>
  );
}
