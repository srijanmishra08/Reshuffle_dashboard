import { z } from "zod";
import { invoiceItemInputSchema } from "./billing";

export const workOrderStatusValues = ["DRAFT", "ISSUED", "COMPLETED", "CANCELLED"] as const;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

/** Work order lines use the same shape as invoice lines (taxed or untaxed). */
export const workOrderInputSchema = z.object({
  companyId: z.string().min(1, "Company is required"),
  dealId: optionalText(100),
  projectId: optionalText(100),
  customerRef: optionalText(100),
  requestedBy: optionalText(200),
  department: optionalText(200),
  jobDetails: optionalText(5000),
  comments: optionalText(2000),
  placeOfSupply: z.string().trim().max(4).optional(),
  issueDate: dateOnly.optional(),
  items: z.array(invoiceItemInputSchema).min(1, "Add at least one line item").max(100),
});
export type WorkOrderInput = z.infer<typeof workOrderInputSchema>;

export const workOrderPatchSchema = workOrderInputSchema.partial();

export const workOrderListQuerySchema = z.object({
  status: z.enum(workOrderStatusValues).optional(),
  companyId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const issueWorkOrderSchema = z.object({
  idempotencyKey: z.string().trim().min(8, "Idempotency key required").max(100),
  issueDate: dateOnly.optional(),
});

export const completeWorkOrderSchema = z.object({
  completedDate: dateOnly.optional(),
  comments: optionalText(2000),
});

export const cancelWorkOrderSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason").max(500),
});
