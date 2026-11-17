import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { clientTaskResponseSchema, portalTaskUpdateSchema } from "@/lib/schemas/access";
import { doneStatuses } from "@/lib/schemas/project-tasks";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";
import { getProject } from "@/server/services/delivery";
import { todayIst } from "@/server/services/invoices";
import { listProjectProgress, updateTask } from "@/server/services/project-tasks";
import { getFreelancerTeamView } from "@/server/services/team";
import type { AuthedUser } from "@/server/session-user";

/**
 * What outside people see. Every function takes the signed-in user and only ever reads or changes
 * records linked to that user's sign-in: a client's company, a freelancer's own tasks and payouts,
 * an agency's own freelancers. Nothing here returns another party's money or contact details.
 */
const {
  companies,
  deals,
  scopes,
  invoices,
  projectTasks,
  deliveryProjects,
  questionnaires,
  legacyFreelancers,
  agencies,
  agencyFreelancers,
  payouts,
} = schema;

const ctxOf = (user: AuthedUser): ServiceContext => ({ orgId: user.orgId, userId: user.id });
const isDone = (status: string) => (doneStatuses as readonly string[]).includes(status);

/* --------------------------------- client ---------------------------------- */

const NO_CLIENT = "No client record is linked to this sign-in. Ask the team to link it.";

export async function getClientHome(db: Db, user: AuthedUser) {
  const companyId = user.links.companyId;
  if (user.role !== "CLIENT" || !companyId) return fail("NOT_FOUND", NO_CLIENT);
  const ctx = ctxOf(user);

  const company = (
    await db.select({ id: companies.id, name: companies.name }).from(companies).where(and(eq(companies.id, companyId), eq(companies.orgId, ctx.orgId))).limit(1)
  )[0];
  if (!company) return fail("NOT_FOUND", NO_CLIENT);

  const [projects, review, invoiceRows, scopeRows, forms] = await Promise.all([
    listProjectProgress(db, ctx, { companyId }),
    db
      .select({
        id: projectTasks.id,
        title: projectTasks.title,
        description: projectTasks.description,
        dueDate: projectTasks.dueDate,
        projectId: deliveryProjects.id,
        projectName: deliveryProjects.name,
      })
      .from(projectTasks)
      .innerJoin(deliveryProjects, eq(deliveryProjects.id, projectTasks.projectId))
      .where(and(eq(deliveryProjects.companyId, companyId), eq(deliveryProjects.orgId, ctx.orgId), eq(projectTasks.status, "CLIENT_REVIEW")))
      .orderBy(asc(projectTasks.dueDate)),
    db
      .select({
        id: invoices.id,
        number: invoices.number,
        status: invoices.status,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        totalPaise: invoices.totalPaise,
        paidPaise: invoices.paidPaise,
        overdueAt: invoices.overdueAt,
        hasPdf: sql<boolean>`${invoices.snapshotJson} is not null`,
      })
      .from(invoices)
      .where(and(eq(invoices.companyId, companyId), eq(invoices.orgId, ctx.orgId), inArray(invoices.status, ["ISSUED", "PARTIALLY_PAID", "PAID"])))
      .orderBy(desc(invoices.issueDate)),
    db
      .select({ id: scopes.id, number: scopes.number, title: scopes.title, status: scopes.status, totalPaise: scopes.totalPaise, sentAt: scopes.sentAt, acceptedAt: scopes.acceptedAt, hasPdf: sql<boolean>`${scopes.snapshotJson} is not null` })
      .from(scopes)
      .innerJoin(deals, eq(deals.id, scopes.dealId))
      .where(and(eq(deals.companyId, companyId), eq(scopes.orgId, ctx.orgId), inArray(scopes.status, ["SENT", "ACCEPTED"])))
      .orderBy(desc(scopes.sentAt)),
    db
      .select({ id: questionnaires.id, title: questionnaires.title, token: questionnaires.token })
      .from(questionnaires)
      .where(and(eq(questionnaires.companyId, companyId), eq(questionnaires.orgId, ctx.orgId), eq(questionnaires.status, "OPEN"))),
  ]);

  const owed = invoiceRows.reduce((s, i) => (i.status === "PAID" ? s : s + (i.totalPaise - i.paidPaise)), 0);
  return ok({
    company,
    projects: projects.ok ? projects.data : [],
    review,
    invoices: invoiceRows.map((i) => ({ ...i, overdue: i.overdueAt !== null && i.status !== "PAID" })),
    owedPaise: owed,
    scopes: scopeRows,
    forms: forms.map((f) => ({ id: f.id, title: f.title, path: `/p/form/${f.token}` })),
  });
}

/** One of the client's projects: progress, tasks without budgets or names of who is doing them, and payment milestones. */
export async function getClientProject(db: Db, user: AuthedUser, projectId: string) {
  const companyId = user.links.companyId;
  if (user.role !== "CLIENT" || !companyId) return fail("NOT_FOUND", NO_CLIENT);
  const ctx = ctxOf(user);
  const project = await getProject(db, ctx, projectId);
  if (!project.ok || project.data.companyId !== companyId) return fail("NOT_FOUND", "Project not found");

  const [tasks, progress] = await Promise.all([
    db
      .select({
        id: projectTasks.id,
        title: projectTasks.title,
        description: projectTasks.description,
        status: projectTasks.status,
        priority: projectTasks.priority,
        dueDate: projectTasks.dueDate,
      })
      .from(projectTasks)
      .where(eq(projectTasks.projectId, projectId))
      .orderBy(asc(projectTasks.position), asc(projectTasks.createdAt)),
    listProjectProgress(db, ctx, { companyId }),
  ]);
  const p = project.data;
  return ok({
    id: p.id,
    name: p.name,
    status: p.status,
    startDate: p.startDate,
    dueDate: p.dueDate,
    progressPercent: progress.ok ? (progress.data.find((r) => r.id === projectId)?.progressPercent ?? 0) : 0,
    invoicedPaise: p.invoicedPaise,
    paidPaise: p.paidPaise,
    milestones: p.milestones.map((m) => ({ id: m.id, label: m.label, percent: m.percent, amountPaise: m.amountPaise, dueDate: m.dueDate, status: m.status })),
    tasks,
  });
}

/** The client approves work waiting for review, or sends it back for changes. */
export async function respondToTask(db: Db, user: AuthedUser, taskId: string, raw: unknown) {
  const companyId = user.links.companyId;
  if (user.role !== "CLIENT" || !companyId) return fail("NOT_FOUND", NO_CLIENT);
  const parsed = clientTaskResponseSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Choose approve or request changes");
  const ctx = ctxOf(user);
  const rows = await db
    .select({ id: projectTasks.id, status: projectTasks.status, projectId: projectTasks.projectId })
    .from(projectTasks)
    .innerJoin(deliveryProjects, eq(deliveryProjects.id, projectTasks.projectId))
    .where(and(eq(projectTasks.id, taskId), eq(deliveryProjects.companyId, companyId), eq(projectTasks.orgId, ctx.orgId)))
    .limit(1);
  const task = rows[0];
  if (!task) return fail("NOT_FOUND", "Task not found");
  if (task.status !== "CLIENT_REVIEW") return fail("CONFLICT", "This task is not waiting for your review");
  const decision = parsed.data.decision;
  const moved = await updateTask(db, ctx, taskId, { status: decision === "APPROVE" ? "COMPLETED" : "REVISION" });
  if (!moved.ok) return moved;
  await logActivity(
    { actorId: user.id, action: decision === "APPROVE" ? "task.client_approved" : "task.client_requested_changes", module: "projects", entityType: "task", entityId: taskId, metadata: { projectId: task.projectId } },
    db
  );
  return ok({ id: taskId, status: moved.data.status });
}

/** The client's own issued invoice, or null. Used before rendering a PDF. */
export async function clientOwnsInvoice(db: Db, user: AuthedUser, invoiceId: string) {
  const companyId = user.links.companyId;
  if (user.role !== "CLIENT" || !companyId) return false;
  const rows = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.companyId, companyId), eq(invoices.orgId, user.orgId), inArray(invoices.status, ["ISSUED", "PARTIALLY_PAID", "PAID"])))
    .limit(1);
  return rows.length > 0;
}

export async function clientOwnsScope(db: Db, user: AuthedUser, scopeId: string) {
  const companyId = user.links.companyId;
  if (user.role !== "CLIENT" || !companyId) return false;
  const rows = await db
    .select({ id: scopes.id })
    .from(scopes)
    .innerJoin(deals, eq(deals.id, scopes.dealId))
    .where(and(eq(scopes.id, scopeId), eq(deals.companyId, companyId), eq(scopes.orgId, user.orgId), inArray(scopes.status, ["SENT", "ACCEPTED"])))
    .limit(1);
  return rows.length > 0;
}

/* ------------------------------- freelancer -------------------------------- */

const taskColumns = {
  id: projectTasks.id,
  title: projectTasks.title,
  description: projectTasks.description,
  status: projectTasks.status,
  priority: projectTasks.priority,
  dueDate: projectTasks.dueDate,
  projectId: projectTasks.projectId,
  projectName: deliveryProjects.name,
};

const NO_FREELANCER = "No freelancer record is linked to this sign-in. Ask the team to link it.";

/** A freelancer's own profile, assignments, payouts and the tasks assigned to them. No budgets, no client details. */
export async function getFreelancerHome(db: Db, user: AuthedUser) {
  const freelancerId = user.links.freelancerId;
  if (user.role !== "FREELANCER" || !freelancerId) return fail("NOT_FOUND", NO_FREELANCER);
  const ctx = ctxOf(user);
  const team = await getFreelancerTeamView(db, ctx, freelancerId);
  if (!team.ok) return fail("NOT_FOUND", NO_FREELANCER);
  return ok({ ...team.data, today: todayIst(new Date()) });
}

/**
 * A freelancer moves one of their own tasks, or an agency moves or reassigns a task held by one of its freelancers.
 * Only a few statuses are open to them; finishing is for the team and the client.
 */
export async function updatePortalTask(db: Db, user: AuthedUser, taskId: string, raw: unknown) {
  const parsed = portalTaskUpdateSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid change");
  const ctx = ctxOf(user);

  let allowedAssignees: string[];
  if (user.role === "FREELANCER" && user.links.freelancerId) {
    allowedAssignees = [user.links.freelancerId];
    if (parsed.data.assigneeId) return fail("FORBIDDEN", "Only your agency can reassign tasks");
  } else if (user.role === "AGENCY" && user.links.agencyId) {
    const members = await db.select({ id: agencyFreelancers.freelancerId }).from(agencyFreelancers).where(eq(agencyFreelancers.agencyId, user.links.agencyId));
    allowedAssignees = members.map((m) => m.id);
  } else {
    return fail("FORBIDDEN", "You do not have access to this resource");
  }

  const rows = await db
    .select({ id: projectTasks.id, status: projectTasks.status, assigneeId: projectTasks.assigneeId })
    .from(projectTasks)
    .where(and(eq(projectTasks.id, taskId), eq(projectTasks.orgId, ctx.orgId)))
    .limit(1);
  const task = rows[0];
  // A task that is not theirs looks the same as one that does not exist.
  if (!task || !task.assigneeId || !allowedAssignees.includes(task.assigneeId)) return fail("NOT_FOUND", "Task not found");
  if (isDone(task.status)) return fail("CONFLICT", "This task is finished. The team changes finished tasks.");
  if (parsed.data.assigneeId && !allowedAssignees.includes(parsed.data.assigneeId)) return fail("FORBIDDEN", "You can only assign to freelancers in your agency");

  const changed = await updateTask(db, ctx, taskId, {
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    ...(parsed.data.assigneeId ? { assigneeId: parsed.data.assigneeId } : {}),
  });
  if (!changed.ok) return changed;
  return ok({ id: taskId, status: changed.data.status, assigneeId: changed.data.assigneeId });
}

/* --------------------------------- agency ---------------------------------- */

const NO_AGENCY = "No agency record is linked to this sign-in. Ask the team to link it.";

/** An agency's own freelancers, the work they hold, and what the agency has been paid and is owed. */
export async function getAgencyHome(db: Db, user: AuthedUser) {
  const agencyId = user.links.agencyId;
  if (user.role !== "AGENCY" || !agencyId) return fail("NOT_FOUND", NO_AGENCY);
  const ctx = ctxOf(user);
  const agency = (await db.select({ id: agencies.id, name: agencies.name }).from(agencies).where(and(eq(agencies.id, agencyId), eq(agencies.orgId, ctx.orgId))).limit(1))[0];
  if (!agency) return fail("NOT_FOUND", NO_AGENCY);

  const members = await db
    .select({ id: legacyFreelancers.id, name: legacyFreelancers.freelancer, skill: legacyFreelancers.skill, availability: legacyFreelancers.availability })
    .from(agencyFreelancers)
    .innerJoin(legacyFreelancers, eq(legacyFreelancers.id, agencyFreelancers.freelancerId))
    .where(eq(agencyFreelancers.agencyId, agencyId))
    .orderBy(asc(legacyFreelancers.freelancer));
  const memberIds = members.map((m) => m.id);
  if (memberIds.length === 0) return ok({ agency, members: [], tasks: [], pendingPaise: 0, paidPaise: 0, today: todayIst(new Date()) });

  const [tasks, pay] = await Promise.all([
    db
      .select({ ...taskColumns, assigneeId: projectTasks.assigneeId })
      .from(projectTasks)
      .innerJoin(deliveryProjects, eq(deliveryProjects.id, projectTasks.projectId))
      .where(and(inArray(projectTasks.assigneeId, memberIds), eq(projectTasks.orgId, ctx.orgId)))
      .orderBy(asc(projectTasks.dueDate), asc(projectTasks.createdAt)),
    db
      .select({ status: payouts.status, total: sql<number>`COALESCE(SUM(${payouts.amountPaise}), 0)` })
      .from(payouts)
      .where(and(inArray(payouts.freelancerId, memberIds), eq(payouts.orgId, ctx.orgId)))
      .groupBy(payouts.status),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const total = (status: string) => Number(pay.find((p) => p.status === status)?.total ?? 0);
  return ok({
    agency,
    members: members.map((m) => ({ ...m, openTasks: tasks.filter((t) => t.assigneeId === m.id && !isDone(t.status)).length })),
    tasks: tasks.map((t) => ({ ...t, assigneeName: t.assigneeId ? (names.get(t.assigneeId) ?? null) : null })),
    pendingPaise: total("PENDING"),
    paidPaise: total("PAID"),
    today: todayIst(new Date()),
  });
}
