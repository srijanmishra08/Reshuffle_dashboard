import { z } from "zod";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const platformSchema = z.enum(["INSTAGRAM", "LINKEDIN", "YOUTUBE", "X", "WHATSAPP", "OTHER"]);
export const contentStatusSchema = z.enum(["IDEA", "DRAFT", "SCHEDULED", "PUBLISHED"]);

export const accountInputSchema = z.object({
  platform: platformSchema,
  handle: z.string().trim().min(1, "Handle is required").max(100),
  url: optionalText(500),
  verticalId: z.string().min(1).nullable().optional(),
  notes: optionalText(1000),
});
export const accountPatchSchema = z.object({
  platform: platformSchema.optional(),
  handle: z.string().trim().min(1).max(100).optional(),
  url: optionalText(500),
  verticalId: z.string().min(1).nullable().optional(),
  notes: optionalText(1000),
  archived: z.boolean().optional(),
});

export const contentInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  platform: platformSchema,
  accountId: z.string().min(1).nullable().optional(),
  status: contentStatusSchema.default("IDEA"),
  publishDate: dateOnly.nullable().optional(),
  caption: optionalText(4000),
});
export const contentPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  platform: platformSchema.optional(),
  accountId: z.string().min(1).nullable().optional(),
  status: contentStatusSchema.optional(),
  publishDate: dateOnly.nullable().optional(),
  caption: optionalText(4000),
});
export const contentListQuerySchema = z.object({
  month: month.optional(),
  status: contentStatusSchema.optional(),
  accountId: z.string().min(1).optional(),
});
