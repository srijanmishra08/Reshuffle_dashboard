import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createCompany } from "../companies";
import { createPipelineItem, listPipelineItems } from "../pipeline-items";
import { createProject, listTasks } from "../project-tasks";
import { importLegacyOutreach, importLegacyTask } from "../legacy";

const ctx = { orgId: "default", userId: "staff-1" };
let db: Db;
let cleanup: () => void;
let projectId: string;

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

const card = (module: "projects" | "outreach", id: string, title: string, stage: string, extra: Record<string, string> = {}) =>
  createPipelineItem(module, { entityType: "x", entityId: id, title, stage, ...extra }, db);

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  const company = must(await createCompany(db, ctx, { name: "Fake Traders" }));
  projectId = must(await createProject(db, ctx, { companyId: company.id, name: "Alpha" })).id;
  await db.insert(schema.legacyFreelancers).values({ id: "fl-1", freelancer: "Free One" });
});
afterAll(() => cleanup());

describe("old task board", () => {
  it("moves a card onto a project, mapping stage and assignee, then removes it", async () => {
    await card("projects", "c1", "Build login", "BLOCKED", { assignee: "free one", subtitle: "Waiting for keys" });
    const res = must(await importLegacyTask(db, ctx, { cardId: "c1", projectId }));
    const tasks = must(await listTasks(db, ctx, projectId));
    const task = tasks.find((t) => t.id === res.taskId)!;
    expect(task).toMatchObject({ title: "Build login", status: "TODO", assigneeId: "fl-1" });
    expect(task.description).toContain("Waiting for keys");
    expect(task.description).toContain("Was blocked");
    expect((await listPipelineItems("projects", db)).map((c) => c.id)).not.toContain("c1");
  });

  it("maps done cards to completed and keeps an unknown assignee as a note", async () => {
    await card("projects", "c2", "Old job", "DONE", { assignee: "Someone Else" });
    const res = must(await importLegacyTask(db, ctx, { cardId: "c2", projectId }));
    const task = must(await listTasks(db, ctx, projectId)).find((t) => t.id === res.taskId)!;
    expect(task.status).toBe("COMPLETED");
    expect(task.assigneeId).toBeNull();
    expect(task.description).toContain("Someone Else");
  });

  it("refuses a missing card, a second import of the same card, a bad project or the wrong board", async () => {
    await card("projects", "c3", "Once only", "BACKLOG");
    must(await importLegacyTask(db, ctx, { cardId: "c3", projectId }));
    expect((await importLegacyTask(db, ctx, { cardId: "c3", projectId })).ok).toBe(false);
    expect((await importLegacyTask(db, ctx, { cardId: "nope", projectId })).ok).toBe(false);
    await card("projects", "c4", "Stays put", "BACKLOG");
    expect((await importLegacyTask(db, ctx, { cardId: "c4", projectId: "missing" })).ok).toBe(false);
    expect((await importLegacyTask(db, { orgId: "other", userId: "x" }, { cardId: "c4", projectId })).ok).toBe(false);
    expect((await importLegacyTask(db, ctx, { cardId: "c4" })).ok).toBe(false);
    expect((await listPipelineItems("projects", db)).map((c) => c.id)).toContain("c4");
    await card("outreach", "o9", "Wrong board", "NEW");
    expect((await importLegacyTask(db, ctx, { cardId: "o9", projectId })).ok).toBe(false);
  });
});

describe("old outreach board", () => {
  it("creates a client, a contact and a lead deal from a new card", async () => {
    await card("outreach", "o1", "Sample Bakery", "NEW", { phone: "9999900000", email: "baker@example.test", subtitle: "Asha" });
    const res = must(await importLegacyOutreach(db, ctx, { cardId: "o1" }));
    expect(res.reused).toBe(false);
    const company = (await db.select().from(schema.companies).where(eq(schema.companies.id, res.companyId)))[0];
    expect(company).toMatchObject({ name: "Sample Bakery", source: "Outreach board", lifecycle: "PROSPECT" });
    const contacts = await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, res.companyId));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ name: "Asha", phone: "9999900000", email: "baker@example.test" });
    const deal = (await db.select().from(schema.deals).where(eq(schema.deals.id, res.dealId!)))[0];
    expect(deal.stage).toBe("LEAD");
    expect((await listPipelineItems("outreach", db)).map((c) => c.id)).not.toContain("o1");
  });

  it("moves a follow-up lead to contacted, skips the deal for closed cards, and reuses an existing client", async () => {
    await card("outreach", "o2", "Follow Up Foods", "FOLLOW_UP");
    const open = must(await importLegacyOutreach(db, ctx, { cardId: "o2" }));
    expect((await db.select().from(schema.deals).where(eq(schema.deals.id, open.dealId!)))[0].stage).toBe("CONTACTED");

    await card("outreach", "o3", "Won Wares", "WON");
    expect(must(await importLegacyOutreach(db, ctx, { cardId: "o3" })).dealId).toBeNull();
    await card("outreach", "o4", "Lost Labs", "LOST");
    const lost = must(await importLegacyOutreach(db, ctx, { cardId: "o4" }));
    expect((await db.select().from(schema.companies).where(eq(schema.companies.id, lost.companyId)))[0].lifecycle).toBe("CLOSED");

    await card("outreach", "o5", "follow up foods", "NEW", { phone: "8888800000" });
    const again = must(await importLegacyOutreach(db, ctx, { cardId: "o5" }));
    expect(again.reused).toBe(true);
    expect(again.companyId).toBe(open.companyId);
    expect(await db.select().from(schema.contacts).where(eq(schema.contacts.companyId, open.companyId))).toHaveLength(0);
  });

  it("refuses a missing card or one from the task board", async () => {
    expect((await importLegacyOutreach(db, ctx, { cardId: "ghost" })).ok).toBe(false);
    await card("projects", "p9", "Task card", "BACKLOG");
    expect((await importLegacyOutreach(db, ctx, { cardId: "p9" })).ok).toBe(false);
    expect((await importLegacyOutreach(db, ctx, {})).ok).toBe(false);
  });
});
