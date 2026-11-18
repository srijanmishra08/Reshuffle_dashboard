import { DashboardShell } from "@/components/dashboard-shell";
import { OutreachBoard } from "@/components/sales/outreach-board";
import { LegacyImport } from "@/components/projects/legacy-import";

export default function OutreachPage() {
  return (
    <DashboardShell title="Client Outreach" subtitle="Every open lead from the Sales board, sorted by what needs a follow-up first.">
      <div className="space-y-6">
        <OutreachBoard />
        <LegacyImport kind="outreach" />
      </div>
    </DashboardShell>
  );
}
