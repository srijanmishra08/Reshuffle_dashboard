"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PipelineBoard } from "@/components/pipeline-board";
import { ProjectProgress } from "@/components/projects/project-progress";

export default function ProjectsPage() {
  const [assignees, setAssignees] = useState<string[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        const response = await fetch("/api/freelancers", { cache: "no-store" });
        const json = (await response.json()) as {
          data?: Array<{ freelancer: string }>;
        };

        if (!response.ok || !json.data) {
          return;
        }

        setAssignees(
          json.data
            .map((row) => row.freelancer)
            .filter((name) => typeof name === "string" && name.trim().length > 0)
        );
      } catch {
        // Ignore assignee load failures.
      }
    };

    void run();
  }, []);

  return (
    <DashboardShell title="Project Management" subtitle="Progress of every client project. Open one for its task board and milestones.">
      <div className="space-y-8">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase text-slate-500">All projects and their progress</h2>
          <ProjectProgress />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase text-slate-500">Old task board (not linked to clients)</h2>
          <PipelineBoard module="projects" assignees={assignees} />
        </section>
      </div>
    </DashboardShell>
  );
}
