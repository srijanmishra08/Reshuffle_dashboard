import { z } from "zod";
import { ledgerKindValues } from "@/server/db/schema/finance";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const categoryInputSchema = z.object({ name: z.string().trim().min(1).max(80) });

export const ledgerEntryInputSchema = z.object({
  kind: z.enum(ledgerKindValues),
  entryDate: dateOnly,
  amountPaise: z.number().int().positive().max(1_000_000_000_000), // 10,000 crore ceiling guards typos
  categoryId: z.string().nullable().optional(),
  description: z.string().trim().max(300).default(""),
  companyId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
});

export const ledgerQuerySchema = z.object({
  kind: z.enum(ledgerKindValues).optional(),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM").optional(),
});

/** Financial year start year, e.g. 2026 means April 2026 to March 2027. */
export const monthlyQuerySchema = z.object({ fy: z.coerce.number().int().min(2000).max(2100) });

export const agingQuerySchema = z.object({
  asOf: dateOnly.optional(),
});

/** Financial year start year, optionally narrowed to one month (YYYY-MM) inside it. */
export const gstQuerySchema = z.object({
  fy: z.coerce.number().int().min(2000).max(2100),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM").optional(),
});
