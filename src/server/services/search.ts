import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { ok } from "@/server/lib/result";
import type { ServiceContext } from "@/server/services/companies";
import { listDueFollowUps } from "@/server/services/interactions";
import { todayIst } from "@/server/services/invoices";

const {
  companies,
  contacts,
  deals,
  invoices,
  deliveryProjects,
  docs,
  legacyFreelancers,
  scopes,
  payouts,
  projectMilestones,
  projectTasks,
  questionnaires,
  workOrders,
  letters,
  people,
  events,
  goals,
} = schema;

export type SearchHit = { type: string; id: string; title: string; subtitle: string; href: string };

const PER_TYPE = 5;

/** Escape LIKE wildcards so a typed % or _ matches itself. */
export function likePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Case-insensitive substring search across the main records. Empty or one-character queries return nothing. */
export async function globalSearch(db: Db, ctx: ServiceContext, rawQuery: unknown, opts: { includeBilling?: boolean } = {}) {
  const query = typeof rawQuery === "string" ? rawQuery.trim().slice(0, 100) : "";
  if (query.length < 2) return ok([] as SearchHit[]);
  const p = likePattern(query);

  const [companyRows, contactRows, dealRows, invoiceRows, projectRows, docRows, freelancerRows, taskRows, scopeRows, formRows, workOrderRows, letterRows, peopleRows, eventRows, goalRows] = await Promise.all([
    db
      .select({ id: companies.id, name: companies.name, lifecycle: companies.lifecycle })
      .from(companies)
      .where(and(eq(companies.orgId, ctx.orgId), isNull(companies.archivedAt), ilike(companies.name, p)))
      .limit(PER_TYPE),
    db
      .select({ id: contacts.id, name: contacts.name, companyId: contacts.companyId, companyName: companies.name })
      .from(contacts)
      .innerJoin(companies, eq(companies.id, contacts.companyId))
      .where(
        and(
          eq(contacts.orgId, ctx.orgId),
          isNull(contacts.archivedAt),
          or(ilike(contacts.name, p), ilike(contacts.email, p), ilike(contacts.phone, p))
        )
      )
      .limit(PER_TYPE),
    db
      .select({ id: deals.id, title: deals.title, stage: deals.stage, companyName: companies.name })
      .from(deals)
      .innerJoin(companies, eq(companies.id, deals.companyId))
      .where(and(eq(deals.orgId, ctx.orgId), or(ilike(deals.title, p), ilike(companies.name, p))))
      .limit(PER_TYPE),
    opts.includeBilling
      ? db
          .select({ id: invoices.id, number: invoices.number, status: invoices.status, companyName: companies.name })
          .from(invoices)
          .innerJoin(companies, eq(companies.id, invoices.companyId))
          .where(and(eq(invoices.orgId, ctx.orgId), or(ilike(invoices.number, p), ilike(companies.name, p))))
          .orderBy(desc(invoices.createdAt))
          .limit(PER_TYPE)
      : Promise.resolve([]),
    db
      .select({ id: deliveryProjects.id, name: deliveryProjects.name, status: deliveryProjects.status })
      .from(deliveryProjects)
      .where(and(eq(deliveryProjects.orgId, ctx.orgId), ilike(deliveryProjects.name, p)))
      .limit(PER_TYPE),
    db
      .select({ id: docs.id, title: docs.title, type: docs.type })
      .from(docs)
      .where(and(eq(docs.orgId, ctx.orgId), ilike(docs.title, p)))
      .limit(PER_TYPE),
    db
      .select({ id: legacyFreelancers.id, name: legacyFreelancers.freelancer, skill: legacyFreelancers.skill })
      .from(legacyFreelancers)
      .where(or(ilike(legacyFreelancers.freelancer, p), ilike(legacyFreelancers.skill, p)))
      .limit(PER_TYPE),
    db
      .select({ id: projectTasks.id, title: projectTasks.title, status: projectTasks.status, projectId: projectTasks.projectId, projectName: deliveryProjects.name })
      .from(projectTasks)
      .innerJoin(deliveryProjects, eq(deliveryProjects.id, projectTasks.projectId))
      .where(and(eq(projectTasks.orgId, ctx.orgId), ilike(projectTasks.title, p)))
      .limit(PER_TYPE),
    db
      .select({ id: scopes.id, dealId: scopes.dealId, title: scopes.title, number: scopes.number, status: scopes.status })
      .from(scopes)
      .where(and(eq(scopes.orgId, ctx.orgId), or(ilike(scopes.title, p), ilike(scopes.number, p))))
      .limit(PER_TYPE),
    db
      .select({ id: questionnaires.id, title: questionnaires.title, status: questionnaires.status })
      .from(questionnaires)
      .where(and(eq(questionnaires.orgId, ctx.orgId), ilike(questionnaires.title, p)))
      .limit(PER_TYPE),
    // Work orders, letters and team records are for admins and managers only, like their pages.
    opts.includeBilling
      ? db
          .select({ id: workOrders.id, number: workOrders.number, status: workOrders.status, companyName: companies.name })
          .from(workOrders)
          .innerJoin(companies, eq(companies.id, workOrders.companyId))
          .where(and(eq(workOrders.orgId, ctx.orgId), or(ilike(workOrders.number, p), ilike(companies.name, p), ilike(workOrders.jobDetails, p))))
          .orderBy(desc(workOrders.createdAt))
          .limit(PER_TYPE)
      : Promise.resolve([]),
    opts.includeBilling
      ? db
          .select({ id: letters.id, number: letters.number, subject: letters.subject, recipientName: letters.recipientName, status: letters.status })
          .from(letters)
          .where(and(eq(letters.orgId, ctx.orgId), or(ilike(letters.number, p), ilike(letters.subject, p), ilike(letters.recipientName, p))))
          .orderBy(desc(letters.createdAt))
          .limit(PER_TYPE)
      : Promise.resolve([]),
    opts.includeBilling
      ? db
          .select({ id: people.id, name: people.name, role: people.role })
          .from(people)
          .where(and(eq(people.orgId, ctx.orgId), or(ilike(people.name, p), ilike(people.email, p))))
          .limit(PER_TYPE)
      : Promise.resolve([]),
    db
      .select({ id: events.id, name: events.name, status: events.status, date: events.date })
      .from(events)
      .where(and(eq(events.orgId, ctx.orgId), or(ilike(events.name, p), ilike(events.partner, p))))
      .limit(PER_TYPE),
    db
      .select({ id: goals.id, title: goals.title, status: goals.status, month: goals.month })
      .from(goals)
      .where(and(eq(goals.orgId, ctx.orgId), ilike(goals.title, p)))
      .limit(PER_TYPE),
  ]);

  const hits: SearchHit[] = [
    ...companyRows.map((r) => ({ type: "Client", id: r.id, title: r.name, subtitle: r.lifecycle, href: `/crm/${r.id}` })),
    ...contactRows.map((r) => ({ type: "Contact", id: r.id, title: r.name, subtitle: r.companyName, href: `/crm/${r.companyId}` })),
    ...dealRows.map((r) => ({ type: "Deal", id: r.id, title: r.title, subtitle: `${r.companyName} · ${r.stage}`, href: `/sales/${r.id}` })),
    ...invoiceRows.map((r) => ({
      type: "Invoice",
      id: r.id,
      title: r.number ?? "Draft invoice",
      subtitle: `${r.companyName} · ${r.status}`,
      href: `/invoices/${r.id}`,
    })),
    ...projectRows.map((r) => ({ type: "Project", id: r.id, title: r.name, subtitle: r.status, href: `/projects/${r.id}` })),
    ...docRows.map((r) => ({ type: "Doc", id: r.id, title: r.title, subtitle: r.type, href: `/docs?open=${r.id}` })),
    ...freelancerRows.map((r) => ({
      type: "Freelancer",
      id: r.id,
      title: r.name,
      subtitle: r.skill ?? "",
      href: `/freelancers/${r.id}`,
    })),
    ...taskRows.map((r) => ({
      type: "Task",
      id: r.id,
      title: r.title,
      subtitle: `${r.projectName} · ${r.status.replace("_", " ").toLowerCase()}`,
      href: `/projects/${r.projectId}`,
    })),
    ...scopeRows.map((r) => ({
      type: "Scope",
      id: r.id,
      title: r.title,
      subtitle: `${r.number ?? "Draft"} · ${r.status.toLowerCase()}`,
      href: `/sales/${r.dealId}/scopes/${r.id}`,
    })),
    ...formRows.map((r) => ({ type: "Form", id: r.id, title: r.title, subtitle: r.status.toLowerCase(), href: `/questionnaires/${r.id}` })),
    ...workOrderRows.map((r) => ({
      type: "Work order",
      id: r.id,
      title: r.number ?? "Draft work order",
      subtitle: `${r.companyName} · ${r.status.toLowerCase()}`,
      href: `/work-orders/${r.id}`,
    })),
    ...letterRows.map((r) => ({
      type: "Letter",
      id: r.id,
      title: r.subject || r.number || "Draft letter",
      subtitle: `${r.recipientName || "No recipient"} · ${r.status.toLowerCase()}`,
      href: `/letters/${r.id}`,
    })),
    ...peopleRows.map((r) => ({ type: "Person", id: r.id, title: r.name, subtitle: r.role, href: `/people/${r.id}` })),
    ...eventRows.map((r) => ({ type: "Event", id: r.id, title: r.name, subtitle: [r.date, r.status.toLowerCase()].filter(Boolean).join(" · "), href: "/events" })),
    ...goalRows.map((r) => ({ type: "Goal", id: r.id, title: r.title, subtitle: `${r.month} · ${r.status.toLowerCase().replace("_", " ")}`, href: "/goals" })),
  ];
  return ok(hits);
}

export type Notice = { id: string; kind: string; title: string; detail: string; href: string; tone: "warn" | "info" | "good" };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What needs attention today, computed from live records instead of a stored inbox:
 * overdue invoices, follow-ups due, scopes accepted in the last week, late milestones and payouts due.
 * Money items are left out for members.
 */
export async function listNotices(db: Db, ctx: ServiceContext, opts: { includeBilling?: boolean } = {}, now = new Date()) {
  const today = todayIst(now);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  const [overdue, followUps, accepted, lateMilestones, duePayouts, reviewTasks, lateTasks] = await Promise.all([
    opts.includeBilling
      ? db
          .select({ id: invoices.id, number: invoices.number, dueDate: invoices.dueDate, companyName: companies.name })
          .from(invoices)
          .innerJoin(companies, eq(companies.id, invoices.companyId))
          .where(
            and(eq(invoices.orgId, ctx.orgId), isNotNull(invoices.overdueAt), inArray(invoices.status, ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]))
          )
          .limit(20)
      : Promise.resolve([]),
    listDueFollowUps(db, ctx),
    db
      .select({ id: scopes.id, dealId: scopes.dealId, title: scopes.title, acceptedBy: scopes.acceptedBy, acceptedAt: scopes.acceptedAt })
      .from(scopes)
      .where(and(eq(scopes.orgId, ctx.orgId), eq(scopes.status, "ACCEPTED"), gte(scopes.acceptedAt, weekAgo)))
      .limit(20),
    db
      .select({ id: projectMilestones.id, label: projectMilestones.label, dueDate: projectMilestones.dueDate, projectId: deliveryProjects.id, projectName: deliveryProjects.name })
      .from(projectMilestones)
      .innerJoin(deliveryProjects, eq(deliveryProjects.id, projectMilestones.projectId))
      .where(
        and(
          eq(deliveryProjects.orgId, ctx.orgId),
          inArray(deliveryProjects.status, ["PLANNED", "ACTIVE"]),
          eq(projectMilestones.status, "PENDING"),
          isNotNull(projectMilestones.dueDate),
          lte(projectMilestones.dueDate, today)
        )
      )
      .limit(20),
    opts.includeBilling
      ? db
          .select({ id: payouts.id, freelancerId: payouts.freelancerId, name: legacyFreelancers.freelancer, dueDate: payouts.dueDate })
          .from(payouts)
          .innerJoin(legacyFreelancers, eq(legacyFreelancers.id, payouts.freelancerId))
          .where(and(eq(payouts.orgId, ctx.orgId), eq(payouts.status, "PENDING"), isNotNull(payouts.dueDate), lte(payouts.dueDate, today)))
          .limit(20)
      : Promise.resolve([]),
    db
      .select({ id: projectTasks.id, title: projectTasks.title, projectId: deliveryProjects.id, projectName: deliveryProjects.name })
      .from(projectTasks)
      .innerJoin(deliveryProjects, eq(deliveryProjects.id, projectTasks.projectId))
      .where(and(eq(projectTasks.orgId, ctx.orgId), eq(projectTasks.status, "CLIENT_REVIEW")))
      .limit(20),
    db
      .select({ id: projectTasks.id, title: projectTasks.title, dueDate: projectTasks.dueDate, projectId: deliveryProjects.id, projectName: deliveryProjects.name })
      .from(projectTasks)
      .innerJoin(deliveryProjects, eq(deliveryProjects.id, projectTasks.projectId))
      .where(
        and(
          eq(projectTasks.orgId, ctx.orgId),
          inArray(projectTasks.status, ["BACKLOG", "TODO", "IN_PROGRESS", "REVISION"]),
          isNotNull(projectTasks.dueDate),
          lt(projectTasks.dueDate, today)
        )
      )
      .limit(20),
  ]);

  const notices: Notice[] = [
    ...overdue.map((i) => ({
      id: `inv-${i.id}`,
      kind: "Invoice overdue",
      title: `${i.number ?? "Invoice"} · ${i.companyName}`,
      detail: i.dueDate ? `Due ${i.dueDate}` : "",
      href: `/invoices/${i.id}`,
      tone: "warn" as const,
    })),
    ...duePayouts.map((p) => ({
      id: `pay-${p.id}`,
      kind: "Payout due",
      title: p.name,
      detail: p.dueDate ? `Due ${p.dueDate}` : "",
      href: `/freelancers/${p.freelancerId}`,
      tone: "warn" as const,
    })),
    ...lateMilestones.map((m) => ({
      id: `ms-${m.id}`,
      kind: "Milestone due",
      title: `${m.projectName}: ${m.label}`,
      detail: m.dueDate ? `Due ${m.dueDate}` : "",
      href: `/projects/${m.projectId}`,
      tone: "warn" as const,
    })),
    ...lateTasks.map((t) => ({
      id: `task-${t.id}`,
      kind: "Task overdue",
      title: `${t.projectName}: ${t.title}`,
      detail: t.dueDate ? `Due ${t.dueDate}` : "",
      href: `/projects/${t.projectId}`,
      tone: "warn" as const,
    })),
    ...reviewTasks.map((t) => ({
      id: `review-${t.id}`,
      kind: "Waiting on client",
      title: `${t.projectName}: ${t.title}`,
      detail: "In client review",
      href: `/projects/${t.projectId}`,
      tone: "info" as const,
    })),
    ...(followUps.ok ? followUps.data : []).map((f) => ({
      id: `fu-${f.id}`,
      kind: "Follow-up",
      title: f.companyName,
      detail: f.nextAction ?? "",
      href: f.href,
      tone: "info" as const,
    })),
    ...accepted.map((s) => ({
      id: `sc-${s.id}`,
      kind: "Scope accepted",
      title: s.title,
      detail: s.acceptedBy ? `By ${s.acceptedBy}` : "",
      href: `/sales/${s.dealId}`,
      tone: "good" as const,
    })),
  ];
  return ok(notices);
}
