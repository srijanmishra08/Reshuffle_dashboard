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
const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => (v === "" ? null : v))
  .refine((v) => v === null || /^https?:\/\//i.test(v), "Must start with http:// or https://")
  .nullable()
  .optional();

export const eventTypeSchema = z.enum(["SPRINT", "WORKSHOP", "IDEATHON", "BOOTCAMP", "MEETUP"]);
export const eventStatusSchema = z.enum(["PLANNED", "CONFIRMED", "EXECUTED", "ARCHIVED"]);

const fields = {
  name: z.string().trim().min(1, "Name is required").max(200),
  type: eventTypeSchema,
  status: eventStatusSchema,
  date: dateOnly.nullable().optional(),
  venue: optionalText(200),
  capacity: z.number().int().min(0).max(1_000_000).nullable().optional(),
  ticketPricePaise: z.number().int().min(0).max(100_000_000),
  partner: optionalText(200),
  sheetUrl: optionalUrl,
  docUrl: optionalUrl,
  notes: optionalText(2000),
};

export const eventInputSchema = z.object({
  ...fields,
  type: fields.type.default("WORKSHOP"),
  status: fields.status.default("PLANNED"),
  ticketPricePaise: fields.ticketPricePaise.default(0),
});
export const eventPatchSchema = z.object({
  name: fields.name.optional(),
  type: fields.type.optional(),
  status: fields.status.optional(),
  date: fields.date,
  venue: fields.venue,
  capacity: fields.capacity,
  ticketPricePaise: fields.ticketPricePaise.optional(),
  partner: fields.partner,
  sheetUrl: fields.sheetUrl,
  docUrl: fields.docUrl,
  notes: fields.notes,
});
export const eventListQuerySchema = z.object({ status: eventStatusSchema.optional() });

export const teamMemberInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  role: optionalText(100),
});

export const registrationInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  contact: optionalText(200),
  paid: z.boolean().default(false),
  attended: z.boolean().default(false),
});
export const registrationPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  contact: optionalText(200),
  paid: z.boolean().optional(),
  attended: z.boolean().optional(),
});
export const registrationBulkSchema = z.object({
  rows: z.array(registrationInputSchema).min(1).max(500),
});
