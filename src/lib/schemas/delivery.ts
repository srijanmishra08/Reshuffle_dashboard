import { z } from "zod";
import { deliveryStatusValues, milestoneStatusValues } from "@/server/db/schema/delivery";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const projectPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  status: z.enum(deliveryStatusValues).optional(),
  startDate: dateOnly.nullable().optional(),
  dueDate: dateOnly.nullable().optional(),
});

/** DONE and PENDING only. INVOICED is set by drafting the milestone invoice. */
export const milestonePatchSchema = z.object({
  status: z.enum(milestoneStatusValues).refine((s) => s !== "INVOICED", "Use the invoice action instead").optional(),
  dueDate: dateOnly.nullable().optional(),
});

export const projectListQuerySchema = z.object({
  status: z.enum(deliveryStatusValues).optional(),
  companyId: z.string().optional(),
});
