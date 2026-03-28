import { ensureTursoSchema, getTursoClient } from "@/lib/turso";

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

const defaultFreelancers: FreelancerRow[] = [
  {
    id: "fr-1",
    freelancer: "Priya R",
    skill: "Video Editing",
    availability: "20 hrs/week",
    project: "Campaign Launch Kit",
    utilization: "78%",
    payout: "35000",
    performance: "4.7/5",
  },
  {
    id: "fr-2",
    freelancer: "Aman S",
    skill: "Performance Marketing",
    availability: "15 hrs/week",
    project: "Lead Gen Sprint",
    utilization: "91%",
    payout: "42000",
    performance: "4.4/5",
  },
  {
    id: "fr-3",
    freelancer: "Disha T",
    skill: "UI/Visual Design",
    availability: "10 hrs/week",
    project: "Website Revamp",
    utilization: "103%",
    payout: "38000",
    performance: "4.2/5",
  },
];

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
  await ensureTursoSchema();
  const client = getTursoClient();

  const countResult = await client.execute({
    sql: "SELECT COUNT(*) AS count FROM freelancers",
  });

  const countRow = countResult.rows[0] as Record<string, unknown> | undefined;
  const count = Number(countRow?.count ?? 0);

  if (count === 0) {
    for (const row of defaultFreelancers) {
      await client.execute({
        sql: `
          INSERT INTO freelancers (id, freelancer, skill, availability, project, utilization, payout, performance)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          row.id,
          row.freelancer,
          row.skill,
          row.availability,
          row.project,
          row.utilization,
          row.payout,
          row.performance,
        ],
      });
    }
  }

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
  await ensureTursoSchema();
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
  await ensureTursoSchema();
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
  await ensureTursoSchema();
  const client = getTursoClient();

  const result = await client.execute({
    sql: "DELETE FROM freelancers WHERE id = ?",
    args: [id],
  });

  return Number(result.rowsAffected ?? 0) > 0;
}
