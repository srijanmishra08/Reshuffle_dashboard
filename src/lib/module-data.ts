import type { DashboardKpi } from "@/lib/types";

export const overviewKpis: DashboardKpi[] = [
  { title: "Active Clients", value: "24", trend: "+4 this month", tone: "good" },
  { title: "Projects At Risk", value: "3", trend: "2 need owner action", tone: "warn" },
  { title: "Monthly Revenue", value: "Rs 11.8L", trend: "+18.2% MoM", tone: "good" },
  { title: "Freelancer Utilization", value: "82%", trend: "4 overloaded", tone: "warn" },
];

export const moduleHighlights: Record<string, string[]> = {
  crm: [
    "Pipeline: Lead -> Contacted -> Converted -> Retained",
    "Client timeline for calls, emails, and meetings",
    "Reminders and attached documents",
  ],
  projects: [
    "Kanban flow for delivery",
    "Timeline milestones and deadlines",
    "Freelancer capacity allocation",
  ],
  social: [
    "Monthly publishing calendar",
    "Platform tags for IG, LinkedIn, YouTube",
    "Draft -> Scheduled -> Posted status",
  ],
  outreach: [
    "Lead source attribution and scoring",
    "Cold, Warm, Hot classification",
    "Follow-up queue with automation hooks",
  ],
  "app-dev": [
    "Sprint board and issue tracker",
    "Release notes and deployment log",
    "Bug aging and closure trends",
  ],
  freelancers: [
    "Availability board and skill tags",
    "Current assignment map",
    "Performance and feedback score",
  ],
  finance: [
    "Revenue vs expense summary",
    "Client billing and outstanding",
    "Freelancer payouts and subscriptions",
  ],
  events: [
    "Event pipeline and execution status",
    "Attendee and RSVP snapshot",
    "Revenue and partner contributions",
  ],
  docs: [
    "Central SOP and playbook index",
    "Entity-linked documentation",
    "Versioned decision records",
  ],
};
