import { z } from "zod";
import {
  bucketValues,
  dealStageValues,
  quotationStatusValues,
  temperatureValues,
} from "@/server/models/deals";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

const dealFields = z.object({
  /** An existing company. Omit it and send `companyName` to add a brand-new lead. */
  companyId: z.string().trim().min(1).max(100).optional(),
  /** A new lead's name; reuses the company when one with this name already exists. */
  companyName: z.string().trim().min(1, "Lead name is required").max(200).optional(),
  title: z.string().trim().min(1, "Title is required").max(200),
  valuePaise: z.number().int().min(0).max(100_000_000_000_00).default(0),
  engagementModel: optionalText(100),
  source: optionalText(100),
  referrer: optionalText(200),
  quotationStatus: z.enum(quotationStatusValues).default("NONE"),
  currentBlock: optionalText(300),
  temperature: z.enum(temperatureValues).nullable().optional(),
  expectedClose: dateOnly.nullable().optional(),
  nextFollowUp: dateOnly.nullable().optional(),
  ownerId: optionalText(100),
  /** Library modules this lead is interested in. On update the list replaces the old one. */
  moduleIds: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
});

export const dealInputSchema = dealFields.refine((v) => Boolean(v.companyId || v.companyName), {
  message: "Enter the lead's name or pick an existing company",
  path: ["companyName"],
});
export type DealInput = z.infer<typeof dealInputSchema>;

export const dealPatchSchema = dealFields.omit({ companyId: true, companyName: true }).partial();

export const dealListQuerySchema = z.object({
  stage: z.enum(dealStageValues).optional(),
  source: z.string().optional(),
  ownerId: z.string().optional(),
  temperature: z.enum(temperatureValues).optional(),
  companyId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export const dealTransitionSchema = z.object({
  to: z.enum(dealStageValues),
  lostReason: z.string().trim().max(500).optional(),
  note: z.string().trim().max(500).optional(),
});

export const diagnosisEntrySchema = z.object({
  level: z.number().int().min(1).max(8),
  bucket: z.enum(bucketValues),
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().max(5000).default(""),
  painScore: z.number().int().min(0).max(5).default(0),
});

export const diagnosisSaveSchema = z.object({
  entries: z.array(diagnosisEntrySchema).max(200),
});
