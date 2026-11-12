import { z } from "zod";
import { peopleKindValues } from "@/server/db/schema/people";

const optionalText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable().optional();

export const personInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email().max(200).nullable().optional(),
  phone: optionalText(30),
  role: z.string().trim().max(200).default(""),
  kind: z.enum(peopleKindValues).default("EMPLOYEE"),
  joinedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN format is AAAAA9999A")
    .nullable()
    .optional(),
  bankAccount: z.string().trim().regex(/^\d{6,20}$/, "Digits only").nullable().optional(),
  bankIfsc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC format is AAAA0XXXXXX")
    .nullable()
    .optional(),
});
export const personPatchSchema = personInputSchema.partial();
