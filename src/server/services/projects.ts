import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { newId } from "@/lib/ids";
import { schema, type Db } from "@/server/db/client";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";

const { projects, legacyClients } = schema;

export const createProjectSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(2),
  description: z.string().optional(),
  deadline: z.string().datetime().optional(),
});

export async function listProjects(db: Db) {
  const rows = await db
    .select({ project: projects, client: legacyClients })
    .from(projects)
    .leftJoin(legacyClients, eq(legacyClients.id, projects.clientId))
    .orderBy(desc(projects.updatedAt));

  return ok(
    rows.map(({ project, client }) => ({
      id: project.id,
      clientId: project.clientId,
      name: project.name,
      description: project.description,
      status: project.status,
      deadline: project.deadline,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      client: client
        ? { id: client.id, name: client.name, company: client.company, notes: client.notes, stage: client.stage, status: client.status }
        : null,
      tasks: [],
      assignments: [],
    }))
  );
}

export async function createProject(db: Db, actorId: string, raw: unknown) {
  const parsed = createProjectSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid project", parsed.error.flatten());
  }

  const input = parsed.data;
  const now = new Date().toISOString();
  const project = {
    id: newId(),
    clientId: input.clientId,
    name: input.name,
    description: input.description ?? null,
    status: "TODO",
    deadline: input.deadline ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(projects).values(project);
  await logActivity(
    { actorId, action: "project.created", module: "projects", entityType: "project", entityId: project.id, metadata: { name: project.name } },
    db
  );

  return ok(project);
}
