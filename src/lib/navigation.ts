import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  Contact,
  Handshake,
  ClipboardList,
  Code2,
  FileText,
  Target,
  Mail,
  FileSpreadsheet,
  LayoutDashboard,
  Megaphone,
  Receipt,
  Settings,
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
    title: "Clients",
    href: "/crm",
    description: "Companies, contacts, timeline and follow-ups.",
    icon: Users,
  },
  {
    title: "Sales",
    href: "/sales",
    description: "Deals from lead to won.",
    icon: Handshake,
  },
  {
    title: "Invoices",
    href: "/invoices",
    description: "GST invoices, payments and receivables.",
    icon: FileSpreadsheet,
  },
  {
    title: "Work Orders",
    href: "/work-orders",
    description: "Issue and track customer work orders.",
    icon: ClipboardList,
  },
  {
    title: "Letters",
    href: "/letters",
    description: "Numbered letters on letterhead.",
    icon: Mail,
  },
  {
    title: "People",
    href: "/people",
    description: "Team records and salary slips (admin and manager).",
    icon: Contact,
  },
  {
    title: "Project Management",
    href: "/projects",
    description: "Kanban, milestones, and resource planning.",
    icon: Briefcase,
  },
  {
    title: "Marketing",
    href: "/marketing",
    description: "Content calendar, board and social accounts.",
    icon: Megaphone,
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
    title: "Goals",
    href: "/goals",
    description: "Monthly goals by team.",
    icon: Target,
  },
  {
    title: "Documentation",
    href: "/docs",
    description: "SOPs, decision logs, and versioned docs.",
    icon: FileText,
  },
  {
    title: "Settings",
    href: "/settings",
    description: "Organisation, tax and signatory details (admin).",
    icon: Settings,
  },
];
