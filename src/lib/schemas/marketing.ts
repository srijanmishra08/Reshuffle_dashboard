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

export const platformSchema = z.enum(["Instagram", "LinkedIn", "YouTube", "X", "Facebook", "Other"]);
export const contentStatusSchema = z.enum(["IDEA", "DRAFT", "SCHEDULED", "POSTED"]);

export const accountInputSchema = z.object({
  platform: platformSchema,
  handle: z.string().trim().min(1, "Handle is required").max(100),
  url: optionalText(500),
  vertical: optionalText(100),
  notes: optionalText(2000),
  active: z.boolean().default(true),
});
export const accountPatchSchema = z.object({
  platform: platformSchema.optional(),
  handle: z.string().trim().min(1).max(100).optional(),
  url: optionalText(500),
  vertical: optionalText(100),
  notes: optionalText(2000),
  active: z.boolean().optional(),
});

export const contentInputSchema = z.object({
  accountId: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1, "Title is required").max(200),
  platform: platformSchema.default("Instagram"),
  status: contentStatusSchema.default("IDEA"),
  scheduledDate: dateOnly.nullable().optional(),
  caption: optionalText(5000),
  link: optionalText(500),
});
export const contentPatchSchema = z.object({
  accountId: z.string().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  platform: platformSchema.optional(),
  status: contentStatusSchema.optional(),
  scheduledDate: dateOnly.nullable().optional(),
  caption: optionalText(5000),
  link: optionalText(500),
});
export const contentListQuerySchema = z.object({
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  status: contentStatusSchema.optional(),
  platform: platformSchema.optional(),
});
