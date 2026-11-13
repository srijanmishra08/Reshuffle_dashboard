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

export const platformSchema = z.enum(["INSTAGRAM", "LINKEDIN", "YOUTUBE", "FACEBOOK", "X", "WHATSAPP", "OTHER"]);
export const contentStatusSchema = z.enum(["IDEA", "DRAFT", "SCHEDULED", "PUBLISHED"]);

export const accountInputSchema = z.object({
  platform: platformSchema,
  handle: z.string().trim().min(1, "Handle is required").max(100),
  verticalId: z.string().min(1).nullable().optional(),
  plan: optionalText(2000),
  active: z.boolean().default(true),
});

export const accountPatchSchema = z.object({
  platform: platformSchema.optional(),
  handle: z.string().trim().min(1).max(100).optional(),
  verticalId: z.string().min(1).nullable().optional(),
  plan: optionalText(2000),
  active: z.boolean().optional(),
});

export const contentInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  caption: optionalText(5000),
  accountId: z.string().min(1).nullable().optional(),
  status: contentStatusSchema.default("IDEA"),
  scheduledDate: dateOnly.nullable().optional(),
  postUrl: optionalText(500),
});

export const contentPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  caption: optionalText(5000),
  accountId: z.string().min(1).nullable().optional(),
  status: contentStatusSchema.optional(),
  scheduledDate: dateOnly.nullable().optional(),
  postUrl: optionalText(500),
});

export const contentListQuerySchema = z.object({
  month: month.optional(),
  accountId: z.string().min(1).optional(),
  status: contentStatusSchema.optional(),
});
