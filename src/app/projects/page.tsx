"use client";

import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PipelineBoard } from "@/components/pipeline-board";
import { pipelineSeedItems } from "@/lib/pipeline-seeds";
import { loadFreelancerNames } from "@/lib/freelancer-store";

export default function ProjectsPage() {
  const [assignees, setAssignees] = useState<string[]>([]);

  useEffect(() => {
    setAssignees(loadFreelancerNames());
  }, []);

  return (
    <DashboardShell title="Project Management" subtitle="Execution cockpit for milestones, tasks, and owners.">
      <PipelineBoard module="projects" initialItems={pipelineSeedItems.projects} assignees={assignees} />
    </DashboardShell>
  );
}
