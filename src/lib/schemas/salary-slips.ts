import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const payLineSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(100),
  amountPaise: z.number().int().min(0).max(1_000_000_000),
});

export const salarySlipInputSchema = z
  .object({
    personId: z.string().trim().min(1),
    payPeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM"),
    payDate: dateOnly.optional(),
    earnings: z.array(payLineSchema).min(1, "Add at least one earning").max(20),
    deductions: z.array(payLineSchema).max(20).default([]),
  })
  .refine((v) => v.deductions.reduce((s, d) => s + d.amountPaise, 0) <= v.earnings.reduce((s, e) => s + e.amountPaise, 0), {
    message: "Deductions cannot exceed gross earnings",
    path: ["deductions"],
  });

export const salarySlipPatchSchema = z.object({
  payDate: dateOnly.nullable().optional(),
  earnings: z.array(payLineSchema).min(1).max(20).optional(),
  deductions: z.array(payLineSchema).max(20).optional(),
});

export const salarySlipListQuerySchema = z.object({
  personId: z.string().optional(),
  status: z.enum(["DRAFT", "ISSUED"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const issueSalarySlipSchema = z.object({
  idempotencyKey: z.string().trim().min(8, "Idempotency key required").max(100),
  payDate: dateOnly.optional(),
});
