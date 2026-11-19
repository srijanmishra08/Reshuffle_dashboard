import { z } from "zod";

export const docTypeSchema = z.enum(["SOP", "PLAYBOOK", "DECISION", "NOTE", "RESOURCE"]);

export const docStatusSchema = z.enum(["DRAFT", "IN_REVIEW", "PUBLISHED", "DEPRECATED"]);

export const docInputSchema = z.object({
  type: docTypeSchema.default("NOTE"),
  title: z.string().trim().min(1, "Title is required").max(200),
  status: docStatusSchema.default("DRAFT"),
  body: z.string().max(100000).default(""),
  companyId: z.string().min(1).nullish(),
  dealId: z.string().min(1).nullish(),
});
export type DocInput = z.infer<typeof docInputSchema>;

export const docPatchSchema = z.object({
  type: docTypeSchema.optional(),
  title: z.string().trim().min(1, "Title is required").max(200).optional(),
  status: docStatusSchema.optional(),
  body: z.string().max(100000).optional(),
  companyId: z.string().min(1).nullish(),
  dealId: z.string().min(1).nullish(),
});

export const docListQuerySchema = z.object({
  type: docTypeSchema.optional(),
  status: docStatusSchema.optional(),
  companyId: z.string().min(1).optional(),
  dealId: z.string().min(1).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
