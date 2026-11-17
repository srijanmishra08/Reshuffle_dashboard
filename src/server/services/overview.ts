import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { ok } from "@/server/lib/result";
import type { ServiceContext } from "@/server/services/companies";
import { pipelineSummary } from "@/server/services/deals";
import { receivables, todayIst } from "@/server/services/invoices";
import { listDueFollowUps } from "@/server/services/interactions";
import { openDealStages } from "@/server/models/deals";

const { companies, deals, dealStageHistory, deliveryProjects, projectMilestones, projectTasks, ledgerEntries, meetings, activityLogs } =
  schema;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const num = (v: unknown) => Number(v ?? 0);

/** Everything the Overview page shows, in one call. All figures are scoped to the caller's organisation. */
export async function getOverview(db: Db, ctx: ServiceContext, now = new Date()) {
  const today = todayIst(now);
  const month = today.slice(0, 7);
  const monthStart = new Date(`${month}-01T00:00:00+05:30`);
  const weekAhead = new Date(now.getTime() + WEEK_MS);

  const [pipeline, money, activeClients, won, projectRows, lateMilestones, taskRows, ledger, followUps, upcoming, activity] =
    await Promise.all([
      pipelineSummary(db, ctx),
      receivables(db, ctx.orgId),
      db
        .select({ count: sql<number>`count(*)` })
        .from(companies)
        .where(
          and(
            eq(companies.orgId, ctx.orgId),
            isNull(companies.archivedAt),
            inArray(companies.lifecycle, ["ONBOARDING", "ACTIVE", "MAINTENANCE"])
          )
        ),
      db
        .select({ count: sql<number>`count(distinct ${deals.id})`, valuePaise: sql<number>`coalesce(sum(${deals.valuePaise}), 0)` })
        .from(dealStageHistory)
        .innerJoin(deals, eq(deals.id, dealStageHistory.dealId))
        .where(
          and(
            eq(dealStageHistory.orgId, ctx.orgId),
            eq(dealStageHistory.toStage, "WON"),
            eq(deals.stage, "WON"),
            gte(dealStageHistory.at, monthStart)
          )
        ),
      db
        .select({ status: deliveryProjects.status, count: sql<number>`count(*)` })
        .from(deliveryProjects)
        .where(eq(deliveryProjects.orgId, ctx.orgId))
        .groupBy(deliveryProjects.status),
      db
        .select({ count: sql<number>`count(distinct ${deliveryProjects.id})` })
        .from(projectMilestones)
        .innerJoin(deliveryProjects, eq(deliveryProjects.id, projectMilestones.projectId))
        .where(
          and(
            eq(deliveryProjects.orgId, ctx.orgId),
            inArray(deliveryProjects.status, ["PLANNED", "ACTIVE"]),
            eq(projectMilestones.status, "PENDING"),
            isNotNull(projectMilestones.dueDate),
            lt(projectMilestones.dueDate, today)
          )
        ),
      db
        .select({ status: projectTasks.status, overdue: sql<number>`count(*) filter (where ${projectTasks.dueDate} < ${today})`, count: sql<number>`count(*)` })
        .from(projectTasks)
        .innerJoin(deliveryProjects, eq(deliveryProjects.id, projectTasks.projectId))
        .where(and(eq(projectTasks.orgId, ctx.orgId), inArray(deliveryProjects.status, ["PLANNED", "ACTIVE"]), inArray(projectTasks.status, ["BACKLOG", "TODO", "IN_PROGRESS", "CLIENT_REVIEW", "REVISION"])))
        .groupBy(projectTasks.status),
      db
        .select({ kind: ledgerEntries.kind, total: sql<number>`coalesce(sum(${ledgerEntries.amountPaise}), 0)` })
        .from(ledgerEntries)
        .where(
          and(
            eq(ledgerEntries.orgId, ctx.orgId),
            gte(ledgerEntries.entryDate, `${month}-01`),
            lte(ledgerEntries.entryDate, `${month}-31`)
          )
        )
        .groupBy(ledgerEntries.kind),
      listDueFollowUps(db, ctx, weekAhead),
      db
        .select({ id: meetings.id, title: meetings.title, at: meetings.at, companyId: meetings.companyId, companyName: companies.name })
        .from(meetings)
        .leftJoin(companies, eq(companies.id, meetings.companyId))
        .where(and(eq(meetings.orgId, ctx.orgId), gte(meetings.at, now), lte(meetings.at, weekAhead)))
        .orderBy(asc(meetings.at))
        .limit(10),
      db
        .select({
          id: activityLogs.id,
          action: activityLogs.action,
          module: activityLogs.module,
          entityType: activityLogs.entityType,
          createdAt: activityLogs.createdAt,
        })
        .from(activityLogs)
        .orderBy(sql`${activityLogs.createdAt} desc`)
        .limit(12),
    ]);

  const stages = pipeline.ok ? pipeline.data : [];
  const open: readonly string[] = openDealStages;
  const openStages = stages.filter((s) => open.includes(s.stage));
  const closedWon = stages.find((s) => s.stage === "WON")?.count ?? 0;
  const closedLost = stages.find((s) => s.stage === "LOST")?.count ?? 0;
  const closed = closedWon + closedLost;
  const byStatus = new Map(projectRows.map((r) => [r.status, num(r.count)]));
  const byKind = new Map(ledger.map((r) => [r.kind, num(r.total)]));

  return ok({
    month,
    pipeline: {
      stages,
      openCount: openStages.reduce((s, x) => s + x.count, 0),
      openValuePaise: openStages.reduce((s, x) => s + x.valuePaise, 0),
      wonThisMonthCount: num(won[0]?.count),
      wonThisMonthPaise: num(won[0]?.valuePaise),
      /** Won as a share of all closed deals, 0-100, or null when nothing has closed yet. */
      winRatePercent: closed === 0 ? null : Math.round((closedWon / closed) * 100),
    },
    receivables: money,
    clients: { active: num(activeClients[0]?.count) },
    projects: {
      active: (byStatus.get("ACTIVE") ?? 0) + (byStatus.get("PLANNED") ?? 0),
      onHold: byStatus.get("ON_HOLD") ?? 0,
      atRisk: num(lateMilestones[0]?.count),
      tasksOverdue: taskRows.reduce((sum, r) => sum + num(r.overdue), 0),
      inClientReview: num(taskRows.find((r) => r.status === "CLIENT_REVIEW")?.count),
    },
    cash: {
      incomePaise: byKind.get("INCOME") ?? 0,
      expensePaise: byKind.get("EXPENSE") ?? 0,
    },
    followUps: followUps.ok ? followUps.data.slice(0, 10) : [],
    meetings: upcoming,
    activity,
  });
}

export type Overview = Extract<Awaited<ReturnType<typeof getOverview>>, { ok: true }>["data"];
