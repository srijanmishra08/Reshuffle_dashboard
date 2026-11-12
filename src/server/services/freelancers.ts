import { asc, eq } from "drizzle-orm";
import { newId } from "@/lib/ids";
import { getDb, schema, type Db } from "@/server/db/client";

const { legacyFreelancers } = schema;

export type FreelancerRow = {
  id: string;
  freelancer: string;
  skill: string;
  availability: string;
  project: string;
  utilization: string;
  payout: string;
  performance: string;
};

type CreateFreelancerInput = Omit<FreelancerRow, "id">;
type UpdateFreelancerInput = Partial<CreateFreelancerInput>;

const columns = {
  id: legacyFreelancers.id,
  freelancer: legacyFreelancers.freelancer,
  skill: legacyFreelancers.skill,
  availability: legacyFreelancers.availability,
  project: legacyFreelancers.project,
  utilization: legacyFreelancers.utilization,
  payout: legacyFreelancers.payout,
  performance: legacyFreelancers.performance,
};

type Selected = { [K in keyof typeof columns]: string | null };

function toRow(row: Selected): FreelancerRow | null {
  if (!row.id || !row.freelancer) {
    return null;
  }

  return {
    id: row.id,
    freelancer: row.freelancer,
    skill: row.skill ?? "",
    availability: row.availability ?? "",
    project: row.project ?? "",
    utilization: row.utilization ?? "",
    payout: row.payout ?? "",
    performance: row.performance ?? "",
  };
}

/** No demo rows are inserted any more; an empty table lists as empty. */
export async function listFreelancers(db: Db = getDb()) {
  const rows = await db.select(columns).from(legacyFreelancers).orderBy(asc(legacyFreelancers.createdAt));
  return rows.map(toRow).filter((row): row is FreelancerRow => row !== null);
}

export async function createFreelancer(input: CreateFreelancerInput, db: Db = getDb()) {
  const next: FreelancerRow = { id: `fr-${newId()}`, ...input };
  const now = new Date().toISOString();

  await db.insert(legacyFreelancers).values({ ...next, createdAt: now, updatedAt: now });
  return next;
}

export async function updateFreelancer(id: string, input: UpdateFreelancerInput, db: Db = getDb()) {
  const rows = await db.select(columns).from(legacyFreelancers).where(eq(legacyFreelancers.id, id)).limit(1);
  const existing = rows[0] ? toRow(rows[0]) : null;

  if (!existing) {
    return null;
  }

  const next: FreelancerRow = {
    id,
    freelancer: input.freelancer ?? existing.freelancer,
    skill: input.skill ?? existing.skill,
    availability: input.availability ?? existing.availability,
    project: input.project ?? existing.project,
    utilization: input.utilization ?? existing.utilization,
    payout: input.payout ?? existing.payout,
    performance: input.performance ?? existing.performance,
  };

  await db
    .update(legacyFreelancers)
    .set({ ...next, updatedAt: new Date().toISOString() })
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
