import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { ModulesManager } from "@/components/sales/modules-manager";

export default function Page() {
  return (
    <DashboardShell title="Module library" subtitle="Reusable building blocks for scopes, with default deliverables, days and price.">
      <Link href="/sales" className="text-xs text-slate-500 hover:underline">
        ← Sales
      </Link>
      <ModulesManager />
    </DashboardShell>
  );
}
