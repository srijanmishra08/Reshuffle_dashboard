import { DashboardShell } from "@/components/dashboard-shell";
import { DocsWorkspace } from "@/components/docs/docs-workspace";

export default function DocsPage() {
  return (
    <DashboardShell title="Docs" subtitle="SOPs, playbooks, decision logs and notes.">
      <DocsWorkspace />
    </DashboardShell>
  );
}
