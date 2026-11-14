import { asc, eq } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { getDb, schema, type Db } from "@/server/db/client";

const { legacyFreelancers } = schema;

/** Every editable text field. "project" is the current engagement; "company" is where the freelancer works. */
export const freelancerFields = [
  "freelancer",
  "skill",
  "category",
  "company",
  "email",
  "phone",
  "whatsapp",
  "instagram",
  "linkedin",
  "xHandle",
  "website",
  "availability",
  "project",
  "utilization",
  "payout",
  "performance",
] as const;

export type FreelancerField = (typeof freelancerFields)[number];
export type FreelancerRow = { id: string } & Record<FreelancerField, string>;

type CreateFreelancerInput = Pick<FreelancerRow, "freelancer"> & Partial<Record<FreelancerField, string>>;
type UpdateFreelancerInput = Partial<Record<FreelancerField, string>>;

const columns = {
  id: legacyFreelancers.id,
  ...Object.fromEntries(freelancerFields.map((f) => [f, legacyFreelancers[f]])),
} as { id: typeof legacyFreelancers.id } & { [K in FreelancerField]: (typeof legacyFreelancers)[K] };

type Selected = { id: string | null } & { [K in FreelancerField]: string | null };

function toRow(row: Selected): FreelancerRow | null {
  if (!row.id || !row.freelancer) {
    return null;
  }

  const out = { id: row.id } as FreelancerRow;
  for (const f of freelancerFields) {
    out[f] = row[f] ?? "";
  }
  return out;
}

/** No demo rows are inserted any more; an empty table lists as empty. */
export async function listFreelancers(db: Db = getDb()) {
  const rows = await db.select(columns).from(legacyFreelancers).orderBy(asc(legacyFreelancers.createdAt));
  return rows.map((r) => toRow(r as Selected)).filter((row): row is FreelancerRow => row !== null);
}

export async function createFreelancer(input: CreateFreelancerInput, db: Db = getDb()) {
  const next = { id: `fr-${newId()}` } as FreelancerRow;
  for (const f of freelancerFields) {
    next[f] = input[f] ?? "";
  }
  const now = new Date();

  await db.insert(legacyFreelancers).values({ ...next, createdAt: now, updatedAt: now });
  return next;
}

export async function updateFreelancer(id: string, input: UpdateFreelancerInput, db: Db = getDb()) {
  const rows = await db.select(columns).from(legacyFreelancers).where(eq(legacyFreelancers.id, id)).limit(1);
  const existing = rows[0] ? toRow(rows[0] as Selected) : null;

  if (!existing) {
    return null;
  }

  const next = { id } as FreelancerRow;
  for (const f of freelancerFields) {
    next[f] = input[f] ?? existing[f];
  }

  await db
    .update(legacyFreelancers)
    .set({ ...next, updatedAt: new Date() })
    .where(eq(legacyFreelancers.id, id));

  return next;
}

export async function deleteFreelancer(id: string, db: Db = getDb()) {
  const deleted = await db
    .delete(legacyFreelancers)
    .where(eq(legacyFreelancers.id, id))
    .returning({ id: legacyFreelancers.id });

  return deleted.length > 0;
}
