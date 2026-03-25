export type PipelineModule =
  | "crm"
  | "projects"
  | "social"
  | "outreach"
  | "app-dev"
  | "freelancers"
  | "finance"
  | "events"
  | "docs";

export type PipelineSeedItem = {
  id: string;
  title: string;
  stage: string;
  subtitle?: string;
  assignee?: string;
};

export const pipelineSeedItems: Record<PipelineModule, PipelineSeedItem[]> = {
  crm: [
    { id: "cl-1", title: "Acme Foods", subtitle: "Inbound from website", stage: "LEAD" },
    { id: "cl-2", title: "Nova Beauty", subtitle: "Follow-up in progress", stage: "CONTACTED" },
    { id: "cl-3", title: "Kite Labs", subtitle: "Contract signed", stage: "FINALISED" },
    { id: "cl-4", title: "Orbit Events", subtitle: "Delivery sprint active", stage: "PROJECT_ONGOING" },
  ],
  projects: [
    { id: "pr-1", title: "Website Revamp", subtitle: "Q2 delivery", stage: "BACKLOG" },
    { id: "pr-2", title: "Campaign Landing", subtitle: "Needs design review", stage: "IN_PROGRESS" },
    { id: "pr-3", title: "Analytics Cleanup", subtitle: "Waiting on API key", stage: "BLOCKED" },
  ],
  social: [
    { id: "ct-1", title: "Founder Story Reel", subtitle: "Instagram", stage: "IDEA" },
    { id: "ct-2", title: "Case Study Carousel", subtitle: "LinkedIn", stage: "DRAFT" },
    { id: "ct-3", title: "Product Teaser", subtitle: "YouTube Shorts", stage: "SCHEDULED" },
  ],
  outreach: [
    { id: "dl-1", title: "Peak Wellness", subtitle: "Referral network", stage: "NEW" },
    { id: "dl-2", title: "Orbit Events", subtitle: "Qualified on call", stage: "QUALIFIED" },
    { id: "dl-3", title: "Nexa Interiors", subtitle: "Proposal sent", stage: "FOLLOW_UP" },
  ],
  "app-dev": [
    { id: "tk-1", title: "Pipeline API hardening", subtitle: "Sprint 9", stage: "BACKLOG" },
    { id: "tk-2", title: "Role guard middleware", subtitle: "In active sprint", stage: "IN_SPRINT" },
    { id: "tk-3", title: "Event reporting widget", subtitle: "Pending QA", stage: "IN_REVIEW" },
  ],
  freelancers: [
    { id: "fr-1", title: "Priya R", subtitle: "Video editor", stage: "AVAILABLE" },
    { id: "fr-2", title: "Aman S", subtitle: "Performance marketer", stage: "ASSIGNED" },
    { id: "fr-3", title: "Disha T", subtitle: "Designer, overloaded", stage: "AT_RISK" },
  ],
  finance: [
    { id: "fn-1", title: "INV-310", subtitle: "Acme Foods", stage: "RECORDED" },
    { id: "fn-2", title: "INV-311", subtitle: "Nova Beauty", stage: "INVOICED" },
    { id: "fn-3", title: "PAYOUT-77", subtitle: "Freelancer batch", stage: "PAID" },
  ],
  events: [
    { id: "ev-1", title: "Creator Meetup", subtitle: "Delhi", stage: "PLANNED" },
    { id: "ev-2", title: "Client Summit", subtitle: "Mumbai", stage: "CONFIRMED" },
    { id: "ev-3", title: "Launch Day", subtitle: "Bengaluru", stage: "EXECUTED" },
  ],
  docs: [
    { id: "dc-1", title: "Client Onboarding SOP", subtitle: "v0.3", stage: "DRAFT" },
    { id: "dc-2", title: "Outreach Playbook", subtitle: "Review by manager", stage: "IN_REVIEW" },
    { id: "dc-3", title: "Release Checklist", subtitle: "Published internally", stage: "PUBLISHED" },
  ],
};
