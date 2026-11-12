import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/server/db/client";

export const orgSettingsInputSchema = z.object({
  legalName: z.string().trim().max(200),
  address: z.string().trim().max(500),
  stateCode: z.string().trim().max(4),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^$|^[0-9A-Z]{15}$/, "GSTIN must be 15 characters"),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^$|^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN looks invalid"),
  bankDetails: z.object({
    accountName: z.string().trim().max(200).default(""),
    accountNumber: z.string().trim().max(40).default(""),
    ifsc: z.string().trim().max(20).default(""),
    bankName: z.string().trim().max(200).default(""),
  }),
  defaultTerms: z.string().max(5000),
  signatoryName: z.string().trim().max(200),
  signatoryTitle: z.string().trim().max(200),
  fyStartMonth: z.number().int().min(1).max(12),
});

export type OrgSettingsInput = z.infer<typeof orgSettingsInputSchema>;

export type OrgSettings = OrgSettingsInput & { orgId: string; updatedAt: string };

const emptyBank = { accountName: "", accountNumber: "", ifsc: "", bankName: "" };

function parseBank(value: Record<string, string> | null | undefined) {
  return { ...emptyBank, ...(value ?? {}) };
}

export async function getOrgSettings(orgId = "default"): Promise<OrgSettings> {
  const rows = await getDb()
    .select()
    .from(schema.orgSettings)
    .where(eq(schema.orgSettings.orgId, orgId))
    .limit(1);
  const row = rows[0];

  return {
    orgId,
    legalName: row?.legalName ?? "",
    address: row?.address ?? "",
    stateCode: row?.stateCode ?? "",
    gstin: row?.gstin ?? "",
    pan: row?.pan ?? "",
    bankDetails: parseBank(row?.bankDetails),
    defaultTerms: row?.defaultTerms ?? "",
    signatoryName: row?.signatoryName ?? "",
    signatoryTitle: row?.signatoryTitle ?? "",
    fyStartMonth: row?.fyStartMonth ?? 4,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : "",
  };
}

export async function saveOrgSettings(input: OrgSettingsInput, orgId = "default") {
  const values = {
    legalName: input.legalName,
    address: input.address,
    stateCode: input.stateCode,
    gstin: input.gstin,
    pan: input.pan,
    bankDetails: input.bankDetails,
    defaultTerms: input.defaultTerms,
    signatoryName: input.signatoryName,
    signatoryTitle: input.signatoryTitle,
    fyStartMonth: input.fyStartMonth,
    updatedAt: new Date(),
  };

  await getDb()
    .insert(schema.orgSettings)
    .values({ orgId, ...values })
    .onConflictDoUpdate({ target: schema.orgSettings.orgId, set: values });

  return getOrgSettings(orgId);
}
