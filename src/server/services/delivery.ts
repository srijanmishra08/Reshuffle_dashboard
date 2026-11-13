import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { milestonePatchSchema, projectListQuerySchema, projectPatchSchema } from "@/lib/schemas/delivery";
import { newId } from "@/lib/ids";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import { createInvoice } from "@/server/services/invoices";
import type { ServiceContext } from "@/server/services/companies";

const { deliveryProjects, projectMilestones, deals, scopes, invoices } = schema;

type ProjectRow = typeof deliveryProjects.$inferSelect;
type PaymentStep = { label: string; percent: number; amountPaise: number };

function audit(db: Db, ctx: ServiceContext, action: string, id: string, metadata?: Record<string, unknown>) {
  return logActivity(
    { actorId: ctx.userId, action: `project.${action}`, module: "projects", entityType: "project", entityId: id, metadata },
    db
  );
}

async function findProject(db: Db, orgId: string, id: string): Promise<ProjectRow | undefined> {
  const rows = await db
    .select()
    .from(deliveryProjects)
    .where(and(eq(deliveryProjects.id, id), eq(deliveryProjects.orgId, orgId)))
    .limit(1);
  return rows[0];
}

/** Project with milestones and billing figures taken from the invoices module (issued invoices only). */
export async function getProject(db: Db, ctx: ServiceContext, id: string) {
  const project = await findProject(db, ctx.orgId, id);
  if (!project) return fail("NOT_FOUND", "Project not found");

  const milestones = await db
    .select()
    .from(projectMilestones)
    .where(eq(projectMilestones.projectId, id))
    .orderBy(asc(projectMilestones.position));

  const billed = await db
    .select({
      invoicedPaise: sql<number>`COALESCE(SUM(${invoices.totalPaise}), 0)`,
      paidPaise: sql<number>`COALESCE(SUM(${invoices.paidPaise}), 0)`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.orgId, ctx.orgId),
        eq(invoices.projectId, id),
        inArray(invoices.status, ["ISSUED", "PARTIALLY_PAID", "PAID"])
      )
    );

  return ok({
    ...project,
    milestones,
    invoicedPaise: Number(billed[0]?.invoicedPaise ?? 0),
    paidPaise: Number(billed[0]?.paidPaise ?? 0),
  });
}

export async function listProjects(db: Db, ctx: ServiceContext, rawQuery: unknown = {}) {
  const parsed = projectListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return fail("VALIDATION", "Invalid filters", parsed.error.flatten());
  const conditions = [eq(deliveryProjects.orgId, ctx.orgId)];
  if (parsed.data.status) conditions.push(eq(deliveryProjects.status, parsed.data.status));
  if (parsed.data.companyId) conditions.push(eq(deliveryProjects.companyId, parsed.data.companyId));
  const rows = await db
    .select({
      id: deliveryProjects.id,
      name: deliveryProjects.name,
      status: deliveryProjects.status,
      companyId: deliveryProjects.companyId,
      companyName: schema.companies.name,
      budgetPaise: deliveryProjects.budgetPaise,
      dueDate: deliveryProjects.dueDate,
    })
    .from(deliveryProjects)
    .innerJoin(schema.companies, eq(schema.companies.id, deliveryProjects.companyId))
    .where(and(...conditions))
    .orderBy(desc(deliveryProjects.createdAt));
  return ok(rows);
}

/**
 * Won deal + accepted scope → project with one milestone per payment step.
 * Idempotent: a deal that already has a project returns it.
 */
export async function convertDealToProject(db: Db, ctx: ServiceContext, dealId: string) {
  const dealRows = await db
    .select()
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.orgId, ctx.orgId)))
    .limit(1);
  const deal = dealRows[0];
  if (!deal) return fail("NOT_FOUND", "Deal not found");

  const existing = await db
    .select({ id: deliveryProjects.id })
    .from(deliveryProjects)
    .where(and(eq(deliveryProjects.orgId, ctx.orgId), eq(deliveryProjects.dealId, dealId)))
    .limit(1);
  if (existing[0]) return getProject(db, ctx, existing[0].id);

  if (deal.stage !== "WON") return fail("CONFLICT", "Only a won deal can be converted to a project");

  const accepted = await db
    .select()
    .from(scopes)
    .where(and(eq(scopes.dealId, dealId), eq(scopes.orgId, ctx.orgId), eq(scopes.status, "ACCEPTED")))
    .orderBy(desc(scopes.version))
    .limit(1);
  const scope = accepted[0];
  if (!scope || !scope.snapshotJson) return fail("CONFLICT", "The deal needs an accepted scope first");

  const snapshot = scope.snapshotJson as unknown as { paymentSchedule: PaymentStep[]; totalPaise: number };
  const projectId = newId();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(deliveryProjects).values({
        id: projectId,
        orgId: ctx.orgId,
        companyId: deal.companyId,
        dealId,
        scopeId: scope.id,
        name: deal.title,
        budgetPaise: snapshot.totalPaise,
        createdBy: ctx.userId,
      });
      await tx.insert(projectMilestones).values(
        snapshot.paymentSchedule.map((step, position) => ({
          projectId,
          position,
          label: step.label,
          percent: step.percent,
          amountPaise: step.amountPaise,
        }))
      );
    });
  } catch (error) {
    // Lost a race with a concurrent conversion: the unique index on deal_id kept it to one project.
    const winner = await db
      .select({ id: deliveryProjects.id })
      .from(deliveryProjects)
      .where(and(eq(deliveryProjects.orgId, ctx.orgId), eq(deliveryProjects.dealId, dealId)))
      .limit(1);
    if (winner[0]) return getProject(db, ctx, winner[0].id);
    throw error;
  }

  await audit(db, ctx, "created", projectId, { dealId, scopeId: scope.id });
  return getProject(db, ctx, projectId);
}

export async function updateProject(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = projectPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid project", parsed.error.flatten());
  const existing = await findProject(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Project not found");

  const changes: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(parsed.data)) if (v !== undefined) changes[k] = v;
  await db.update(deliveryProjects).set(changes).where(eq(deliveryProjects.id, id));
  await audit(db, ctx, "updated", id, { fields: Object.keys(parsed.data) });
  return getProject(db, ctx, id);
}

export async function updateMilestone(db: Db, ctx: ServiceContext, projectId: string, milestoneId: string, raw: unknown) {
  const parsed = milestonePatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid milestone", parsed.error.flatten());
  const project = await findProject(db, ctx.orgId, projectId);
  if (!project) return fail("NOT_FOUND", "Project not found");

  const rows = await db
    .select()
    .from(projectMilestones)
    .where(and(eq(projectMilestones.id, milestoneId), eq(projectMilestones.projectId, projectId)))
    .limit(1);
  const milestone = rows[0];
  if (!milestone) return fail("NOT_FOUND", "Milestone not found");
  if (milestone.status === "INVOICED" && parsed.data.status) {
    return fail("CONFLICT", "An invoiced milestone cannot change status");
  }

  const now = new Date();
  const changes: Record<string, unknown> = { updatedAt: now };
  if (parsed.data.dueDate !== undefined) changes.dueDate = parsed.data.dueDate;
  if (parsed.data.status) {
    changes.status = parsed.data.status;
    changes.completedAt = parsed.data.status === "DONE" ? now : null;
  }
  await db.update(projectMilestones).set(changes).where(eq(projectMilestones.id, milestoneId));
  await audit(db, ctx, "milestone_updated", projectId, { milestoneId, ...parsed.data });
  return getProject(db, ctx, projectId);
}

/**
 * Creates a DRAFT invoice for one milestone. The milestone is claimed first (compare-and-set on
 * "no invoice yet"), so a double click cannot create two drafts. The amount is treated as pre-GST.
 */
export async function draftMilestoneInvoice(db: Db, ctx: ServiceContext, projectId: string, milestoneId: string) {
  const project = await findProject(db, ctx.orgId, projectId);
  if (!project) return fail("NOT_FOUND", "Project not found");

  const rows = await db
    .select()
    .from(projectMilestones)
    .where(and(eq(projectMilestones.id, milestoneId), eq(projectMilestones.projectId, projectId)))
    .limit(1);
  const milestone = rows[0];
  if (!milestone) return fail("NOT_FOUND", "Milestone not found");
  if (milestone.amountPaise <= 0) return fail("VALIDATION", "The milestone amount must be above zero");

  const previousStatus = milestone.status;
  const claimed = await db
    .update(projectMilestones)
    .set({ status: "INVOICED", updatedAt: new Date() })
    .where(
      and(
        eq(projectMilestones.id, milestoneId),
        isNull(projectMilestones.invoiceId),
        inArray(projectMilestones.status, ["PENDING", "DONE"])
      )
    )
    .returning({ id: projectMilestones.id });
  if (claimed.length === 0) return fail("CONFLICT", "This milestone already has an invoice");

  const invoice = await createInvoice(db, ctx, {
    companyId: project.companyId,
    dealId: project.dealId,
    projectId: project.id,
    items: [
      {
        description: `${project.name} - ${milestone.label} (${milestone.percent}%)`,
        quantity: 1,
        ratePaise: milestone.amountPaise,
        taxable: true,
      },
    ],
  });
  if (!invoice.ok) {
    await db
      .update(projectMilestones)
      .set({ status: previousStatus, updatedAt: new Date() })
      .where(eq(projectMilestones.id, milestoneId));
    return invoice;
  }

  await db.update(projectMilestones).set({ invoiceId: invoice.data.id }).where(eq(projectMilestones.id, milestoneId));
  await audit(db, ctx, "milestone_invoiced", projectId, { milestoneId, invoiceId: invoice.data.id });
  return ok({ invoiceId: invoice.data.id });
}
