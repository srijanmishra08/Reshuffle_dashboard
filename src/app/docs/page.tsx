import { DashboardShell } from "@/components/dashboard-shell";
import { ModulePanel } from "@/components/module-panel";
import { PipelineBoard } from "@/components/pipeline-board";
import { moduleHighlights } from "@/lib/module-data";
import { pipelineSeedItems } from "@/lib/pipeline-seeds";

export default function DocsPage() {
  return (
    <DashboardShell title="Documentation System" subtitle="Versioned playbooks linked to real operating entities.">
      <div className="grid gap-4 lg:grid-cols-2">
        <ModulePanel label="Knowledge Base" points={moduleHighlights.docs} />
        <ModulePanel
          label="Actions"
          points={[
            "Store SOPs and execution playbooks",
            "Attach docs to client and project records",
            "Track revision history and ownership",
          ]}
        />
      </div>
      <PipelineBoard module="docs" initialItems={pipelineSeedItems.docs} />
    </DashboardShell>
  );
}
