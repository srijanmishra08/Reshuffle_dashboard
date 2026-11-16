import { z } from "zod";

export const taskStatuses = ["BACKLOG", "TODO", "IN_PROGRESS", "CLIENT_REVIEW", "REVISION", "COMPLETED", "INVOICED"] as const;
export type TaskStatusName = (typeof taskStatuses)[number];
export const taskPriorities = ["NONE", "LOW", "MEDIUM", "HIGH"] as const;
export type TaskPriorityName = (typeof taskPriorities)[number];

export const taskStatusLabels: Record<TaskStatusName, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  IN_PROGRESS: "In progress",
  CLIENT_REVIEW: "Client review",
  REVISION: "Revision",
  COMPLETED: "Completed",
  INVOICED: "Invoiced",
};

/** A task counts as finished once the work is done, whether or not it is billed yet. */
export const doneStatuses: readonly TaskStatusName[] = ["COMPLETED", "INVOICED"];

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const nullableId = z
  .string()
  .trim()
  .max(100)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Task name is required").max(200),
  description: z.string().trim().max(4000).default(""),
  status: z.enum(taskStatuses).default("TODO"),
  priority: z.enum(taskPriorities).default("NONE"),
  dueDate: dateOnly.nullable().optional(),
  budgetPaise: z.number().int().min(0).max(2_000_000_000).default(0),
  assigneeId: nullableId,
});

export const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).optional(),
  status: z.enum(taskStatuses).optional(),
  priority: z.enum(taskPriorities).optional(),
  dueDate: dateOnly.nullable().optional(),
  budgetPaise: z.number().int().min(0).max(2_000_000_000).optional(),
  assigneeId: nullableId,
});

/** A project made directly for a client, without a deal. */
export const projectCreateSchema = z.object({
  companyId: z.string().trim().min(1, "Choose a client").max(100),
  name: z.string().trim().min(1, "Project name is required").max(200),
  budgetPaise: z.number().int().min(0).max(2_000_000_000).default(0),
  startDate: dateOnly.nullable().optional(),
  dueDate: dateOnly.nullable().optional(),
});
