import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createCompany } from "../companies";
import { createDeal } from "../deals";
import { getClientHub, getProjectHub } from "../hub";
import { createProject, createTask } from "../project-tasks";
import { globalSearch, listNotices } from "../search";
import { getOverview } from "../overview";
import { getFreelancerTeamView } from "../team";

const ctx = { orgId: "default", userId: "staff-1" };
const other = { orgId: "other", userId: "x" };
const now = new Date("2026-11-17T06:00:00Z");
let db: Db;
let cleanup: () => void;
let companyId: string;
let otherCompanyId: string;
let projectId: string;
let dealId: string;
let scopeId: string;

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  companyId = must(await createCompany(db, ctx, { name: "Fake Traders" })).id;
  otherCompanyId = must(await createCompany(db, ctx, { name: "Other Dairy" })).id;
  dealId = must(await createDeal(db, ctx, { companyId, title: "Website deal", valuePaise: 50_000_00 })).id;
  scopeId = (await db.insert(schema.scopes).values({ orgId: "default", dealId, title: "Website scope", status: "SENT", number: "SC/26-27/001", totalPaise: 50_000_00 }).returning({ id: schema.scopes.id }))[0].id;
  projectId = must(await createProject(db, ctx, { companyId, name: "Website build" })).id;
  await db.update(schema.deliveryProjects).set({ dealId, scopeId });
  await createProject(db, ctx, { companyId: otherCompanyId, name: "Dairy app" });

  await db.insert(schema.invoices).values([
    { orgId: "default", companyId, projectId, status: "ISSUED", number: "RS/26-27/001", totalPaise: 30_000_00, paidPaise: 10_000_00 },
    { orgId: "default", companyId, status: "DRAFT", totalPaise: 5_000_00 },
    { orgId: "default", companyId: otherCompanyId, status: "ISSUED", number: "RS/26-27/002", totalPaise: 9_000_00 },
  ]);
  await db.insert(schema.workOrders).values({ orgId: "default", companyId, projectId, status: "ISSUED", number: "WO/26-27/001" });
  await db.insert(schema.letters).values([
    { orgId: "default", companyId, status: "ISSUED", number: "RS/L/26-27/001", recipientName: "Fake Traders", subject: "Service Agreement: Website", body: "Terms" },
    { orgId: "default", companyId: otherCompanyId, status: "DRAFT", recipientName: "Other", subject: "Other letter", body: "x" },
  ]);
  const [form] = await db.insert(schema.questionnaires).values({ orgId: "default", companyId, title: "Onboarding form", questions: [], token: "t".repeat(32) }).returning();
  await db.insert(schema.questionnaireResponses).values([
    { orgId: "default", questionnaireId: form.id, questions: [], answers: {} },
    { orgId: "default", questionnaireId: form.id, questions: [], answers: {} },
  ]);
  await db.insert(schema.allowedEmails).values({ email: "client@example.test", orgId: "default", role: "CLIENT", companyId });

  await db.insert(schema.legacyFreelancers).values({ id: "fl-1", freelancer: "Free One" });
  await db.insert(schema.freelancerAssignments).values({ orgId: "default", freelancerId: "fl-1", projectId, role: "Designer", allocationPct: 60 });
  must(await createTask(db, ctx, projectId, { title: "Overdue design", status: "IN_PROGRESS", dueDate: "2026-11-10", assigneeId: "fl-1", budgetPaise: 5_000_00 }));
  must(await createTask(db, ctx, projectId, { title: "Logo for review", status: "CLIENT_REVIEW", assigneeId: "fl-1" }));
});
afterAll(() => cleanup());

describe("client hub", () => {
  it("lists the modules (SKUs) each deal needs", async () => {
    await db.insert(schema.modulesLibrary).values({ id: "hub-mod-1", orgId: "default", name: "Billing SKU", defaultPricePaise: 1_200_000 });
    const deal = must(await createDeal(db, ctx, { companyId: otherCompanyId, title: "Sku deal", moduleIds: ["hub-mod-1"] }));
    const hub = must(await getClientHub(db, ctx, otherCompanyId, { includeMoney: false }));
    const row = hub.deals.find((d) => d.id === deal.id);
    expect(row?.modules).toEqual([{ id: "hub-mod-1", name: "Billing SKU", pricePaise: 1_200_000 }]);
    expect(row?.valuePaise).toBe(1_200_000);
  });

  it("gathers everything for one client, and nothing from another", async () => {
    const hub = must(await getClientHub(db, ctx, companyId, { includeMoney: true, includeAccess: true }));
    expect(hub.company.name).toBe("Fake Traders");
    expect(hub.projects.map((p) => p.name)).toEqual(["Website build"]);
    expect(hub.deals.map((d) => d.title)).toEqual(["Website deal"]);
    expect(hub.scopes.map((s) => s.number)).toEqual(["SC/26-27/001"]);
    expect(hub.invoices).toHaveLength(2);
    expect(hub.workOrders.map((w) => w.number)).toEqual(["WO/26-27/001"]);
    expect(hub.letters.map((l) => l.subject)).toEqual(["Service Agreement: Website"]);
    expect(hub.forms).toEqual([expect.objectContaining({ title: "Onboarding form", responses: 2 })]);
    expect(hub.access).toEqual([{ email: "client@example.test", hasSignedIn: false }]);
    expect(hub.billedPaise).toBe(30_000_00);
    expect(hub.paidPaise).toBe(10_000_00);
    expect(JSON.stringify(hub)).not.toContain("Dairy app");
    expect(JSON.stringify(hub)).not.toContain("RS/26-27/002");
  });

  it("hides money from people who may not see it, and access from non-admins", async () => {
    const hub = must(await getClientHub(db, ctx, companyId, { includeMoney: false }));
    expect(hub.moneyHidden).toBe(true);
    expect(hub.accessHidden).toBe(true);
    expect(hub.invoices).toEqual([]);
    expect(hub.workOrders).toEqual([]);
    expect(hub.letters).toEqual([]);
    expect(hub.access).toEqual([]);
    expect(hub.billedPaise).toBe(0);
    expect(hub.deals).toHaveLength(1);
  });

  it("does not exist for another organisation", async () => {
    expect((await getClientHub(db, other, companyId, { includeMoney: true })).ok).toBe(false);
    expect((await getClientHub(db, ctx, "missing", { includeMoney: true })).ok).toBe(false);
  });
});

describe("project hub", () => {
  it("shows the deal, proposal, team, invoices and work orders of a project", async () => {
    const hub = must(await getProjectHub(db, ctx, projectId, { includeMoney: true }));
    expect(hub.project.companyName).toBe("Fake Traders");
    expect(hub.deal?.title).toBe("Website deal");
    expect(hub.scope?.number).toBe("SC/26-27/001");
    expect(hub.team).toEqual([expect.objectContaining({ name: "Free One", role: "Designer", allocationPct: 60 })]);
    expect(hub.invoices.map((i) => i.number)).toEqual(["RS/26-27/001"]);
    expect(hub.workOrders).toHaveLength(1);
    const hidden = must(await getProjectHub(db, ctx, projectId, { includeMoney: false }));
    expect(hidden.invoices).toEqual([]);
    expect(hidden.moneyHidden).toBe(true);
    expect((await getProjectHub(db, other, projectId, { includeMoney: true })).ok).toBe(false);
  });
});

describe("links across the system", () => {
  it("finds tasks, scopes and forms in search, scoped to the organisation", async () => {
    const hits = must(await globalSearch(db, ctx, "overdue", { includeBilling: true }));
    expect(hits.find((h) => h.type === "Task")).toMatchObject({ title: "Overdue design", href: `/projects/${projectId}` });
    expect(must(await globalSearch(db, ctx, "website scope")).find((h) => h.type === "Scope")?.href).toBe(`/sales/${dealId}/scopes/${scopeId}`);
    expect(must(await globalSearch(db, ctx, "onboarding")).find((h) => h.type === "Form")?.href).toMatch(/^\/questionnaires\//);
    expect(must(await globalSearch(db, other, "overdue")).filter((h) => h.type === "Task")).toEqual([]);
  });

  it("also finds work orders, letters, people, events and goals, with team records limited to admins and managers", async () => {
    await db.insert(schema.workOrders).values({ id: "wo-search", orgId: "default", companyId, status: "ISSUED", number: "WO/SEARCH/001" });
    await db.insert(schema.letters).values({ id: "lt-search", orgId: "default", status: "DRAFT", subject: "Zebra agreement", recipientName: "Zed Person" });
    await db.insert(schema.people).values({ id: "pp-search", orgId: "default", name: "Quincy Teammate", role: "Designer" });
    await db.insert(schema.events).values({ id: "ev-search", orgId: "default", name: "Quokka Workshop" });
    await db.insert(schema.goals).values({ id: "gl-search", orgId: "default", month: "2026-11", title: "Narwhal launch" });

    const all = async (q: string, billing: boolean) => must(await globalSearch(db, ctx, q, { includeBilling: billing }));
    expect((await all("WO/SEARCH", true)).find((h) => h.type === "Work order")?.href).toBe("/work-orders/wo-search");
    expect((await all("Zebra", true)).find((h) => h.type === "Letter")?.href).toBe("/letters/lt-search");
    expect((await all("Quincy", true)).find((h) => h.type === "Person")?.href).toBe("/people/pp-search");
    expect((await all("Quokka", false)).find((h) => h.type === "Event")?.href).toBe("/events");
    expect((await all("Narwhal", false)).find((h) => h.type === "Goal")?.href).toBe("/goals");

    for (const q of ["WO/SEARCH", "Zebra", "Quincy"]) expect(await all(q, false)).toEqual([]);
    expect(must(await globalSearch(db, other, "Quokka", { includeBilling: true }))).toEqual([]);
  });

  it("raises overdue tasks and work waiting on the client as notices", async () => {
    const notices = must(await listNotices(db, ctx, { includeBilling: true }, now));
    expect(notices.find((n) => n.kind === "Task overdue")?.title).toContain("Overdue design");
    expect(notices.find((n) => n.kind === "Waiting on client")?.title).toContain("Logo for review");
    expect(must(await listNotices(db, other, {}, now)).filter((n) => n.kind === "Task overdue")).toEqual([]);
  });

  it("counts overdue and in-review tasks in the overview", async () => {
    const o = must(await getOverview(db, ctx, now));
    expect(o.projects.tasksOverdue).toBe(1);
    expect(o.projects.inClientReview).toBe(1);
    expect(must(await getOverview(db, other, now)).projects.tasksOverdue).toBe(0);
  });

  it("lists a freelancer's tasks without budgets", async () => {
    const view = must(await getFreelancerTeamView(db, ctx, "fl-1"));
    expect(view.tasks.map((t) => t.title).sort()).toEqual(["Logo for review", "Overdue design"]);
    for (const task of view.tasks) expect(task).not.toHaveProperty("budgetPaise");
  });
});
