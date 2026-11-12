import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { newId } from "@/lib/ids";
import { schema, type Db } from "@/server/db/client";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";

const { tasks, projects } = schema;

export const createTaskSchema = z.object({
  projectId: z.string().min(1),
  assignedTo: z.string().optional(),
  title: z.string().min(2),
  details: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
});

export async function listTasks(db: Db) {
  const rows = await db
    .select({ task: tasks, projectId: projects.id, projectName: projects.name })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .orderBy(desc(tasks.updatedAt));

  return ok(
    rows.map(({ task, projectId, projectName }) => ({
      id: task.id,
      projectId: task.projectId,
      assignedTo: task.assignedTo,
      title: task.title,
      details: task.details,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      assignee: null,
      project: projectId ? { id: projectId, name: projectName ?? "" } : null,
    }))
  );
}

export async function createTask(db: Db, actorId: string, raw: unknown) {
  const parsed = createTaskSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid task", parsed.error.flatten());
  }

  const input = parsed.data;
  const now = new Date();
  const task = {
    id: newId(),
    projectId: input.projectId,
    assignedTo: input.assignedTo ?? null,
    title: input.title,
    details: input.details ?? null,
    status: "TODO",
    priority: input.priority ?? "MEDIUM",
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(tasks).values(task);
  await logActivity(
    { actorId, action: "task.created", module: "projects", entityType: "task", entityId: task.id, metadata: { title: task.title } },
    db
  );

  return ok(task);
}
