import { z } from "zod";
import { salesNodeKindValues } from "@/server/models/deals";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const salesNodeInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  kind: z.enum(salesNodeKindValues).default("INDIVIDUAL"),
  phone: optionalText(40),
  email: optionalText(200),
  /** Percent of the accepted deal value, 0 to 100, up to two decimals. Only admins and managers may set it. */
  commissionPercent: z.number().min(0).max(100).optional(),
  notes: optionalText(2000),
  userId: optionalText(100),
  freelancerId: optionalText(100),
  agencyId: optionalText(100),
  active: z.boolean().optional(),
});

export const salesNodePatchSchema = salesNodeInputSchema.partial();

/** Recording a referral commission paid to a sales node for one of its accepted deals. */
export const commissionPaymentInputSchema = z.object({
  dealId: z.string().trim().min(1, "Pick the accepted deal").max(100),
  // int4 column: one payment tops out near Rs 2.14 crore.
  amountPaise: z.number().int().positive("Amount must be more than zero").max(2_000_000_000),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").optional(),
  note: optionalText(500),
});
