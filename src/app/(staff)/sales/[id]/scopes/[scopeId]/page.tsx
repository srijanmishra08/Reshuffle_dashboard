import { DashboardShell } from "@/components/dashboard-shell";
import { ScopeEditor } from "@/components/sales/scope-editor";

export default async function Page({ params }: { params: Promise<{ id: string; scopeId: string }> }) {
  const { id, scopeId } = await params;
  return (
    <DashboardShell title="Scope Maker" subtitle="Build the proposal from modules, then send and share it.">
      <ScopeEditor dealId={id} scopeId={scopeId} />
    </DashboardShell>
  );
}
