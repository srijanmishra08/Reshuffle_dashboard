import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Code2,
  FileText,
  LayoutDashboard,
  Megaphone,
  Receipt,
  Users,
  UserSquare2,
} from "lucide-react";

export type ModuleNavItem = {
  title: string;
  href: string;
  description: string;
  icon: LucideIcon;
};

export const moduleNav: ModuleNavItem[] = [
  {
    title: "Overview",
    href: "/",
    description: "Executive command center and KPIs.",
    icon: LayoutDashboard,
  },
  {
    title: "Client CRM + Outreach",
    href: "/crm",
    description: "Leads, outreach, notes, reminders, and retention.",
    icon: Users,
  },
  {
    title: "Project Management",
    href: "/projects",
    description: "Kanban, milestones, and resource planning.",
    icon: Briefcase,
  },
  {
    title: "Social Media",
    href: "/social",
    description: "Kanban-only workflow for social execution.",
    icon: Megaphone,
  },
  {
    title: "App Development",
    href: "/app-dev",
    description: "Sprints, bugs, and deployment lifecycle.",
    icon: Code2,
  },
  {
    title: "Freelancers",
    href: "/freelancers",
    description: "Availability, assignments, and ratings.",
    icon: UserSquare2,
  },
  {
    title: "Finance",
    href: "/finance",
    description: "Revenue, expenses, payouts, and cash view.",
    icon: Receipt,
  },
  {
    title: "Documentation",
    href: "/docs",
    description: "SOPs, decision logs, and versioned docs.",
    icon: FileText,
  },
];
