import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";
import { createFreelancer, deleteFreelancer, listFreelancers, updateFreelancer } from "@/server/services/freelancers";
import {
  createPipelineItem,
  deletePipelineItem,
  listPipelineItems,
  persistPipelineTransition,
  updatePipelineItem,
} from "@/server/services/pipeline-items";
import { createProject, listProjects } from "@/server/services/projects";
import { createSocialEntry, deleteSocialEntry, listSocialEntries, updateSocialEntry } from "@/server/services/social";
import { createTask, listTasks } from "@/server/services/tasks";
import { getRecentActivity } from "@/server/services/activity";

let db: Db;
let cleanup: () => void;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(() => cleanup());

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

describe("pipeline items", () => {
  it("lists empty boards without seeding demo cards", async () => {
    expect(await listPipelineItems("social", db)).toEqual([]);
    expect(await listPipelineItems("social", db)).toEqual([]);
  });

  it("creates with contact metadata, updates, and deletes", async () => {
    const created = await createPipelineItem(
      "outreach",
      { entityType: "deal", title: "Test Lead", stage: "NEW", phone: "+910000000000", email: "lead@example.test" },
      db
    );
    expect(created).toMatchObject({ title: "Test Lead", stage: "NEW", phone: "+910000000000" });

    const updated = await updatePipelineItem("outreach", created.id, { stage: "QUALIFIED", assignee: "A" }, db);
    expect(updated).toMatchObject({ stage: "QUALIFIED", assignee: "A", phone: "+910000000000" });

    const [listed] = await listPipelineItems("outreach", db);
    expect(listed).toMatchObject({ id: created.id, stage: "QUALIFIED", email: "lead@example.test" });

    expect(await deletePipelineItem("outreach", created.id, db)).toBe(true);
    expect(await deletePipelineItem("outreach", created.id, db)).toBe(false);
    expect(await updatePipelineItem("outreach", created.id, { stage: "NEW" }, db)).toBeNull();
  });

  it("a transition without a title keeps the existing title and subtitle", async () => {
    const created = await createPipelineItem(
      "projects",
      { entityType: "project", title: "Keep My Title", subtitle: "Keep sub", stage: "BACKLOG" },
      db
    );

    await persistPipelineTransition({ module: "projects", entityType: "project", entityId: created.id, to: "IN_PROGRESS" }, db);

    const item = (await listPipelineItems("projects", db)).find((i) => i.id === created.id);
    expect(item).toMatchObject({ title: "Keep My Title", subtitle: "Keep sub", stage: "IN_PROGRESS" });
  });

  it("a transition for an unknown entity creates the card", async () => {
    await persistPipelineTransition(
      { module: "events", entityType: "event", entityId: "ev-x", to: "PLANNED", title: "New Event" },
      db
    );
    expect(await listPipelineItems("events", db)).toEqual([
      { id: "ev-x", title: "New Event", subtitle: undefined, stage: "PLANNED", assignee: undefined, phone: undefined, email: undefined },
    ]);
  });
});

describe("freelancers", () => {
  it("lists empty without demo rows, then does CRUD", async () => {
    expect(await listFreelancers(db)).toEqual([]);

    const created = await createFreelancer(
      { freelancer: "Test Freelancer", skill: "Design", availability: "10h", project: "", utilization: "", payout: "", performance: "" },
      db
    );
    const updated = await updateFreelancer(created.id, { skill: "Video" }, db);
    expect(updated).toMatchObject({ freelancer: "Test Freelancer", skill: "Video" });
    expect(await listFreelancers(db)).toHaveLength(1);

    expect(await updateFreelancer("missing", { skill: "x" }, db)).toBeNull();
    expect(await deleteFreelancer(created.id, db)).toBe(true);
    expect(await deleteFreelancer(created.id, db)).toBe(false);
  });
});

describe("projects and tasks", () => {
  it("creates, validates and lists with joins", async () => {
    expect((await createProject(db, "u1", { clientId: "", name: "x" })).ok).toBe(false);

    const project = must(await createProject(db, "u1", { clientId: "legacy-client", name: "Test Project" }));
    expect(project.status).toBe("TODO");

    const task = must(await createTask(db, "u1", { projectId: project.id, title: "Test Task", priority: "HIGH" }));
    expect(task.priority).toBe("HIGH");

    expect(must(await listProjects(db)).map((p) => p.name)).toContain("Test Project");
    const listed = must(await listTasks(db)).find((t) => t.id === task.id);
    expect(listed?.project).toEqual({ id: project.id, name: "Test Project" });
  });

  it("writes the actor to the audit log", async () => {
    const activity = await getRecentActivity(50, db);
    expect(activity.some((a) => a.action === "task.created" && a.actorId === "u1")).toBe(true);
  });
});

describe("social entries", () => {
  const entry = { title: "Test Post", platform: "LinkedIn", date: "2026-12-01", status: "IDEA" };

  it("rejects invalid input", async () => {
    expect((await createSocialEntry(db, "u1", { ...entry, platform: "MySpace" })).ok).toBe(false);
    expect((await createSocialEntry(db, "u1", { ...entry, date: "01/12/2026" })).ok).toBe(false);
  });

  it("creates, updates, lists in date order, and deletes", async () => {
    const early = must(await createSocialEntry(db, "u1", { ...entry, date: "2026-11-01", title: "Early" }));
    const late = must(await createSocialEntry(db, "u1", entry));

    const patched = must(await updateSocialEntry(db, "u1", late.id, { status: "DRAFT", script: "hello" }));
    expect(patched).toMatchObject({ status: "DRAFT", script: "hello", title: "Test Post" });

    expect(must(await listSocialEntries(db)).map((i) => i.title)).toEqual(["Early", "Test Post"]);

    // empty patch returns the row; unknown id is not found
    expect(must(await updateSocialEntry(db, "u1", early.id, {})).title).toBe("Early");
    expect(await updateSocialEntry(db, "u1", "missing", { title: "x" })).toMatchObject({ ok: false, code: "NOT_FOUND" });

    must(await deleteSocialEntry(db, "u1", early.id));
    expect(await deleteSocialEntry(db, "u1", early.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});
