import { z } from "zod";

export const invoiceStatusValues = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "CANCELLED"] as const;
export const paymentMethodValues = ["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "CARD", "OTHER"] as const;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

/** Amounts arrive as integer paise, never floats. */
const paiseInt = z.number().int().min(0).max(100_000_000_000);

export const invoiceItemInputSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(500),
  sacCode: optionalText(20),
  quantity: z.number().int().min(1).max(100000).default(1),
  ratePaise: paiseInt,
  taxable: z.boolean().default(true),
});
export type InvoiceItemInput = z.infer<typeof invoiceItemInputSchema>;

export const invoiceInputSchema = z.object({
  companyId: z.string().min(1, "Company is required"),
  dealId: optionalText(100),
  projectId: optionalText(100),
  /** State code of the place of supply. Empty falls back to the company state. */
  placeOfSupply: z.string().trim().max(4).optional(),
  issueDate: dateOnly.optional(),
  dueDate: dateOnly.nullable().optional(),
  notes: optionalText(2000),
  terms: optionalText(4000),
  items: z.array(invoiceItemInputSchema).min(1, "Add at least one line item").max(100),
});
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

export const invoicePatchSchema = invoiceInputSchema.partial();
export type InvoicePatch = z.infer<typeof invoicePatchSchema>;

export const invoiceListQuerySchema = z.object({
  status: z.enum(invoiceStatusValues).optional(),
  companyId: z.string().optional(),
  overdue: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const issueInvoiceSchema = z.object({
  idempotencyKey: z.string().trim().min(8, "Idempotency key required").max(100),
  issueDate: dateOnly.optional(),
});

export const paymentInputSchema = z.object({
  amountPaise: z.number().int().min(1, "Amount must be positive").max(100_000_000_000),
  paidAt: dateOnly,
  method: z.enum(paymentMethodValues).default("BANK_TRANSFER"),
  reference: optionalText(200),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const cancelInvoiceSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason").max(500),
});
