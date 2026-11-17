import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  Code2,
  Contact,
  FileSpreadsheet,
  FileText,
  Handshake,
  LayoutDashboard,
  Mail,
  Megaphone,
  Receipt,
  Send,
  Settings,
  Target,
  UserSquare2,
  Users,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  description: string;
  icon: LucideIcon;
};

export type Department = {
  /** Used in the landing page address, `/d/<key>`. */
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  items: NavItem[];
};

export const overviewItem: NavItem = {
  title: "Overview",
  href: "/",
  description: "Executive command center and KPIs.",
  icon: LayoutDashboard,
};

/** Every page belongs to exactly one department. Adding a page means adding it here. */
export const departments: Department[] = [
  {
    key: "sales",
    title: "Sales",
    description: "Turn leads into signed work: pipeline, diagnosis, scopes and the module library.",
    icon: Handshake,
    items: [
      { title: "Sales board", href: "/sales", description: "Deals from lead to won, with diagnosis and scopes.", icon: Handshake },
      { title: "Outreach", href: "/outreach", description: "Outbound leads from first touch to closed (older board).", icon: Send },
      { title: "Module library", href: "/settings/modules", description: "Reusable modules and prices used to build scopes.", icon: Boxes },
    ],
  },
  {
    key: "crm",
    title: "CRM",
    description: "Everything about clients: companies, contacts, timeline, follow-ups and onboarding forms.",
    icon: Users,
    items: [
      { title: "Clients", href: "/crm", description: "Companies, contacts, timeline and follow-ups.", icon: Users },
      { title: "Questionnaires", href: "/questionnaires", description: "Client onboarding forms and answers.", icon: ClipboardList },
    ],
  },
  {
    key: "finance",
    title: "Finance",
    description: "Money in and out: invoices, work orders, receivables, ledger and the finance plan.",
    icon: Receipt,
    items: [
      { title: "Finance", href: "/finance", description: "Ledger, receivables, monthly view, GST and plan.", icon: Receipt },
      { title: "Invoices", href: "/invoices", description: "GST invoices, payments and receivables.", icon: FileSpreadsheet },
      { title: "Work orders", href: "/work-orders", description: "Issue and track customer work orders.", icon: ClipboardList },
    ],
  },
  {
    key: "marketing",
    title: "Marketing",
    description: "Content, social accounts and events that bring leads in.",
    icon: Megaphone,
    items: [
      { title: "Marketing", href: "/marketing", description: "Social accounts, content calendar and board.", icon: Megaphone },
      { title: "Social media", href: "/social", description: "Kanban-only workflow for social execution.", icon: Megaphone },
      { title: "Events", href: "/events", description: "Workshops, sprints and meetups with team and registrations.", icon: CalendarDays },
    ],
  },
  {
    key: "delivery",
    title: "Delivery",
    description: "Getting client work done: projects and their progress, app builds and the freelancers doing the work.",
    icon: Briefcase,
    items: [
      { title: "Projects", href: "/projects", description: "Progress of every project, task boards and milestones.", icon: Briefcase },
      { title: "App development", href: "/app-dev", description: "Sprints, bugs and deployment lifecycle.", icon: Code2 },
      { title: "Freelancers", href: "/freelancers", description: "Availability, assignments and payouts.", icon: UserSquare2 },
    ],
  },
  {
    key: "admin",
    title: "People & Admin",
    description: "The company itself: team records, letters, goals, documentation and settings.",
    icon: Building2,
    items: [
      { title: "People", href: "/people", description: "Team records and salary slips (admin and manager).", icon: Contact },
      { title: "Letters", href: "/letters", description: "Numbered letters, offer letters and service agreements.", icon: Mail },
      { title: "Goals", href: "/goals", description: "Monthly goals by team.", icon: Target },
      { title: "Documentation", href: "/docs", description: "SOPs, decision logs and versioned docs.", icon: FileText },
      { title: "Settings", href: "/settings", description: "Organisation, tax and signatory details (admin).", icon: Settings },
    ],
  },
];

export function findDepartment(key: string): Department | undefined {
  return departments.find((d) => d.key === key);
}

const isUnder = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

/**
 * Which department and page a path belongs to. The longest matching address wins, so
 * `/settings/modules` is the module library (Sales) and not Settings (People & Admin).
 * A department landing page (`/d/<key>`) matches the department but no page.
 */
export function locate(pathname: string): { department: Department | null; item: NavItem | null } {
  const landing = /^\/d\/([^/]+)/.exec(pathname);
  if (landing) return { department: findDepartment(landing[1]) ?? null, item: null };
  let best: { department: Department; item: NavItem } | null = null;
  for (const department of departments) {
    for (const item of department.items) {
      if (isUnder(pathname, item.href) && (!best || item.href.length > best.item.href.length)) best = { department, item };
    }
  }
  return best ?? { department: null, item: isUnder(pathname, "/") && pathname === "/" ? overviewItem : null };
}
