import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { teamCommentSchema } from "@/lib/schemas/access";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";

const { taskComments, projectTasks } = schema;

export type TaskCommentRow = {
  id: string;
  taskId: string;
  authorRole: string;
  authorName: string;
  kind: string;
  body: string;
  internal: boolean;
  createdAt: Date;
};

const columns = {
  id: taskComments.id,
  taskId: taskComments.taskId,
  authorRole: taskComments.authorRole,
  authorName: taskComments.authorName,
  kind: taskComments.kind,
  body: taskComments.body,
  internal: taskComments.internal,
  createdAt: taskComments.createdAt,
};

type NewComment = {
  orgId: string;
  taskId: string;
  authorRole: "TEAM" | "CLIENT" | "FREELANCER" | "AGENCY";
  authorName: string;
  authorUserId: string;
  kind?: "COMMENT" | "REVISION_REQUEST" | "APPROVAL";
  body: string;
  internal?: boolean;
};

export async function insertComment(db: Db, input: NewComment): Promise<TaskCommentRow> {
  const [row] = await db
    .insert(taskComments)
    .values({
      orgId: input.orgId,
      taskId: input.taskId,
      authorRole: input.authorRole,
      authorName: input.authorName.slice(0, 200),
      authorUserId: input.authorUserId,
      kind: input.kind ?? "COMMENT",
      body: input.body,
      internal: input.internal ?? false,
    })
    .returning(columns);
  return row;
}

/** The comments on a set of tasks, oldest first, grouped by task. The client never gets internal notes. */
export async function commentsByTask(db: Db, taskIds: string[], opts: { includeInternal: boolean }) {
  const grouped = new Map<string, TaskCommentRow[]>();
  if (taskIds.length === 0) return grouped;
  const rows = await db
    .select(columns)
    .from(taskComments)
    .where(opts.includeInternal ? inArray(taskComments.taskId, taskIds) : and(inArray(taskComments.taskId, taskIds), eq(taskComments.internal, false)))
    .orderBy(asc(taskComments.createdAt));
  for (const row of rows) grouped.set(row.taskId, [...(grouped.get(row.taskId) ?? []), row]);
  return grouped;
}

async function taskInOrg(db: Db, ctx: ServiceContext, taskId: string) {
  const rows = await db
    .select({ id: projectTasks.id })
    .from(projectTasks)
    .where(and(eq(projectTasks.id, taskId), eq(projectTasks.orgId, ctx.orgId)))
    .limit(1);
  return rows.length > 0;
}

/** All comments on one task, for the team. */
export async function listTaskComments(db: Db, ctx: ServiceContext, taskId: string) {
  if (!(await taskInOrg(db, ctx, taskId))) return fail("NOT_FOUND", "Task not found");
  return ok((await commentsByTask(db, [taskId], { includeInternal: true })).get(taskId) ?? []);
}

/** A note from the team. Ticking internal keeps it from the client. */
export async function addTeamComment(db: Db, ctx: ServiceContext, authorName: string, taskId: string, raw: unknown) {
  const parsed = teamCommentSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid comment");
  if (!(await taskInOrg(db, ctx, taskId))) return fail("NOT_FOUND", "Task not found");
  const row = await insertComment(db, { orgId: ctx.orgId, taskId, authorRole: "TEAM", authorName, authorUserId: ctx.userId, body: parsed.data.body, internal: parsed.data.internal });
  await logActivity({ actorId: ctx.userId, action: "task.commented", module: "projects", entityType: "task", entityId: taskId }, db);
  return ok(row);
}
