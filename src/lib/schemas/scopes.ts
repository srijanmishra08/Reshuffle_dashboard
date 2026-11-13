import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const paise = z.number().int().min(0).max(10_000_000_000);

export const moduleInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  category: z.string().trim().min(1).max(100).default("General"),
  description: optionalText(2000),
  defaultDeliverables: optionalText(4000),
  defaultDays: z.number().int().min(0).max(3650).default(0),
  defaultPricePaise: paise.default(0),
  active: z.boolean().default(true),
});
export const modulePatchSchema = moduleInputSchema.partial();

export const scopeItemSchema = z.object({
  phase: z.string().trim().min(1).max(100).default("Phase 1"),
  moduleId: z.string().trim().min(1).max(100).nullable().optional(),
  title: z.string().trim().min(1, "Item title is required").max(300),
  description: optionalText(4000),
  days: z.number().int().min(0).max(3650).default(0),
  pricePaise: paise.default(0),
});

export const paymentStepSchema = z.object({
  label: z.string().trim().min(1).max(100),
  percent: z.number().int().min(1).max(100),
});

const paymentSchedule = z
  .array(paymentStepSchema)
  .max(12)
  .refine((steps) => steps.length === 0 || steps.reduce((s, x) => s + x.percent, 0) === 100, {
    message: "Payment percentages must add up to 100",
  });

export const scopeInputSchema = z.object({
  dealId: z.string().trim().min(1),
  title: z.string().trim().min(1, "Title is required").max(300),
  problemStatement: z.string().trim().max(10000).default(""),
  engagementModel: optionalText(100),
  paymentSchedule: paymentSchedule.default([
    { label: "Advance", percent: 50 },
    { label: "Mid-project milestone", percent: 30 },
    { label: "On delivery", percent: 20 },
  ]),
  terms: z.string().trim().max(20000).default(""),
  items: z.array(scopeItemSchema).max(100).default([]),
});
export type ScopeInput = z.infer<typeof scopeInputSchema>;

export const scopePatchSchema = scopeInputSchema.omit({ dealId: true }).partial();

export const sendScopeSchema = z.object({
  idempotencyKey: z.string().trim().min(8, "Idempotency key required").max(100),
});
