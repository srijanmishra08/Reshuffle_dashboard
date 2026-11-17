import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import type { AuthedUser } from "@/server/session-user";
import { DEMO_IDS, DEMO_ORG, formatPreviewChoice, isPreviewRole, parsePreviewChoice, previewUser } from "@/server/preview";
import { createCompany, listCompanies } from "../companies";
import { demoStatus, removeDemo, seedDemo } from "../demo";
import { getClientHub } from "../hub";
import { receivables } from "../invoices";
import { getOverview } from "../overview";
import { createProject, listProjectProgress } from "../project-tasks";
import { getAgencyHome, getClientHome, getFreelancerHome, getClientProject, respondToTask, updatePortalTask } from "../portal";

const real = { orgId: "default", userId: "admin-1" };
const admin: AuthedUser = { id: "admin-1", email: "admin@example.test", name: "Admin", role: "ADMIN", orgId: "default", links: { companyId: null, freelancerId: null, agencyId: null } };
const now = new Date("2026-11-17T06:00:00Z");
let db: Db;
let cleanup: () => void;
let realCompanyId: string;

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  realCompanyId = must(await createCompany(db, real, { name: "Real Client Co" })).id;
  must(await createProject(db, real, { companyId: realCompanyId, name: "Real project" }));
  await db.insert(schema.legacyFreelancers).values({ id: "real-fl", freelancer: "Real Freelancer" });
});
afterAll(() => cleanup());

describe("preview user", () => {
  it("acts as the chosen role on the demo records only", () => {
    expect(previewUser(admin, "CLIENT")).toMatchObject({ role: "CLIENT", orgId: DEMO_ORG, previewing: true, links: { companyId: DEMO_IDS.company, freelancerId: null, agencyId: null } });
    expect(previewUser(admin, "FREELANCER").links.freelancerId).toBe(DEMO_IDS.freelancer);
    expect(previewUser(admin, "AGENCY").links.agencyId).toBe(DEMO_IDS.agency);
    expect(previewUser(admin, "CLIENT").id).toBe(admin.id);
    expect(isPreviewRole("CLIENT") && isPreviewRole("FREELANCER") && isPreviewRole("AGENCY")).toBe(true);
    expect(isPreviewRole("ADMIN") || isPreviewRole("MANAGER") || isPreviewRole(undefined)).toBe(false);
  });
});

describe("preview of a real record", () => {
  it("reads and writes the cookie value", () => {
    expect(parsePreviewChoice("CLIENT")).toEqual({ role: "CLIENT", recordId: null });
    expect(parsePreviewChoice("CLIENT:abc123")).toEqual({ role: "CLIENT", recordId: "abc123" });
    expect(parsePreviewChoice("AGENCY:a:b")).toEqual({ role: "AGENCY", recordId: "a:b" });
    for (const bad of ["ADMIN", "ADMIN:x", "CLIENT:", "client", "", undefined, null, 5, `CLIENT:${"x".repeat(101)}`]) expect(parsePreviewChoice(bad), String(bad)).toBeNull();
    expect(formatPreviewChoice({ role: "CLIENT", recordId: null })).toBe("CLIENT");
    expect(formatPreviewChoice({ role: "FREELANCER", recordId: "f1" })).toBe("FREELANCER:f1");
  });

  it("acts as the real record in the real organisation, read-only", () => {
    const u = previewUser(admin, { role: "CLIENT", recordId: "real-company" });
    expect(u).toMatchObject({ role: "CLIENT", orgId: "default", previewing: true, previewReadOnly: true, links: { companyId: "real-company", freelancerId: null, agencyId: null } });
    expect(previewUser(admin, { role: "AGENCY", recordId: "ag" }).links.agencyId).toBe("ag");
    // The demo preview stays writable and in its own organisation.
    expect(previewUser(admin, "CLIENT").orgId).toBe(DEMO_ORG);
    expect(previewUser(admin, "CLIENT").previewReadOnly).toBeUndefined();
  });
});

describe("demo data", () => {
  it("is not there until set up, and setting it up twice changes nothing", async () => {
    expect(must(await demoStatus(db)).seeded).toBe(false);
    expect(must(await seedDemo(db, admin.id, now)).created).toBe(true);
    expect(must(await demoStatus(db)).seeded).toBe(true);
    expect(must(await seedDemo(db, admin.id, now)).created).toBe(false);
    expect(await db.select().from(schema.projectTasks).where(eq(schema.projectTasks.orgId, DEMO_ORG))).toHaveLength(8);
  });

  it("fills the client portal, without PDF links for demo invoices", async () => {
    const home = must(await getClientHome(db, previewUser(admin, "CLIENT")));
    expect(home.company.name).toBe("Demo Client (test)");
    expect(home.projects.map((p) => p.name)).toEqual(["Demo website build (test)"]);
    expect(home.review).toHaveLength(2);
    expect(home.invoices).toHaveLength(2);
    expect(home.invoices.every((i) => i.hasPdf === false)).toBe(true);
    expect(home.invoices.some((i) => i.overdue)).toBe(true);
    expect(home.scopes).toHaveLength(1);
    expect(home.forms).toHaveLength(1);
    const project = must(await getClientProject(db, previewUser(admin, "CLIENT"), DEMO_IDS.project));
    expect(project.tasks).toHaveLength(8);
    expect(project.milestones).toHaveLength(3);
  });

  it("fills the freelancer and agency portals", async () => {
    const me = must(await getFreelancerHome(db, previewUser(admin, "FREELANCER")));
    expect(me.freelancer.name).toBe("Demo Freelancer (test)");
    expect(me.tasks.length).toBeGreaterThan(3);
    expect(me.pendingPaise).toBe(12_000_00);
    expect(me.paidPaise).toBe(8_000_00);
    const agency = must(await getAgencyHome(db, previewUser(admin, "AGENCY")));
    expect(agency.members).toHaveLength(2);
    expect(agency.tasks).toHaveLength(8 - 0);
    expect(agency.pendingPaise).toBe(21_000_00);
  });

  it("lets the preview change demo records only", async () => {
    const client = previewUser(admin, "CLIENT");
    const review = must(await getClientHome(db, client)).review[0];
    expect(must(await respondToTask(db, client, review.id, { decision: "APPROVE" })).status).toBe("COMPLETED");
    const me = previewUser(admin, "FREELANCER");
    const todo = must(await getFreelancerHome(db, me)).tasks.find((t) => t.status === "REVISION")!;
    expect(must(await updatePortalTask(db, me, todo.id, { status: "IN_PROGRESS" })).status).toBe("IN_PROGRESS");
  });

  it("never shows up in real figures or lists", async () => {
    expect(must(await listCompanies(db, real, {})).map((c) => c.name)).toEqual(["Real Client Co"]);
    expect(must(await listProjectProgress(db, real, {})).map((p) => p.name)).toEqual(["Real project"]);
    expect((await receivables(db, "default")).outstandingPaise).toBe(0);
    const o = must(await getOverview(db, real, now));
    expect(o.clients.active).toBe(0);
    expect(o.pipeline.openCount).toBe(0);
    expect((await getClientHub(db, real, DEMO_IDS.company, { includeMoney: true })).ok).toBe(false);
  });

  it("is removed completely, leaving real records alone", async () => {
    must(await removeDemo(db, admin.id));
    expect(must(await demoStatus(db)).seeded).toBe(false);
    for (const table of [schema.companies, schema.deliveryProjects, schema.projectTasks, schema.invoices, schema.scopes, schema.deals, schema.questionnaires, schema.payouts, schema.freelancerAssignments, schema.agencies]) {
      const rows = (await db.select().from(table)) as { orgId: string }[];
      expect(rows.filter((r) => r.orgId === DEMO_ORG), String(table)).toHaveLength(0);
    }
    expect((await db.select().from(schema.agencyFreelancers)).filter((r) => r.orgId === DEMO_ORG)).toHaveLength(0);
    expect((await db.select().from(schema.legacyFreelancers)).map((f) => f.id)).toEqual(["real-fl"]);
    expect(must(await listCompanies(db, real, {})).map((c) => c.name)).toEqual(["Real Client Co"]);
    expect(must(await listProjectProgress(db, real, {})).map((p) => p.name)).toEqual(["Real project"]);
  });

  it("can be set up again after removal", async () => {
    expect(must(await seedDemo(db, admin.id, now)).created).toBe(true);
    expect(must(await demoStatus(db)).seeded).toBe(true);
  });
});
