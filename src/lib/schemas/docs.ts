import { z } from "zod";

export const docTypeSchema = z.enum(["SOP", "PLAYBOOK", "DECISION", "NOTE", "RESOURCE"]);

export const docInputSchema = z.object({
  type: docTypeSchema.default("NOTE"),
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string().max(100000).default(""),
});
export type DocInput = z.infer<typeof docInputSchema>;

export const docPatchSchema = z.object({
  type: docTypeSchema.optional(),
  title: z.string().trim().min(1, "Title is required").max(200).optional(),
  body: z.string().max(100000).optional(),
});

export const docListQuerySchema = z.object({
  type: docTypeSchema.optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
