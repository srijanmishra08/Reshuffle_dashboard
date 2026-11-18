import Link from "next/link";
import { InvoiceList } from "@/components/billing/invoice-list";
import { DashboardShell } from "@/components/dashboard-shell";
import { InvoicePdfLibrary } from "@/components/invoice-pdfs/invoice-pdf-library";
import { getSessionUser } from "@/server/authz";
import { MANAGERS, roleAllowed } from "@/server/roles";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ tab?: string | string[] }>;

const tabClass = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`;

export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const { tab } = await searchParams;
  const user = await getSessionUser();
  const canSeePdfs = Boolean(user && roleAllowed(user.role, MANAGERS));
  const showPdfs = canSeePdfs && tab === "pdfs";

  return (
    <DashboardShell title="Invoices" subtitle="GST invoices, payments and what clients still owe.">
      {canSeePdfs ? (
        <nav aria-label="Invoice views" className="mb-4 flex gap-1">
          <Link href="/invoices" className={tabClass(!showPdfs)} aria-current={showPdfs ? undefined : "page"}>
            Invoices
          </Link>
          <Link href="/invoices?tab=pdfs" className={tabClass(showPdfs)} aria-current={showPdfs ? "page" : undefined}>
            PDFs from invoice software
          </Link>
        </nav>
      ) : null}
      {showPdfs ? <InvoicePdfLibrary isAdmin={user?.role === "ADMIN"} /> : <InvoiceList />}
    </DashboardShell>
  );
}
