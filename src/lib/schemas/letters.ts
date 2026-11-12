import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const letterInputSchema = z.object({
  companyId: optionalText(100),
  recipientName: z.string().trim().min(1, "Recipient is required").max(200),
  recipientAddress: optionalText(1000),
  subject: z.string().trim().min(1, "Subject is required").max(300),
  body: z.string().trim().min(1, "Write the letter").max(20000),
  issueDate: dateOnly.optional(),
});
export type LetterInput = z.infer<typeof letterInputSchema>;

export const letterPatchSchema = letterInputSchema.partial();

export const letterListQuerySchema = z.object({
  status: z.enum(["DRAFT", "ISSUED"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const issueLetterSchema = z.object({
  idempotencyKey: z.string().trim().min(8, "Idempotency key required").max(100),
  issueDate: dateOnly.optional(),
});
