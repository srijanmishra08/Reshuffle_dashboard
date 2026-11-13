import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { goalInputSchema, goalListQuerySchema, goalPatchSchema } from "@/lib/schemas/goals";
import { newId } from "@/lib/ids";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";

const { goals } = schema;

function audit(db: Db, ctx: ServiceContext, action: string, id: string) {
  return logActivity(
    { actorId: ctx.userId, action: `goal.${action}`, module: "goals", entityType: "goal", entityId: id },
    db
  );
}

export async function listGoals(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = goalListQuerySchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid query", parsed.error.flatten());
  const { month, team, status } = parsed.data;
  const conditions = [eq(goals.orgId, ctx.orgId)];
  if (month) conditions.push(eq(goals.month, month));
  if (team) conditions.push(eq(goals.team, team));
  if (status) conditions.push(eq(goals.status, status));
  const rows = await db
    .select()
    .from(goals)
    .where(and(...conditions))
    .orderBy(asc(goals.dueDate), asc(goals.createdAt));
  return ok(rows);
}

export async function getGoal(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .select()
    .from(goals)
    .where(and(eq(goals.id, id), eq(goals.orgId, ctx.orgId)))
    .limit(1);
  if (!rows[0]) return fail("NOT_FOUND", "Goal not found");
  return ok(rows[0]);
}

export async function createGoal(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = goalInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid goal", parsed.error.flatten());
  const id = newId();
  await db.insert(goals).values({ id, orgId: ctx.orgId, ...parsed.data, createdBy: ctx.userId });
  await audit(db, ctx, "created", id);
  return getGoal(db, ctx, id);
}

export async function updateGoal(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = goalPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid goal", parsed.error.flatten());

  const existing = await getGoal(db, ctx, id);
  if (!existing.ok) return existing;
  const start = parsed.data.startDate === undefined ? existing.data.startDate : parsed.data.startDate;
  const due = parsed.data.dueDate === undefined ? existing.data.dueDate : parsed.data.dueDate;
  if (start && due && start > due) {
    return fail("VALIDATION", "Due date must not be before the start date");
  }

  await db
    .update(goals)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(goals.id, id), eq(goals.orgId, ctx.orgId)));
  await audit(db, ctx, "updated", id);
  return getGoal(db, ctx, id);
}

export async function deleteGoal(db: Db, ctx: ServiceContext, id: string) {
  const removed = await db
    .delete(goals)
    .where(and(eq(goals.id, id), eq(goals.orgId, ctx.orgId)))
    .returning({ id: goals.id });
  if (removed.length === 0) return fail("NOT_FOUND", "Goal not found");
  await audit(db, ctx, "deleted", id);
  return ok({ id });
}
