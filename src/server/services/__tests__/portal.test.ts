import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import type { AuthedUser } from "@/server/session-user";
import { createCompany } from "../companies";
import { createDeal } from "../deals";
import { createProject, createTask } from "../project-tasks";
import {
  clientOwnsInvoice,
  clientOwnsScope,
  getAgencyHome,
  getClientHome,
  getClientProject,
  getFreelancerHome,
  respondToTask,
  updatePortalTask,
} from "../portal";

const ctx = { orgId: "default", userId: "staff-1" };
let db: Db;
let cleanup: () => void;
let companyA: string;
let companyB: string;
let projectA: string;
let projectB: string;
let invoiceA: string;
let draftInvoiceA: string;
let invoiceB: string;
let scopeA: string;
let draftScopeA: string;
const tasks: Record<string, string> = {};

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

const user = (role: AuthedUser["role"], links: Partial<AuthedUser["links"]> = {}): AuthedUser => ({
  id: `user-${role}`,
  email: `${role.toLowerCase()}@example.test`,
  name: role,
  role,
  orgId: "default",
  links: { companyId: null, freelancerId: null, agencyId: null, ...links },
});

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  companyA = must(await createCompany(db, ctx, { name: "Fake Traders" })).id;
  companyB = must(await createCompany(db, ctx, { name: "Other Dairy" })).id;
  projectA = must(await createProject(db, ctx, { companyId: companyA, name: "Alpha build", budgetPaise: 90_000_00 })).id;
  projectB = must(await createProject(db, ctx, { companyId: companyB, name: "Beta build" })).id;

  await db.insert(schema.legacyFreelancers).values([
    { id: "fl-1", freelancer: "Free One", skill: "Design" },
    { id: "fl-2", freelancer: "Free Two", skill: "Code" },
    { id: "fl-3", freelancer: "Free Three", skill: "Copy" },
  ]);

  const t = async (key: string, projectId: string, body: Record<string, unknown>) => {
    tasks[key] = must(await createTask(db, ctx, projectId, { budgetPaise: 5_000_00, ...body })).id;
  };
  await t("review", projectA, { title: "Logo", status: "CLIENT_REVIEW", assigneeId: "fl-1" });
  await t("review2", projectA, { title: "Site", status: "CLIENT_REVIEW", assigneeId: "fl-1" });
  await t("todo", projectA, { title: "Copy", status: "TODO", assigneeId: "fl-1" });
  await t("done", projectA, { title: "Brief", status: "COMPLETED", assigneeId: "fl-1" });
  await t("two", projectA, { title: "API", status: "TODO", assigneeId: "fl-2" });
  await t("three", projectB, { title: "Outside", status: "TODO", assigneeId: "fl-3" });
  await t("reviewB", projectB, { title: "Other review", status: "CLIENT_REVIEW" });

  const invoice = async (companyId: string, status: string, number: string | null, total: number, paid: number) =>
    (await db.insert(schema.invoices).values({ orgId: "default", companyId, status, number, issueDate: "2026-11-01", dueDate: "2026-11-15", totalPaise: total, paidPaise: paid }).returning({ id: schema.invoices.id }))[0].id;
  invoiceA = await invoice(companyA, "PARTIALLY_PAID", "RS/26-27/001", 100_000_00, 40_000_00);
  await invoice(companyA, "PAID", "RS/26-27/002", 20_000_00, 20_000_00);
  draftInvoiceA = await invoice(companyA, "DRAFT", null, 5_000_00, 0);
  await invoice(companyA, "CANCELLED", "RS/26-27/003", 7_000_00, 0);
  invoiceB = await invoice(companyB, "ISSUED", "RS/26-27/004", 50_000_00, 0);

  const dealA = must(await createDeal(db, ctx, { companyId: companyA, title: "Deal A" })).id;
  const dealB = must(await createDeal(db, ctx, { companyId: companyB, title: "Deal B" })).id;
  const scope = async (dealId: string, status: string, number: string | null, version = 1) =>
    (await db.insert(schema.scopes).values({ orgId: "default", dealId, version, title: `Scope ${status}`, status, number, totalPaise: 80_000_00 }).returning({ id: schema.scopes.id }))[0].id;
  scopeA = await scope(dealA, "SENT", "SC/26-27/001");
  draftScopeA = await scope(dealA, "DRAFT", null, 2);
  await scope(dealB, "SENT", "SC/26-27/002");

  await db.insert(schema.questionnaires).values([
    { orgId: "default", companyId: companyA, title: "Open form", questions: [], token: "a".repeat(32), status: "OPEN" },
    { orgId: "default", companyId: companyA, title: "Closed form", questions: [], token: "b".repeat(32), status: "CLOSED" },
    { orgId: "default", companyId: companyB, title: "Their form", questions: [], token: "c".repeat(32), status: "OPEN" },
  ]);

  await db.insert(schema.payouts).values([
    { orgId: "default", freelancerId: "fl-1", description: "Logo work", amountPaise: 10_000_00, status: "PENDING" },
    { orgId: "default", freelancerId: "fl-1", description: "Brief", amountPaise: 4_000_00, status: "PAID" },
    { orgId: "default", freelancerId: "fl-2", description: "API", amountPaise: 8_000_00, status: "PENDING" },
    { orgId: "default", freelancerId: "fl-3", description: "Copy", amountPaise: 3_000_00, status: "PAID" },
  ]);

  const [agency] = await db.insert(schema.agencies).values({ orgId: "default", name: "Fake Agency" }).returning();
  await db.insert(schema.agencyFreelancers).values([
    { agencyId: agency.id, freelancerId: "fl-1", orgId: "default" },
    { agencyId: agency.id, freelancerId: "fl-2", orgId: "default" },
  ]);
  tasks.agencyId = agency.id;
});
afterAll(() => cleanup());

describe("client portal", () => {
  it("shows only the client's own company", async () => {
    const home = must(await getClientHome(db, user("CLIENT", { companyId: companyA })));
    expect(home.company.name).toBe("Fake Traders");
    expect(home.projects.map((p) => p.name)).toEqual(["Alpha build"]);
    expect(home.review.map((r) => r.title).sort()).toEqual(["Logo", "Site"]);
    expect(home.invoices.map((i) => i.number).sort()).toEqual(["RS/26-27/001", "RS/26-27/002"]);
    expect(home.owedPaise).toBe(60_000_00);
    expect(home.scopes.map((s) => s.number)).toEqual(["SC/26-27/001"]);
    expect(home.forms).toEqual([{ id: expect.any(String), title: "Open form", path: `/p/form/${"a".repeat(32)}` }]);
    expect(JSON.stringify(home)).not.toContain("Other Dairy");
    expect(JSON.stringify(home)).not.toContain("Beta build");
  });

  it("refuses an account with no link or the wrong role", async () => {
    expect((await getClientHome(db, user("CLIENT"))).ok).toBe(false);
    expect((await getClientHome(db, user("FREELANCER", { companyId: companyA }))).ok).toBe(false);
    expect((await getClientHome(db, user("ADMIN", { companyId: companyA }))).ok).toBe(false);
    expect((await getClientHome(db, user("CLIENT", { companyId: "gone" }))).ok).toBe(false);
  });

  it("shows a project without budgets or who is doing each task, and refuses another client's project", async () => {
    const p = must(await getClientProject(db, user("CLIENT", { companyId: companyA }), projectA));
    expect(p.name).toBe("Alpha build");
    expect(p.tasks.length).toBe(5);
    expect(p.progressPercent).toBe(20);
    for (const task of p.tasks) {
      expect(Object.keys(task).sort()).toEqual(["description", "dueDate", "id", "priority", "status", "title"]);
    }
    expect((await getClientProject(db, user("CLIENT", { companyId: companyA }), projectB)).ok).toBe(false);
    expect((await getClientProject(db, user("CLIENT", { companyId: companyB }), projectA)).ok).toBe(false);
  });

  it("approves or sends back work waiting for review, and nothing else", async () => {
    const client = user("CLIENT", { companyId: companyA });
    expect(must(await respondToTask(db, client, tasks.review, { decision: "APPROVE" })).status).toBe("COMPLETED");
    expect(must(await respondToTask(db, client, tasks.review2, { decision: "REVISE" })).status).toBe("REVISION");
    expect((await respondToTask(db, client, tasks.review, { decision: "APPROVE" })).ok).toBe(false);
    expect((await respondToTask(db, client, tasks.todo, { decision: "APPROVE" })).ok).toBe(false);
    expect((await respondToTask(db, client, tasks.reviewB, { decision: "APPROVE" })).ok).toBe(false);
    expect((await respondToTask(db, client, tasks.todo, { decision: "MAYBE" })).ok).toBe(false);
    const other = must(await getClientProject(db, user("CLIENT", { companyId: companyB }), projectB));
    expect(other.tasks.find((x) => x.title === "Other review")?.status).toBe("CLIENT_REVIEW");
  });

  it("lets a client open only their own issued invoices and sent scopes", async () => {
    const client = user("CLIENT", { companyId: companyA });
    expect(await clientOwnsInvoice(db, client, invoiceA)).toBe(true);
    expect(await clientOwnsInvoice(db, client, invoiceB)).toBe(false);
    expect(await clientOwnsInvoice(db, client, draftInvoiceA)).toBe(false);
    expect(await clientOwnsInvoice(db, user("FREELANCER", { companyId: companyA }), invoiceA)).toBe(false);
    expect(await clientOwnsScope(db, client, scopeA)).toBe(true);
    expect(await clientOwnsScope(db, client, draftScopeA)).toBe(false);
    expect(await clientOwnsScope(db, user("CLIENT", { companyId: companyB }), scopeA)).toBe(false);
  });
});

describe("freelancer portal", () => {
  it("shows own tasks, assignments and payouts, without budgets", async () => {
    const home = must(await getFreelancerHome(db, user("FREELANCER", { freelancerId: "fl-1" })));
    expect(home.freelancer.name).toBe("Free One");
    expect(home.tasks.map((t) => t.title).sort()).toEqual(["Brief", "Copy", "Logo", "Site"]);
    for (const task of home.tasks) expect(task).not.toHaveProperty("budgetPaise");
    expect(home.pendingPaise).toBe(10_000_00);
    expect(home.paidPaise).toBe(4_000_00);
    expect(JSON.stringify(home)).not.toContain("Free Two");
    expect(JSON.stringify(home)).not.toContain("Outside");
    expect((await getFreelancerHome(db, user("FREELANCER"))).ok).toBe(false);
    expect((await getFreelancerHome(db, user("CLIENT", { freelancerId: "fl-1" }))).ok).toBe(false);
  });

  it("moves own tasks between a few columns only", async () => {
    const f1 = user("FREELANCER", { freelancerId: "fl-1" });
    expect(must(await updatePortalTask(db, f1, tasks.todo, { status: "IN_PROGRESS" })).status).toBe("IN_PROGRESS");
    expect(must(await updatePortalTask(db, f1, tasks.todo, { status: "CLIENT_REVIEW" })).status).toBe("CLIENT_REVIEW");
    expect((await updatePortalTask(db, f1, tasks.todo, { status: "COMPLETED" })).ok).toBe(false);
    expect((await updatePortalTask(db, f1, tasks.todo, { status: "INVOICED" })).ok).toBe(false);
    expect((await updatePortalTask(db, f1, tasks.todo, {})).ok).toBe(false);
    expect((await updatePortalTask(db, f1, tasks.done, { status: "TODO" })).ok).toBe(false);
  });

  it("cannot touch another freelancer's task or reassign", async () => {
    const f1 = user("FREELANCER", { freelancerId: "fl-1" });
    expect((await updatePortalTask(db, f1, tasks.two, { status: "IN_PROGRESS" })).ok).toBe(false);
    expect((await updatePortalTask(db, f1, tasks.three, { status: "IN_PROGRESS" })).ok).toBe(false);
    expect((await updatePortalTask(db, f1, tasks.todo, { assigneeId: "fl-2" })).ok).toBe(false);
    expect((await updatePortalTask(db, user("CLIENT", { companyId: companyA }), tasks.todo, { status: "TODO" })).ok).toBe(false);
  });
});

describe("agency portal", () => {
  it("shows its own freelancers, their work and what they are owed", async () => {
    const home = must(await getAgencyHome(db, user("AGENCY", { agencyId: tasks.agencyId })));
    expect(home.agency.name).toBe("Fake Agency");
    expect(home.members.map((m) => m.name)).toEqual(["Free One", "Free Two"]);
    expect(home.members.find((m) => m.id === "fl-1")?.openTasks).toBe(2);
    expect(home.tasks.map((t) => t.title)).not.toContain("Outside");
    expect(home.pendingPaise).toBe(18_000_00);
    expect(home.paidPaise).toBe(4_000_00);
    expect((await getAgencyHome(db, user("AGENCY"))).ok).toBe(false);
    expect((await getAgencyHome(db, user("FREELANCER", { agencyId: tasks.agencyId }))).ok).toBe(false);
  });

  it("moves and reassigns tasks within the agency only", async () => {
    const agency = user("AGENCY", { agencyId: tasks.agencyId });
    expect(must(await updatePortalTask(db, agency, tasks.two, { status: "IN_PROGRESS" })).status).toBe("IN_PROGRESS");
    expect(must(await updatePortalTask(db, agency, tasks.two, { assigneeId: "fl-1" })).assigneeId).toBe("fl-1");
    expect((await updatePortalTask(db, agency, tasks.two, { assigneeId: "fl-3" })).ok).toBe(false);
    expect((await updatePortalTask(db, agency, tasks.three, { status: "IN_PROGRESS" })).ok).toBe(false);
    expect((await updatePortalTask(db, agency, tasks.done, { status: "TODO" })).ok).toBe(false);
  });
});
