import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const optionalDate = dateOnly.nullable().optional();

export const assignmentInputSchema = z
  .object({
    projectId: z.string().trim().min(1, "Project is required").max(100),
    role: z.string().trim().max(200).default(""),
    allocationPct: z.number().int().min(1).max(100).default(100),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .refine((v) => !v.startDate || !v.endDate || v.startDate <= v.endDate, { message: "End date is before start date" });

export const assignmentPatchSchema = z.object({
  role: z.string().trim().max(200).optional(),
  allocationPct: z.number().int().min(1).max(100).optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  status: z.enum(["ACTIVE", "ENDED"]).optional(),
});

export const payoutInputSchema = z.object({
  projectId: z.string().trim().min(1).max(100).nullable().optional(),
  description: z.string().trim().max(300).default(""),
  // int4 column: one payout tops out near Rs 2.14 crore.
  amountPaise: z.number().int().positive().max(2_000_000_000),
  dueDate: optionalDate,
});

export const payoutPaySchema = z.object({ paidOn: dateOnly.optional() });

export const payoutListQuerySchema = z.object({
  status: z.enum(["PENDING", "PAID", "CANCELLED"]).optional(),
});

/** A plan is a small free-form sheet; cap its size so a paste cannot fill the row. */
export const financePlanSchema = z.object({
  data: z.record(z.string(), z.unknown()).refine((v) => JSON.stringify(v).length <= 200_000, { message: "Plan is too large" }),
});
export const planKeySchema = z.string().regex(/^[a-z0-9-]{1,60}$/, "Invalid plan key");
