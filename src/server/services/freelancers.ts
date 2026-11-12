import { getTursoClient } from "@/lib/turso";

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

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toFreelancerRow(row: Record<string, unknown>): FreelancerRow | null {
  const id = readString(row.id);
  const freelancer = readString(row.freelancer);

  if (!id || !freelancer) {
    return null;
  }

  return {
    id,
    freelancer,
    skill: readString(row.skill),
    availability: readString(row.availability),
    project: readString(row.project),
    utilization: readString(row.utilization),
    payout: readString(row.payout),
    performance: readString(row.performance),
  };
}

export async function listFreelancers() {
  const client = getTursoClient();

  const result = await client.execute({
    sql: `
      SELECT id, freelancer, skill, availability, project, utilization, payout, performance
      FROM freelancers
      ORDER BY created_at ASC
    `,
  });

  return result.rows
    .map((row) => toFreelancerRow(row as Record<string, unknown>))
    .filter((row): row is FreelancerRow => row !== null);
}

export async function createFreelancer(input: CreateFreelancerInput) {
  const client = getTursoClient();

  const next: FreelancerRow = {
    id: `fr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    freelancer: input.freelancer,
    skill: input.skill,
    availability: input.availability,
    project: input.project,
    utilization: input.utilization,
    payout: input.payout,
    performance: input.performance,
  };

  await client.execute({
    sql: `
      INSERT INTO freelancers (id, freelancer, skill, availability, project, utilization, payout, performance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      next.id,
      next.freelancer,
      next.skill,
      next.availability,
      next.project,
      next.utilization,
      next.payout,
      next.performance,
    ],
  });

  return next;
}

export async function updateFreelancer(id: string, input: UpdateFreelancerInput) {
  const client = getTursoClient();

  const currentResult = await client.execute({
    sql: `
      SELECT id, freelancer, skill, availability, project, utilization, payout, performance
      FROM freelancers
      WHERE id = ?
      LIMIT 1
    `,
    args: [id],
  });

  const existing = currentResult.rows[0] as Record<string, unknown> | undefined;

  if (!existing) {
    return null;
  }

  const next: FreelancerRow = {
    id,
    freelancer: input.freelancer ?? readString(existing.freelancer),
    skill: input.skill ?? readString(existing.skill),
    availability: input.availability ?? readString(existing.availability),
    project: input.project ?? readString(existing.project),
    utilization: input.utilization ?? readString(existing.utilization),
    payout: input.payout ?? readString(existing.payout),
    performance: input.performance ?? readString(existing.performance),
  };

  await client.execute({
    sql: `
      UPDATE freelancers
      SET freelancer = ?, skill = ?, availability = ?, project = ?, utilization = ?, payout = ?, performance = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    args: [
      next.freelancer,
      next.skill,
      next.availability,
      next.project,
      next.utilization,
      next.payout,
      next.performance,
      id,
    ],
  });

  return next;
}

export async function deleteFreelancer(id: string) {
  const client = getTursoClient();

  const result = await client.execute({
    sql: "DELETE FROM freelancers WHERE id = ?",
    args: [id],
  });

  return Number(result.rowsAffected ?? 0) > 0;
}
