import { DashboardShell } from "@/components/dashboard-shell";
import { KpiGrid } from "@/components/kpi-grid";
import { ModulePanel } from "@/components/module-panel";
import { moduleHighlights, overviewKpis } from "@/lib/module-data";

export default function Home() {
  return (
    <DashboardShell
      title="ReShuffle Dashboard"
      subtitle="Founder-first business operating system with unified memory, automation, and execution."
    >
      <KpiGrid items={overviewKpis} />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ModulePanel
          label="Unified Activity Feed"
          points={[
            "Client Acme moved to Converted",
            "Project Website Revamp entered Sprint 9",
            "Freelancer Priya assigned to Video Campaign",
            "Invoice INV-109 marked paid",
          ]}
        />
        <ModulePanel
          label="Automation Engine"
          points={[
            "If deal stage changes -> schedule follow-up sequence",
            "If task is overdue -> notify manager and assignee",
            "If invoice is generated -> sync finance ledger",
            "If event status changes -> alert owners and partners",
          ]}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ModulePanel label="CRM" points={moduleHighlights.crm} />
        <ModulePanel label="Projects" points={moduleHighlights.projects} />
        <ModulePanel label="Social" points={moduleHighlights.social} />
      </div>
    </DashboardShell>
  );
}
