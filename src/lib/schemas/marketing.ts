import { z } from "zod";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^https?:\/\//i.test(v), "Must start with http:// or https://")
  .nullable()
  .optional();

export const contentStatusSchema = z.enum(["IDEA", "DRAFT", "SCHEDULED", "POSTED"]);
export const platformSchema = z.enum(["Instagram", "LinkedIn", "YouTube", "X", "Facebook", "WhatsApp", "Other"]);

export const accountInputSchema = z.object({
  verticalId: z.string().min(1).nullable().optional(),
  platform: platformSchema,
  handle: z.string().trim().min(1, "Handle is required").max(100),
  url: optionalUrl,
  notes: optionalText(1000),
});
export const accountPatchSchema = z.object({
  verticalId: z.string().min(1).nullable().optional(),
  platform: platformSchema.optional(),
  handle: z.string().trim().min(1).max(100).optional(),
  url: optionalUrl,
  notes: optionalText(1000),
});

export const contentInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  script: optionalText(5000),
  platform: platformSchema,
  status: contentStatusSchema.default("IDEA"),
  publishDate: dateOnly,
  accountId: z.string().min(1).nullable().optional(),
  postUrl: optionalUrl,
});
export const contentPatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  script: optionalText(5000),
  platform: platformSchema.optional(),
  status: contentStatusSchema.optional(),
  publishDate: dateOnly.optional(),
  accountId: z.string().min(1).nullable().optional(),
  postUrl: optionalUrl,
});
export const contentListQuerySchema = z.object({
  month: month.optional(),
  status: contentStatusSchema.optional(),
  platform: platformSchema.optional(),
});
