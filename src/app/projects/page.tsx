"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PipelineBoard } from "@/components/pipeline-board";
import { DeliveryProjectList } from "@/components/projects/delivery-project-list";

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
      <div className="space-y-8">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase text-slate-500">Delivery projects</h2>
          <DeliveryProjectList />
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase text-slate-500">Task board (legacy)</h2>
          <PipelineBoard module="projects" assignees={assignees} />
        </section>
      </div>
    </DashboardShell>
  );
}
