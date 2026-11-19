import { DashboardShell } from "@/components/dashboard-shell";
import { OutreachBoard } from "@/components/sales/outreach-board";
import { LegacyImport } from "@/components/projects/legacy-import";

export default function OutreachPage() {
  return (
    <DashboardShell title="Client Outreach" subtitle="Every lead and where it stands. Follow up, email and move leads along here; record new ones on Record sales.">
      <div className="space-y-6">
        <OutreachBoard />
        <LegacyImport kind="outreach" />
      </div>
    </DashboardShell>
  );
}
