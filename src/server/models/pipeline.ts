import { z } from "zod";

export const pipelineModuleValues = [
  "crm",
  "projects",
  "social",
  "outreach",
  "app-dev",
  "freelancers",
  "finance",
  "events",
  "docs",
] as const;

export type PipelineModule = (typeof pipelineModuleValues)[number];

export type PipelineDefinition = {
  module: PipelineModule;
  title: string;
  description: string;
  entityType: string;
  stages: readonly string[];
  defaultStage: string;
  terminalStages: readonly string[];
  allowedTransitions: Record<string, readonly string[]>;
};

const crmStages = ["LEAD", "CONTACTED", "FINALISED", "PROJECT_ONGOING", "RETAINED", "LOST"] as const;
const projectStages = ["BACKLOG", "IN_PROGRESS", "BLOCKED", "DONE"] as const;
const socialStages = ["IDEA", "DRAFT", "SCHEDULED", "POSTED"] as const;
const outreachStages = ["NEW", "QUALIFIED", "FOLLOW_UP", "WON", "LOST"] as const;
const appDevStages = ["BACKLOG", "IN_SPRINT", "IN_REVIEW", "RELEASED"] as const;
const freelancerStages = ["AVAILABLE", "ASSIGNED", "AT_RISK", "OFFBOARDED"] as const;
const financeStages = ["RECORDED", "INVOICED", "PAID", "SETTLED"] as const;
const eventStages = ["PLANNED", "CONFIRMED", "EXECUTED", "ARCHIVED"] as const;
const docsStages = ["DRAFT", "IN_REVIEW", "PUBLISHED", "DEPRECATED"] as const;

export const pipelineModels: Record<PipelineModule, PipelineDefinition> = {
  crm: {
    module: "crm",
    title: "Client CRM and Outreach Pipeline",
    description: "Unified movement from lead capture to finalized and ongoing projects.",
    entityType: "client",
    stages: crmStages,
    defaultStage: "LEAD",
    terminalStages: ["RETAINED", "LOST"],
    allowedTransitions: {
      LEAD: ["CONTACTED", "FINALISED", "LOST"],
      CONTACTED: ["LEAD", "FINALISED", "LOST"],
      FINALISED: ["PROJECT_ONGOING", "CONTACTED", "LOST"],
      PROJECT_ONGOING: ["RETAINED", "FINALISED", "LOST"],
      RETAINED: ["PROJECT_ONGOING"],
      LOST: ["LEAD", "CONTACTED"],
    },
  },
  projects: {
    module: "projects",
    title: "Project Delivery Pipeline",
    description: "Execution progression from backlog to completion.",
    entityType: "project",
    stages: projectStages,
    defaultStage: "BACKLOG",
    terminalStages: ["DONE"],
    allowedTransitions: {
      BACKLOG: ["IN_PROGRESS"],
      IN_PROGRESS: ["BLOCKED", "DONE", "BACKLOG"],
      BLOCKED: ["IN_PROGRESS"],
      DONE: ["IN_PROGRESS"],
    },
  },
  social: {
    module: "social",
    title: "Social Content Pipeline",
    description: "Content movement from concept to publish.",
    entityType: "content",
    stages: socialStages,
    defaultStage: "IDEA",
    terminalStages: ["POSTED"],
    allowedTransitions: {
      IDEA: ["DRAFT"],
      DRAFT: ["SCHEDULED", "IDEA"],
      SCHEDULED: ["POSTED", "DRAFT"],
      POSTED: ["DRAFT"],
    },
  },
  outreach: {
    module: "outreach",
    title: "Outreach Deal Pipeline",
    description: "Lead qualification and closure pipeline.",
    entityType: "deal",
    stages: outreachStages,
    defaultStage: "NEW",
    terminalStages: ["WON", "LOST"],
    allowedTransitions: {
      NEW: ["QUALIFIED", "LOST"],
      QUALIFIED: ["FOLLOW_UP", "LOST"],
      FOLLOW_UP: ["WON", "LOST", "QUALIFIED"],
      WON: ["FOLLOW_UP"],
      LOST: ["FOLLOW_UP"],
    },
  },
  "app-dev": {
    module: "app-dev",
    title: "App Development Pipeline",
    description: "Product delivery pipeline from backlog to release.",
    entityType: "task",
    stages: appDevStages,
    defaultStage: "BACKLOG",
    terminalStages: ["RELEASED"],
    allowedTransitions: {
      BACKLOG: ["IN_SPRINT"],
      IN_SPRINT: ["IN_REVIEW", "BACKLOG"],
      IN_REVIEW: ["RELEASED", "IN_SPRINT"],
      RELEASED: ["IN_SPRINT"],
    },
  },
  freelancers: {
    module: "freelancers",
    title: "Freelancer Allocation Pipeline",
    description: "Availability and assignment states for contractors.",
    entityType: "freelancer",
    stages: freelancerStages,
    defaultStage: "AVAILABLE",
    terminalStages: ["OFFBOARDED"],
    allowedTransitions: {
      AVAILABLE: ["ASSIGNED", "OFFBOARDED"],
      ASSIGNED: ["AVAILABLE", "AT_RISK"],
      AT_RISK: ["ASSIGNED", "AVAILABLE", "OFFBOARDED"],
      OFFBOARDED: ["AVAILABLE"],
    },
  },
  finance: {
    module: "finance",
    title: "Finance Lifecycle Pipeline",
    description: "Record flow from entry to final settlement.",
    entityType: "finance_record",
    stages: financeStages,
    defaultStage: "RECORDED",
    terminalStages: ["SETTLED"],
    allowedTransitions: {
      RECORDED: ["INVOICED", "SETTLED"],
      INVOICED: ["PAID", "RECORDED"],
      PAID: ["SETTLED", "INVOICED"],
      SETTLED: ["RECORDED"],
    },
  },
  events: {
    module: "events",
    title: "Event Lifecycle Pipeline",
    description: "Execution states for event operations.",
    entityType: "event",
    stages: eventStages,
    defaultStage: "PLANNED",
    terminalStages: ["ARCHIVED"],
    allowedTransitions: {
      PLANNED: ["CONFIRMED"],
      CONFIRMED: ["EXECUTED", "PLANNED"],
      EXECUTED: ["ARCHIVED", "CONFIRMED"],
      ARCHIVED: ["PLANNED"],
    },
  },
  docs: {
    module: "docs",
    title: "Documentation Pipeline",
    description: "Knowledge lifecycle from draft to deprecation.",
    entityType: "document",
    stages: docsStages,
    defaultStage: "DRAFT",
    terminalStages: ["DEPRECATED"],
    allowedTransitions: {
      DRAFT: ["IN_REVIEW"],
      IN_REVIEW: ["PUBLISHED", "DRAFT"],
      PUBLISHED: ["DEPRECATED", "IN_REVIEW"],
      DEPRECATED: ["DRAFT"],
    },
  },
};

export const pipelineModuleSchema = z.enum(pipelineModuleValues);

export const transitionInputSchema = z.object({
  module: pipelineModuleSchema,
  from: z.string().min(1),
  to: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().min(1),
  actorId: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const createPipelineItemSchema = z.object({
  entityId: z.string().min(1).optional(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  stage: z.string().min(1).optional(),
  assignee: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updatePipelineItemSchema = z.object({
  title: z.string().min(1).optional(),
  subtitle: z.string().optional(),
  stage: z.string().min(1).optional(),
  assignee: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export function hasStage(module: PipelineModule, stage: string): boolean {
  return pipelineModels[module].stages.includes(stage);
}

export function canTransition(module: PipelineModule, from: string, to: string): boolean {
  if (from === to) {
    return true;
  }

  return pipelineModels[module].allowedTransitions[from]?.includes(to) ?? false;
}
