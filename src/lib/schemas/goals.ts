import { z } from "zod";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const goalStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE", "DROPPED"]);
export const goalPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const goalInputSchema = z
  .object({
    month,
    title: z.string().trim().min(1, "Title is required").max(200),
    team: optionalText(100),
    priority: goalPrioritySchema.default("MEDIUM"),
    status: goalStatusSchema.default("TODO"),
    startDate: dateOnly.nullable().optional(),
    dueDate: dateOnly.nullable().optional(),
    notes: optionalText(2000),
  })
  .refine((v) => !v.startDate || !v.dueDate || v.startDate <= v.dueDate, {
    message: "Due date must not be before the start date",
    path: ["dueDate"],
  });

export const goalPatchSchema = z.object({
  month: month.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  team: optionalText(100),
  priority: goalPrioritySchema.optional(),
  status: goalStatusSchema.optional(),
  startDate: dateOnly.nullable().optional(),
  dueDate: dateOnly.nullable().optional(),
  notes: optionalText(2000),
});

export const goalListQuerySchema = z.object({
  month: month.optional(),
  team: z.string().trim().max(100).optional(),
  status: goalStatusSchema.optional(),
});
