import { randomBytes } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { defaultQuestions } from "@/lib/schemas/questionnaires";
import { ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import { todayIst } from "@/server/services/invoices";
import { DEMO_IDS, DEMO_ORG } from "@/server/preview";

const {
  companies,
  legacyFreelancers,
  agencies,
  agencyFreelancers,
  deliveryProjects,
  projectMilestones,
  projectTasks,
  freelancerAssignments,
  payouts,
  invoices,
  deals,
  scopes,
  questionnaires,
} = schema;

/** `2026-11-17` plus `n` days. */
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whether the demo records exist. They live in their own organisation, apart from real data. */
async function isSeeded(db: Db) {
  const rows = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, DEMO_IDS.company)).limit(1);
  return rows.length > 0;
}

export async function demoStatus(db: Db) {
  return ok({ seeded: await isSeeded(db) });
}

/**
 * Creates a small, obviously fake client, project, team and billing history in the demo organisation so the
 * three portals have something to show. Safe to run twice. Real reports never see it, because every report
 * reads one organisation. The two demo freelancers do appear in the freelancer list, named "(test)".
 */
export async function seedDemo(db: Db, actorId: string, now = new Date()) {
  if (await isSeeded(db)) return ok({ seeded: true, created: false });
  const today = todayIst(now);
  const org = { orgId: DEMO_ORG };

  await db.insert(companies).values({ id: DEMO_IDS.company, ...org, name: "Demo Client (test)", lifecycle: "ACTIVE", source: "demo" });
  await db.insert(legacyFreelancers).values([
    { id: DEMO_IDS.freelancer, freelancer: "Demo Freelancer (test)", skill: "Design", availability: "Part time" },
    { id: DEMO_IDS.freelancer2, freelancer: "Demo Freelancer Two (test)", skill: "Development", availability: "Full time" },
  ]);
  await db.insert(agencies).values({ id: DEMO_IDS.agency, ...org, name: "Demo Agency (test)", contactName: "Demo Contact" });
  await db.insert(agencyFreelancers).values([
    { agencyId: DEMO_IDS.agency, freelancerId: DEMO_IDS.freelancer, ...org },
    { agencyId: DEMO_IDS.agency, freelancerId: DEMO_IDS.freelancer2, ...org },
  ]);
  await db.insert(deliveryProjects).values({
    id: DEMO_IDS.project,
    ...org,
    companyId: DEMO_IDS.company,
    name: "Demo website build (test)",
    status: "ACTIVE",
    budgetPaise: 150_000_00,
    startDate: addDays(today, -20),
    dueDate: addDays(today, 25),
  });
  await db.insert(projectMilestones).values([
    { projectId: DEMO_IDS.project, position: 0, label: "Advance", percent: 50, amountPaise: 75_000_00, dueDate: addDays(today, -20), status: "INVOICED", completedAt: now },
    { projectId: DEMO_IDS.project, position: 1, label: "First delivery", percent: 30, amountPaise: 45_000_00, dueDate: addDays(today, 5), status: "DONE", completedAt: now },
    { projectId: DEMO_IDS.project, position: 2, label: "Go live", percent: 20, amountPaise: 30_000_00, dueDate: addDays(today, 25), status: "PENDING" },
  ]);

  const f1 = DEMO_IDS.freelancer;
  const f2 = DEMO_IDS.freelancer2;
  const task = (title: string, status: string, priority: string, due: number | null, assigneeId: string | null, desc = "", budget = 0, position = 0) => ({
    ...org,
    projectId: DEMO_IDS.project,
    title,
    description: desc,
    status,
    priority,
    dueDate: due === null ? null : addDays(today, due),
    assigneeId,
    budgetPaise: budget,
    position,
    completedAt: status === "COMPLETED" || status === "INVOICED" ? now : null,
  });
  await db.insert(projectTasks).values([
    task("Gather requirements", "COMPLETED", "HIGH", -15, f1, "Kick-off call and notes.", 5_000_00),
    task("Wireframes", "COMPLETED", "HIGH", -8, f1, "Low-fidelity layouts for every page.", 8_000_00),
    task("Homepage design", "CLIENT_REVIEW", "HIGH", 2, f1, "Final homepage mockup, ready for your feedback.", 12_000_00),
    task("Logo refresh", "CLIENT_REVIEW", "MEDIUM", 3, f1, "Two logo options.", 6_000_00, 1),
    task("Contact form", "IN_PROGRESS", "MEDIUM", -2, f2, "Form that emails the team. Slightly late.", 9_000_00),
    task("Product pages", "IN_PROGRESS", "MEDIUM", 7, f2, "Template and first ten products.", 15_000_00, 1),
    task("Menu changes", "REVISION", "LOW", 4, f1, "Changes requested after the last review."),
    task("Launch checklist", "TODO", "NONE", 20, f2),
  ]);
  await db.insert(freelancerAssignments).values([
    { ...org, freelancerId: f1, projectId: DEMO_IDS.project, role: "Designer", allocationPct: 60, startDate: addDays(today, -20) },
    { ...org, freelancerId: f2, projectId: DEMO_IDS.project, role: "Developer", allocationPct: 50, startDate: addDays(today, -18) },
  ]);
  await db.insert(payouts).values([
    { ...org, freelancerId: f1, projectId: DEMO_IDS.project, description: "Wireframes", amountPaise: 8_000_00, status: "PAID", paidOn: addDays(today, -6) },
    { ...org, freelancerId: f1, projectId: DEMO_IDS.project, description: "Homepage design", amountPaise: 12_000_00, status: "PENDING", dueDate: addDays(today, 7) },
    { ...org, freelancerId: f2, projectId: DEMO_IDS.project, description: "Contact form", amountPaise: 9_000_00, status: "PENDING", dueDate: addDays(today, 10) },
  ]);

  // Demo invoices carry no frozen snapshot, so the portal shows no PDF link for them and no real
  // invoice number is used. They sit in the demo organisation, so receivables and GST reports ignore them.
  await db.insert(invoices).values([
    { ...org, companyId: DEMO_IDS.company, projectId: DEMO_IDS.project, status: "PAID", number: "DEMO/001", issueDate: addDays(today, -18), dueDate: addDays(today, -4), totalPaise: 88_500_00, paidPaise: 88_500_00 },
    { ...org, companyId: DEMO_IDS.company, projectId: DEMO_IDS.project, status: "PARTIALLY_PAID", number: "DEMO/002", issueDate: addDays(today, -10), dueDate: addDays(today, -3), totalPaise: 53_100_00, paidPaise: 20_000_00, overdueAt: now },
  ]);
  const [deal] = await db.insert(deals).values({ ...org, companyId: DEMO_IDS.company, title: "Demo website deal", stage: "WON", valuePaise: 150_000_00 }).returning({ id: deals.id });
  await db.insert(scopes).values({
    ...org,
    dealId: deal.id,
    title: "Demo website scope",
    status: "ACCEPTED",
    number: "DEMO/SC/001",
    totalPaise: 150_000_00,
    sentAt: now,
    acceptedAt: now,
    acceptedBy: "Demo Client",
  });
  await db.insert(questionnaires).values({
    ...org,
    companyId: DEMO_IDS.company,
    title: "Demo onboarding questions",
    description: "A few questions so we can get started.",
    questions: defaultQuestions(),
    token: randomBytes(24).toString("base64url"),
  });

  await logActivity({ actorId, action: "demo.seeded", module: "settings", entityType: "demo", entityId: DEMO_ORG }, db);
  return ok({ seeded: true, created: true });
}

/** Deletes everything seeded above, children first. Real records are never touched: every delete is limited to the demo organisation or demo ids. */
export async function removeDemo(db: Db, actorId: string) {
  await db.delete(payouts).where(eq(payouts.orgId, DEMO_ORG));
  await db.delete(freelancerAssignments).where(eq(freelancerAssignments.orgId, DEMO_ORG));
  await db.delete(agencyFreelancers).where(eq(agencyFreelancers.orgId, DEMO_ORG));
  await db.delete(projectTasks).where(eq(projectTasks.orgId, DEMO_ORG));
  await db.delete(invoices).where(eq(invoices.orgId, DEMO_ORG));
  await db.delete(scopes).where(eq(scopes.orgId, DEMO_ORG));
  await db.delete(deals).where(eq(deals.orgId, DEMO_ORG));
  await db.delete(questionnaires).where(eq(questionnaires.orgId, DEMO_ORG));
  await db.delete(deliveryProjects).where(eq(deliveryProjects.orgId, DEMO_ORG));
  await db.delete(companies).where(eq(companies.orgId, DEMO_ORG));
  await db.delete(agencies).where(eq(agencies.orgId, DEMO_ORG));
  await db.delete(legacyFreelancers).where(inArray(legacyFreelancers.id, [DEMO_IDS.freelancer, DEMO_IDS.freelancer2]));
  await logActivity({ actorId, action: "demo.removed", module: "settings", entityType: "demo", entityId: DEMO_ORG }, db);
  return ok({ seeded: false });
}
