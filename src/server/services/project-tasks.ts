import { and, asc, desc, eq, inArray, lt, max, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { doneStatuses, projectCreateSchema, taskInputSchema, taskPatchSchema } from "@/lib/schemas/project-tasks";
import { projectListQuerySchema } from "@/lib/schemas/delivery";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";
import { todayIst } from "@/server/services/invoices";

const { projectTasks, deliveryProjects, projectMilestones, companies, legacyFreelancers } = schema;

function audit(db: Db, ctx: ServiceContext, action: string, id: string, metadata?: Record<string, unknown>) {
  return logActivity(
    { actorId: ctx.userId, action: `task.${action}`, module: "projects", entityType: "task", entityId: id, metadata },
    db
  );
}

async function projectInOrg(db: Db, ctx: ServiceContext, projectId: string) {
  const rows = await db
    .select({ id: deliveryProjects.id })
    .from(deliveryProjects)
    .where(and(eq(deliveryProjects.id, projectId), eq(deliveryProjects.orgId, ctx.orgId)))
    .limit(1);
  return rows.length > 0;
}

async function freelancerExists(db: Db, id: string) {
  const rows = await db.select({ id: legacyFreelancers.id }).from(legacyFreelancers).where(eq(legacyFreelancers.id, id)).limit(1);
  return rows.length > 0;
}

/** Creates a project for a client without going through a deal. It starts ACTIVE with no milestones. */
export async function createProject(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = projectCreateSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid project", parsed.error.flatten());
  const input = parsed.data;
  const company = await db
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, input.companyId), eq(companies.orgId, ctx.orgId)))
    .limit(1);
  if (company.length === 0) return fail("NOT_FOUND", "Client not found");
  if (input.startDate && input.dueDate && input.dueDate < input.startDate) return fail("VALIDATION", "Due date is before the start date");
  const [row] = await db
    .insert(deliveryProjects)
    .values({
      orgId: ctx.orgId,
      companyId: input.companyId,
      name: input.name,
      status: "ACTIVE",
      budgetPaise: input.budgetPaise,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      createdBy: ctx.userId,
    })
    .returning();
  await logActivity(
    { actorId: ctx.userId, action: "project.created", module: "projects", entityType: "project", entityId: row.id },
    db
  );
  return ok(row);
}

export async function listTasks(db: Db, ctx: ServiceContext, projectId: string) {
  if (!(await projectInOrg(db, ctx, projectId))) return fail("NOT_FOUND", "Project not found");
  const rows = await db
    .select({
      id: projectTasks.id,
      projectId: projectTasks.projectId,
      title: projectTasks.title,
      description: projectTasks.description,
      status: projectTasks.status,
      priority: projectTasks.priority,
      dueDate: projectTasks.dueDate,
      budgetPaise: projectTasks.budgetPaise,
      assigneeId: projectTasks.assigneeId,
      assigneeName: legacyFreelancers.freelancer,
      position: projectTasks.position,
      completedAt: projectTasks.completedAt,
    })
    .from(projectTasks)
    .leftJoin(legacyFreelancers, eq(legacyFreelancers.id, projectTasks.assigneeId))
    .where(eq(projectTasks.projectId, projectId))
    .orderBy(asc(projectTasks.position), asc(projectTasks.createdAt));
  return ok(rows);
}

async function nextPosition(db: Db, projectId: string, status: string) {
  const rows = await db
    .select({ top: max(projectTasks.position) })
    .from(projectTasks)
    .where(and(eq(projectTasks.projectId, projectId), eq(projectTasks.status, status)));
  return (rows[0]?.top ?? -1) + 1;
}

const isDone = (status: string) => (doneStatuses as readonly string[]).includes(status);

export async function createTask(db: Db, ctx: ServiceContext, projectId: string, raw: unknown) {
  const parsed = taskInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid task", parsed.error.flatten());
  if (!(await projectInOrg(db, ctx, projectId))) return fail("NOT_FOUND", "Project not found");
  const input = parsed.data;
  if (input.assigneeId && !(await freelancerExists(db, input.assigneeId))) return fail("NOT_FOUND", "Freelancer not found");
  const [row] = await db
    .insert(projectTasks)
    .values({
      orgId: ctx.orgId,
      projectId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
      budgetPaise: input.budgetPaise,
      assigneeId: input.assigneeId ?? null,
      position: await nextPosition(db, projectId, input.status),
      completedAt: isDone(input.status) ? new Date() : null,
      createdBy: ctx.userId,
    })
    .returning();
  await audit(db, ctx, "created", row.id, { projectId });
  return ok(row);
}

async function findTask(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .select()
    .from(projectTasks)
    .where(and(eq(projectTasks.id, id), eq(projectTasks.orgId, ctx.orgId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Edits a task. Moving it to another column puts it at the bottom of that column. */
export async function updateTask(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = taskPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid task", parsed.error.flatten());
  const task = await findTask(db, ctx, id);
  if (!task) return fail("NOT_FOUND", "Task not found");
  const patch = parsed.data;
  if (patch.assigneeId && !(await freelancerExists(db, patch.assigneeId))) return fail("NOT_FOUND", "Freelancer not found");

  const changes: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) changes[k] = v;
  if (patch.status && patch.status !== task.status) {
    changes.position = await nextPosition(db, task.projectId, patch.status);
    if (isDone(patch.status) !== isDone(task.status)) changes.completedAt = isDone(patch.status) ? new Date() : null;
  }
  const [row] = await db.update(projectTasks).set(changes).where(eq(projectTasks.id, id)).returning();
  await audit(db, ctx, patch.status && patch.status !== task.status ? "moved" : "updated", id, {
    projectId: task.projectId,
    ...(patch.status ? { from: task.status, to: patch.status } : {}),
  });
  return ok(row);
}

export async function deleteTask(db: Db, ctx: ServiceContext, id: string) {
  const task = await findTask(db, ctx, id);
  if (!task) return fail("NOT_FOUND", "Task not found");
  await db.delete(projectTasks).where(eq(projectTasks.id, id));
  await audit(db, ctx, "deleted", id, { projectId: task.projectId });
  return ok({ id });
}

export type ProjectProgress = {
  id: string;
  name: string;
  status: string;
  companyId: string;
  companyName: string;
  budgetPaise: number;
  startDate: string | null;
  dueDate: string | null;
  tasksTotal: number;
  tasksDone: number;
  tasksOverdue: number;
  inReview: number;
  milestonesTotal: number;
  milestonesDone: number;
  /** 0 to 100. Tasks decide it; a project with no tasks falls back to its milestones. */
  progressPercent: number;
  overdue: boolean;
};

/** Every project with how far along it is. Used by the projects page and the client page. */
export async function listProjectProgress(db: Db, ctx: ServiceContext, rawQuery: unknown = {}, now = new Date()) {
  const parsed = projectListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return fail("VALIDATION", "Invalid filters", parsed.error.flatten());
  const today = todayIst(now);
  const conditions = [eq(deliveryProjects.orgId, ctx.orgId)];
  if (parsed.data.status) conditions.push(eq(deliveryProjects.status, parsed.data.status));
  if (parsed.data.companyId) conditions.push(eq(deliveryProjects.companyId, parsed.data.companyId));

  const projects = await db
    .select({
      id: deliveryProjects.id,
      name: deliveryProjects.name,
      status: deliveryProjects.status,
      companyId: deliveryProjects.companyId,
      companyName: companies.name,
      budgetPaise: deliveryProjects.budgetPaise,
      startDate: deliveryProjects.startDate,
      dueDate: deliveryProjects.dueDate,
    })
    .from(deliveryProjects)
    .innerJoin(companies, eq(companies.id, deliveryProjects.companyId))
    .where(and(...conditions))
    .orderBy(desc(deliveryProjects.createdAt));
  if (projects.length === 0) return ok([] as ProjectProgress[]);
  const ids = projects.map((p) => p.id);

  const [taskRows, overdueRows, milestoneRows] = await Promise.all([
    db
      .select({ projectId: projectTasks.projectId, status: projectTasks.status, n: sql<number>`count(*)` })
      .from(projectTasks)
      .where(inArray(projectTasks.projectId, ids))
      .groupBy(projectTasks.projectId, projectTasks.status),
    db
      .select({ projectId: projectTasks.projectId, n: sql<number>`count(*)` })
      .from(projectTasks)
      .where(
        and(inArray(projectTasks.projectId, ids), lt(projectTasks.dueDate, today), inArray(projectTasks.status, ["BACKLOG", "TODO", "IN_PROGRESS", "CLIENT_REVIEW", "REVISION"]))
      )
      .groupBy(projectTasks.projectId),
    db
      .select({ projectId: projectMilestones.projectId, status: projectMilestones.status, n: sql<number>`count(*)` })
      .from(projectMilestones)
      .where(inArray(projectMilestones.projectId, ids))
      .groupBy(projectMilestones.projectId, projectMilestones.status),
  ]);

  const rows: ProjectProgress[] = projects.map((p) => {
    const tasks = taskRows.filter((t) => t.projectId === p.id);
    const sum = (list: { n: number }[]) => list.reduce((s, r) => s + Number(r.n), 0);
    const tasksTotal = sum(tasks);
    const tasksDone = sum(tasks.filter((t) => isDone(t.status)));
    const milestones = milestoneRows.filter((m) => m.projectId === p.id);
    const milestonesTotal = sum(milestones);
    const milestonesDone = sum(milestones.filter((m) => m.status !== "PENDING"));
    const finished = p.status === "COMPLETED";
    const progressPercent = finished
      ? 100
      : tasksTotal > 0
        ? Math.round((tasksDone / tasksTotal) * 100)
        : milestonesTotal > 0
          ? Math.round((milestonesDone / milestonesTotal) * 100)
          : 0;
    return {
      ...p,
      tasksTotal,
      tasksDone,
      tasksOverdue: Number(overdueRows.find((o) => o.projectId === p.id)?.n ?? 0),
      inReview: sum(tasks.filter((t) => t.status === "CLIENT_REVIEW")),
      milestonesTotal,
      milestonesDone,
      progressPercent,
      overdue: Boolean(p.dueDate && p.dueDate < today && (p.status === "PLANNED" || p.status === "ACTIVE" || p.status === "ON_HOLD")),
    };
  });
  return ok(rows);
}
