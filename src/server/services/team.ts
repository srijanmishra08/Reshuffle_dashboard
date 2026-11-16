import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import {
  assignmentInputSchema,
  assignmentPatchSchema,
  financePlanSchema,
  payoutInputSchema,
  payoutListQuerySchema,
  payoutPaySchema,
  planKeySchema,
} from "@/lib/schemas/team";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";
import { todayIst } from "@/server/services/invoices";

const { legacyFreelancers, freelancerAssignments, payouts, deliveryProjects, ledgerEntries, financePlans } = schema;

function audit(db: Db, ctx: ServiceContext, action: string, entityType: string, id: string, metadata?: Record<string, unknown>) {
  return logActivity({ actorId: ctx.userId, action, module: "freelancers", entityType, entityId: id, metadata }, db);
}

async function findFreelancer(db: Db, id: string) {
  const rows = await db
    .select({ id: legacyFreelancers.id, name: legacyFreelancers.freelancer })
    .from(legacyFreelancers)
    .where(eq(legacyFreelancers.id, id))
    .limit(1);
  return rows[0];
}

async function projectInOrg(db: Db, orgId: string, projectId: string) {
  const rows = await db
    .select({ id: deliveryProjects.id })
    .from(deliveryProjects)
    .where(and(eq(deliveryProjects.id, projectId), eq(deliveryProjects.orgId, orgId)))
    .limit(1);
  return rows.length > 0;
}

/* -------------------------------- assignments ------------------------------- */

export async function createAssignment(db: Db, ctx: ServiceContext, freelancerId: string, raw: unknown) {
  const parsed = assignmentInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid assignment", parsed.error.flatten());
  const input = parsed.data;

  if (!(await findFreelancer(db, freelancerId))) return fail("NOT_FOUND", "Freelancer not found");
  if (!(await projectInOrg(db, ctx.orgId, input.projectId))) return fail("NOT_FOUND", "Project not found");

  const inserted = await db
    .insert(freelancerAssignments)
    .values({
      orgId: ctx.orgId,
      freelancerId,
      projectId: input.projectId,
      role: input.role,
      allocationPct: input.allocationPct,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      createdBy: ctx.userId,
    })
    .returning();
  await audit(db, ctx, "assignment.created", "assignment", inserted[0].id, { freelancerId, projectId: input.projectId });
  return ok(inserted[0]);
}

export async function updateAssignment(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = assignmentPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid assignment", parsed.error.flatten());
  const patch = parsed.data;

  const set: Partial<typeof freelancerAssignments.$inferInsert> = { updatedAt: new Date() };
  if (patch.role !== undefined) set.role = patch.role;
  if (patch.allocationPct !== undefined) set.allocationPct = patch.allocationPct;
  if (patch.startDate !== undefined) set.startDate = patch.startDate;
  if (patch.endDate !== undefined) set.endDate = patch.endDate;
  if (patch.status !== undefined) set.status = patch.status;

  const updated = await db
    .update(freelancerAssignments)
    .set(set)
    .where(and(eq(freelancerAssignments.id, id), eq(freelancerAssignments.orgId, ctx.orgId)))
    .returning();
  if (updated.length === 0) return fail("NOT_FOUND", "Assignment not found");
  await audit(db, ctx, "assignment.updated", "assignment", id, { fields: Object.keys(patch) });
  return ok(updated[0]);
}

/* ---------------------------------- payouts --------------------------------- */

export async function createPayout(db: Db, ctx: ServiceContext, freelancerId: string, raw: unknown) {
  const parsed = payoutInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid payout", parsed.error.flatten());
  const input = parsed.data;

  if (!(await findFreelancer(db, freelancerId))) return fail("NOT_FOUND", "Freelancer not found");
  if (input.projectId && !(await projectInOrg(db, ctx.orgId, input.projectId))) {
    return fail("NOT_FOUND", "Project not found");
  }

  const inserted = await db
    .insert(payouts)
    .values({
      orgId: ctx.orgId,
      freelancerId,
      projectId: input.projectId ?? null,
      description: input.description,
      amountPaise: input.amountPaise,
      dueDate: input.dueDate ?? null,
      createdBy: ctx.userId,
    })
    .returning();
  await audit(db, ctx, "payout.created", "payout", inserted[0].id, { freelancerId, amountPaise: input.amountPaise });
  return ok(inserted[0]);
}

/**
 * PENDING -> PAID, and the matching EXPENSE ledger entry, in one transaction.
 * Paying twice is a conflict; the unique ledger source index is the backstop.
 */
export async function markPayoutPaid(db: Db, ctx: ServiceContext, id: string, raw: unknown = {}) {
  const parsed = payoutPaySchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid payment date", parsed.error.flatten());
  const paidOn = parsed.data.paidOn ?? todayIst();

  const result = await db.transaction(async (tx) => {
    const claimed = await tx
      .update(payouts)
      .set({ status: "PAID", paidOn, updatedAt: new Date() })
      .where(and(eq(payouts.id, id), eq(payouts.orgId, ctx.orgId), eq(payouts.status, "PENDING")))
      .returning();
    const payout = claimed[0];
    if (!payout) return null;

    const freelancer = await tx
      .select({ name: legacyFreelancers.freelancer })
      .from(legacyFreelancers)
      .where(eq(legacyFreelancers.id, payout.freelancerId))
      .limit(1);

    await tx.insert(ledgerEntries).values({
      orgId: ctx.orgId,
      kind: "EXPENSE",
      entryDate: paidOn,
      amountPaise: payout.amountPaise,
      description: `Payout: ${freelancer[0]?.name ?? "freelancer"}${payout.description ? ` (${payout.description})` : ""}`,
      projectId: payout.projectId,
      sourceType: "PAYOUT",
      sourceId: payout.id,
      createdBy: ctx.userId,
    });
    return payout;
  });

  if (!result) {
    const existing = await db
      .select({ status: payouts.status })
      .from(payouts)
      .where(and(eq(payouts.id, id), eq(payouts.orgId, ctx.orgId)))
      .limit(1);
    if (!existing[0]) return fail("NOT_FOUND", "Payout not found");
    return fail("CONFLICT", `Payout is already ${existing[0].status.toLowerCase()}`);
  }
  await audit(db, ctx, "payout.paid", "payout", id, { amountPaise: result.amountPaise });
  return ok(result);
}

export async function cancelPayout(db: Db, ctx: ServiceContext, id: string) {
  const updated = await db
    .update(payouts)
    .set({ status: "CANCELLED", updatedAt: new Date() })
    .where(and(eq(payouts.id, id), eq(payouts.orgId, ctx.orgId), eq(payouts.status, "PENDING")))
    .returning();
  if (updated.length === 0) {
    const existing = await db
      .select({ status: payouts.status })
      .from(payouts)
      .where(and(eq(payouts.id, id), eq(payouts.orgId, ctx.orgId)))
      .limit(1);
    if (!existing[0]) return fail("NOT_FOUND", "Payout not found");
    return fail("CONFLICT", "Only a pending payout can be cancelled");
  }
  await audit(db, ctx, "payout.cancelled", "payout", id);
  return ok(updated[0]);
}

const payoutColumns = {
  id: payouts.id,
  freelancerId: payouts.freelancerId,
  freelancerName: legacyFreelancers.freelancer,
  projectId: payouts.projectId,
  projectName: deliveryProjects.name,
  description: payouts.description,
  amountPaise: payouts.amountPaise,
  dueDate: payouts.dueDate,
  paidOn: payouts.paidOn,
  status: payouts.status,
  createdAt: payouts.createdAt,
};

/** Every payout in the organisation, newest first, with totals per status. */
export async function listPayouts(db: Db, ctx: ServiceContext, rawQuery: unknown = {}) {
  const parsed = payoutListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return fail("VALIDATION", "Invalid query", parsed.error.flatten());

  const where = [eq(payouts.orgId, ctx.orgId)];
  if (parsed.data.status) where.push(eq(payouts.status, parsed.data.status));

  const [rows, totals] = await Promise.all([
    db
      .select(payoutColumns)
      .from(payouts)
      .innerJoin(legacyFreelancers, eq(legacyFreelancers.id, payouts.freelancerId))
      .leftJoin(deliveryProjects, eq(deliveryProjects.id, payouts.projectId))
      .where(and(...where))
      .orderBy(desc(payouts.createdAt))
      .limit(500),
    db
      .select({ status: payouts.status, total: sql<number>`coalesce(sum(${payouts.amountPaise}), 0)` })
      .from(payouts)
      .where(eq(payouts.orgId, ctx.orgId))
      .groupBy(payouts.status),
  ]);
  const by = new Map(totals.map((t) => [t.status, Number(t.total)]));
  return ok({ rows, pendingPaise: by.get("PENDING") ?? 0, paidPaise: by.get("PAID") ?? 0 });
}

/** One freelancer with their assignments and payouts in this organisation. */
export async function getFreelancerTeamView(db: Db, ctx: ServiceContext, freelancerId: string) {
  const rows = await db.select().from(legacyFreelancers).where(eq(legacyFreelancers.id, freelancerId)).limit(1);
  const freelancer = rows[0];
  if (!freelancer) return fail("NOT_FOUND", "Freelancer not found");

  const [assignments, payoutRows] = await Promise.all([
    db
      .select({
        id: freelancerAssignments.id,
        projectId: freelancerAssignments.projectId,
        projectName: deliveryProjects.name,
        role: freelancerAssignments.role,
        allocationPct: freelancerAssignments.allocationPct,
        startDate: freelancerAssignments.startDate,
        endDate: freelancerAssignments.endDate,
        status: freelancerAssignments.status,
      })
      .from(freelancerAssignments)
      .innerJoin(deliveryProjects, eq(deliveryProjects.id, freelancerAssignments.projectId))
      .where(and(eq(freelancerAssignments.freelancerId, freelancerId), eq(freelancerAssignments.orgId, ctx.orgId)))
      .orderBy(asc(freelancerAssignments.status), desc(freelancerAssignments.createdAt)),
    db
      .select(payoutColumns)
      .from(payouts)
      .innerJoin(legacyFreelancers, eq(legacyFreelancers.id, payouts.freelancerId))
      .leftJoin(deliveryProjects, eq(deliveryProjects.id, payouts.projectId))
      .where(and(eq(payouts.freelancerId, freelancerId), eq(payouts.orgId, ctx.orgId)))
      .orderBy(desc(payouts.createdAt)),
  ]);

  const sum = (status: string) => payoutRows.filter((p) => p.status === status).reduce((s, p) => s + p.amountPaise, 0);
  return ok({
    freelancer: {
      id: freelancer.id,
      name: freelancer.freelancer,
      skill: freelancer.skill,
      category: freelancer.category,
      company: freelancer.company,
      email: freelancer.email,
      phone: freelancer.phone,
      availability: freelancer.availability,
    },
    assignments,
    /** Sum of allocation across active assignments; above 100 means overbooked. */
    utilizationPct: assignments.filter((a) => a.status === "ACTIVE").reduce((s, a) => s + a.allocationPct, 0),
    payouts: payoutRows,
    pendingPaise: sum("PENDING"),
    paidPaise: sum("PAID"),
  });
}

/* ------------------------------- finance plans ------------------------------ */

export async function getFinancePlan(db: Db, ctx: ServiceContext, key: string) {
  if (!planKeySchema.safeParse(key).success) return fail("VALIDATION", "Invalid plan key");
  const rows = await db
    .select({ data: financePlans.data, updatedAt: financePlans.updatedAt })
    .from(financePlans)
    .where(and(eq(financePlans.orgId, ctx.orgId), eq(financePlans.key, key)))
    .limit(1);
  return ok(rows[0] ?? null);
}

export async function saveFinancePlan(db: Db, ctx: ServiceContext, key: string, raw: unknown) {
  if (!planKeySchema.safeParse(key).success) return fail("VALIDATION", "Invalid plan key");
  const parsed = financePlanSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid plan", parsed.error.flatten());

  const now = new Date();
  const saved = await db
    .insert(financePlans)
    .values({ orgId: ctx.orgId, key, data: parsed.data.data, updatedBy: ctx.userId, updatedAt: now })
    .onConflictDoUpdate({
      target: [financePlans.orgId, financePlans.key],
      set: { data: parsed.data.data, updatedBy: ctx.userId, updatedAt: now },
    })
    .returning({ data: financePlans.data, updatedAt: financePlans.updatedAt });
  await logActivity(
    { actorId: ctx.userId, action: "finance_plan.saved", module: "finance", entityType: "finance_plan", entityId: key },
    db
  );
  return ok(saved[0]);
}
