"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PipelineBoard } from "@/components/pipeline-board";

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
    <DashboardShell title="Project Management" subtitle="Execution cockpit for milestones, tasks, and owners.">
      <PipelineBoard module="projects" assignees={assignees} />
    </DashboardShell>
  );
}
