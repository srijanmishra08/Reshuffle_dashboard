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

export const platformSchema = z.enum(["Instagram", "LinkedIn", "YouTube", "X", "Facebook"]);
export const contentStatusSchema = z.enum(["IDEA", "DRAFT", "SCHEDULED", "POSTED"]);

export const accountInputSchema = z.object({
  platform: platformSchema,
  handle: z.string().trim().min(1, "Handle is required").max(100),
  verticalId: z.string().min(1).nullable().optional(),
  notes: optionalText(1000),
});
export const accountPatchSchema = z.object({
  platform: platformSchema.optional(),
  handle: z.string().trim().min(1).max(100).optional(),
  verticalId: z.string().min(1).nullable().optional(),
  notes: optionalText(1000),
});

export const contentInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  accountId: z.string().min(1).nullable().optional(),
  script: optionalText(10000),
  status: contentStatusSchema.default("IDEA"),
  publishDate: dateOnly.nullable().optional(),
});
export const contentPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  accountId: z.string().min(1).nullable().optional(),
  script: optionalText(10000),
  status: contentStatusSchema.optional(),
  publishDate: dateOnly.nullable().optional(),
});
export const contentListQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  status: contentStatusSchema.optional(),
  accountId: z.string().optional(),
});
