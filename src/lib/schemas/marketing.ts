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
const optionalLink = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^https?:\/\//i.test(v), "Link must start with http:// or https://")
  .nullable()
  .optional();

export const platformSchema = z.enum(["INSTAGRAM", "LINKEDIN", "YOUTUBE", "X", "FACEBOOK", "OTHER"]);
export const contentStatusSchema = z.enum(["IDEA", "DRAFT", "SCHEDULED", "PUBLISHED"]);

export const accountInputSchema = z.object({
  verticalId: z.string().min(1).nullable().optional(),
  platform: platformSchema,
  handle: z.string().trim().min(1, "Handle is required").max(100),
  notes: optionalText(1000),
  active: z.boolean().default(true),
});

export const accountPatchSchema = z.object({
  verticalId: z.string().min(1).nullable().optional(),
  platform: platformSchema.optional(),
  handle: z.string().trim().min(1).max(100).optional(),
  notes: optionalText(1000),
  active: z.boolean().optional(),
});

export const contentInputSchema = z.object({
  accountId: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1, "Title is required").max(200),
  status: contentStatusSchema.default("IDEA"),
  scheduledDate: dateOnly.nullable().optional(),
  caption: optionalText(3000),
  link: optionalLink,
});

export const contentPatchSchema = z.object({
  accountId: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  status: contentStatusSchema.optional(),
  scheduledDate: dateOnly.nullable().optional(),
  caption: optionalText(3000),
  link: optionalLink,
});

export const contentListQuerySchema = z.object({
  month: month.optional(),
  status: contentStatusSchema.optional(),
  accountId: z.string().min(1).optional(),
});
