import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { fail, ok } from "@/server/lib/result";
import type { ServiceContext } from "@/server/services/companies";
import { listProjectProgress } from "@/server/services/project-tasks";

const {
  companies,
  deals,
  scopes,
  invoices,
  workOrders,
  letters,
  questionnaires,
  questionnaireResponses,
  allowedEmails,
  user,
  deliveryProjects,
  freelancerAssignments,
  legacyFreelancers,
  dealModules,
  modulesLibrary,
} = schema;

export type HubOptions = {
  /** Invoices, work orders and their totals. Admins and managers only. */
  includeMoney: boolean;
  /** Who can sign in to the portal for this client. Admins only. */
  includeAccess?: boolean;
};

/**
 * Everything the team knows about one client, gathered in one place: projects, deals, proposals,
 * invoices, work orders, forms and portal sign-ins. This is the client page's overview.
 */
export async function getClientHub(db: Db, ctx: ServiceContext, companyId: string, opts: HubOptions) {
  const company = (
    await db.select({ id: companies.id, name: companies.name }).from(companies).where(and(eq(companies.id, companyId), eq(companies.orgId, ctx.orgId))).limit(1)
  )[0];
  if (!company) return fail("NOT_FOUND", "Company not found");

  const [projects, dealRows, scopeRows, invoiceRows, workOrderRows, letterRows, formRows, accessRows] = await Promise.all([
    listProjectProgress(db, ctx, { companyId }),
    db
      .select({ id: deals.id, title: deals.title, stage: deals.stage, valuePaise: deals.valuePaise, expectedClose: deals.expectedClose })
      .from(deals)
      .where(and(eq(deals.companyId, companyId), eq(deals.orgId, ctx.orgId)))
      .orderBy(desc(deals.createdAt)),
    db
      .select({ id: scopes.id, dealId: scopes.dealId, number: scopes.number, title: scopes.title, status: scopes.status, version: scopes.version, totalPaise: scopes.totalPaise })
      .from(scopes)
      .innerJoin(deals, eq(deals.id, scopes.dealId))
      .where(and(eq(deals.companyId, companyId), eq(scopes.orgId, ctx.orgId), inArray(scopes.status, ["DRAFT", "SENT", "ACCEPTED"])))
      .orderBy(desc(scopes.createdAt)),
    opts.includeMoney
      ? db
          .select({
            id: invoices.id,
            number: invoices.number,
            status: invoices.status,
            issueDate: invoices.issueDate,
            dueDate: invoices.dueDate,
            totalPaise: invoices.totalPaise,
            paidPaise: invoices.paidPaise,
            projectId: invoices.projectId,
          })
          .from(invoices)
          .where(and(eq(invoices.companyId, companyId), eq(invoices.orgId, ctx.orgId)))
          .orderBy(desc(invoices.createdAt))
      : Promise.resolve([]),
    opts.includeMoney
      ? db
          .select({ id: workOrders.id, number: workOrders.number, status: workOrders.status, issueDate: workOrders.issueDate, projectId: workOrders.projectId })
          .from(workOrders)
          .where(and(eq(workOrders.companyId, companyId), eq(workOrders.orgId, ctx.orgId)))
          .orderBy(desc(workOrders.createdAt))
      : Promise.resolve([]),
    opts.includeMoney
      ? db
          .select({ id: letters.id, number: letters.number, subject: letters.subject, status: letters.status, issueDate: letters.issueDate })
          .from(letters)
          .where(and(eq(letters.companyId, companyId), eq(letters.orgId, ctx.orgId)))
          .orderBy(desc(letters.createdAt))
      : Promise.resolve([]),
    db
      .select({ id: questionnaires.id, title: questionnaires.title, status: questionnaires.status, responses: sql<number>`count(${questionnaireResponses.id})` })
      .from(questionnaires)
      .leftJoin(questionnaireResponses, eq(questionnaireResponses.questionnaireId, questionnaires.id))
      .where(and(eq(questionnaires.companyId, companyId), eq(questionnaires.orgId, ctx.orgId)))
      .groupBy(questionnaires.id)
      .orderBy(desc(questionnaires.createdAt)),
    opts.includeAccess
      ? db
          .select({ email: allowedEmails.email, signedInAs: user.id })
          .from(allowedEmails)
          .leftJoin(user, eq(user.email, allowedEmails.email))
          .where(and(eq(allowedEmails.companyId, companyId), eq(allowedEmails.orgId, ctx.orgId)))
          .orderBy(asc(allowedEmails.email))
      : Promise.resolve([]),
  ]);

  const dealModuleRows =
    dealRows.length === 0
      ? []
      : await db
          .select({ dealId: dealModules.dealId, id: modulesLibrary.id, name: modulesLibrary.name, pricePaise: modulesLibrary.defaultPricePaise })
          .from(dealModules)
          .innerJoin(modulesLibrary, eq(modulesLibrary.id, dealModules.moduleId))
          .where(inArray(dealModules.dealId, dealRows.map((d) => d.id)))
          .orderBy(asc(modulesLibrary.name));

  const billed = invoiceRows.filter((i) => i.status !== "DRAFT" && i.status !== "CANCELLED");
  return ok({
    company,
    projects: projects.ok ? projects.data : [],
    deals: dealRows.map((d) => ({ ...d, modules: dealModuleRows.filter((m) => m.dealId === d.id).map(({ id, name, pricePaise }) => ({ id, name, pricePaise })) })),
    scopes: scopeRows,
    invoices: invoiceRows,
    workOrders: workOrderRows,
    letters: letterRows,
    forms: formRows.map((f) => ({ ...f, responses: Number(f.responses) })),
    access: accessRows.map((a) => ({ email: a.email, hasSignedIn: a.signedInAs !== null })),
    moneyHidden: !opts.includeMoney,
    accessHidden: !opts.includeAccess,
    billedPaise: billed.reduce((s, i) => s + i.totalPaise, 0),
    paidPaise: billed.reduce((s, i) => s + i.paidPaise, 0),
  });
}

/** Where a project came from and what hangs off it: deal, proposal, team, invoices and work orders. */
export async function getProjectHub(db: Db, ctx: ServiceContext, projectId: string, opts: Pick<HubOptions, "includeMoney">) {
  const project = (
    await db
      .select({
        id: deliveryProjects.id,
        name: deliveryProjects.name,
        companyId: deliveryProjects.companyId,
        companyName: companies.name,
        dealId: deliveryProjects.dealId,
        scopeId: deliveryProjects.scopeId,
      })
      .from(deliveryProjects)
      .innerJoin(companies, eq(companies.id, deliveryProjects.companyId))
      .where(and(eq(deliveryProjects.id, projectId), eq(deliveryProjects.orgId, ctx.orgId)))
      .limit(1)
  )[0];
  if (!project) return fail("NOT_FOUND", "Project not found");

  const [deal, scope, team, invoiceRows, workOrderRows] = await Promise.all([
    project.dealId
      ? db.select({ id: deals.id, title: deals.title, stage: deals.stage }).from(deals).where(eq(deals.id, project.dealId)).limit(1)
      : Promise.resolve([]),
    project.scopeId
      ? db.select({ id: scopes.id, dealId: scopes.dealId, number: scopes.number, title: scopes.title, status: scopes.status }).from(scopes).where(eq(scopes.id, project.scopeId)).limit(1)
      : Promise.resolve([]),
    db
      .select({
        id: freelancerAssignments.id,
        freelancerId: legacyFreelancers.id,
        name: legacyFreelancers.freelancer,
        role: freelancerAssignments.role,
        allocationPct: freelancerAssignments.allocationPct,
        status: freelancerAssignments.status,
      })
      .from(freelancerAssignments)
      .innerJoin(legacyFreelancers, eq(legacyFreelancers.id, freelancerAssignments.freelancerId))
      .where(and(eq(freelancerAssignments.projectId, projectId), eq(freelancerAssignments.orgId, ctx.orgId)))
      .orderBy(asc(freelancerAssignments.status), asc(legacyFreelancers.freelancer)),
    opts.includeMoney
      ? db
          .select({ id: invoices.id, number: invoices.number, status: invoices.status, totalPaise: invoices.totalPaise, paidPaise: invoices.paidPaise })
          .from(invoices)
          .where(and(eq(invoices.projectId, projectId), eq(invoices.orgId, ctx.orgId)))
          .orderBy(desc(invoices.createdAt))
      : Promise.resolve([]),
    opts.includeMoney
      ? db
          .select({ id: workOrders.id, number: workOrders.number, status: workOrders.status })
          .from(workOrders)
          .where(and(eq(workOrders.projectId, projectId), eq(workOrders.orgId, ctx.orgId)))
          .orderBy(desc(workOrders.createdAt))
      : Promise.resolve([]),
  ]);

  return ok({
    project,
    deal: deal[0] ?? null,
    scope: scope[0] ?? null,
    team,
    invoices: invoiceRows,
    workOrders: workOrderRows,
    moneyHidden: !opts.includeMoney,
  });
}
