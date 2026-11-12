import { z } from "zod";

export const companyLifecycleValues = ["PROSPECT", "ONBOARDING", "ACTIVE", "MAINTENANCE", "CLOSED"] as const;
export const interactionTypeValues = ["CALL", "MEETING", "WHATSAPP", "EMAIL", "NOTE", "SITE_VISIT"] as const;
export const whatsappRoleValues = ["CLIENT", "CLIENT_TEAM"] as const;

/** Empty strings from forms become null. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Must be a valid date");

const optionalDateTime = z
  .union([isoDateTime, z.literal("").transform(() => null), z.null()])
  .optional();

export const companyInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  legalName: text(200),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^$|^[0-9A-Z]{15}$/, "GSTIN must be 15 characters")
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
  stateCode: text(4),
  address: text(500),
  verticalId: text(100),
  website: text(300),
  lifecycle: z.enum(companyLifecycleValues).optional(),
  ownerId: text(100),
  source: text(200),
  referrer: text(200),
  notes: text(5000),
});
export type CompanyInput = z.infer<typeof companyInputSchema>;

export const companyPatchSchema = companyInputSchema.partial();
export type CompanyPatch = z.infer<typeof companyPatchSchema>;

export const contactInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  role: text(100),
  phone: text(30),
  email: z
    .string()
    .trim()
    .max(200)
    .refine((value) => value === "" || z.email().safeParse(value).success, "Invalid email")
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional(),
  whatsapp: text(30),
  whatsappRole: z.enum(whatsappRoleValues).nullable().optional(),
  onboarded: z.boolean().optional(),
  approved: z.boolean().optional(),
});
export type ContactInput = z.infer<typeof contactInputSchema>;

export const contactPatchSchema = contactInputSchema.partial();

export const interactionInputSchema = z.object({
  contactId: text(100),
  type: z.enum(interactionTypeValues),
  summary: z.string().trim().min(1, "Summary is required").max(5000),
  at: isoDateTime.optional(),
  nextAction: text(500),
  nextActionAt: optionalDateTime,
});
export type InteractionInput = z.infer<typeof interactionInputSchema>;

export const interactionPatchSchema = z.object({
  done: z.boolean(),
});

export const meetingInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  at: isoDateTime,
  location: text(300),
  attendees: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  notes: text(5000),
});
export type MeetingInput = z.infer<typeof meetingInputSchema>;

export const companyListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  lifecycle: z.enum(companyLifecycleValues).optional(),
  verticalId: z.string().trim().max(100).optional(),
  ownerId: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});
export type CompanyListQuery = z.infer<typeof companyListQuerySchema>;
