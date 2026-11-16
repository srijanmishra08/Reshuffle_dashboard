import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createCompany } from "../companies";
import { createProject, createTask, deleteTask, listProjectProgress, listTasks, updateTask } from "../project-tasks";

const ctx = { orgId: "default", userId: "user-1" };
const other = { orgId: "other", userId: "user-2" };
const now = new Date("2026-11-16T06:00:00Z");
let db: Db;
let cleanup: () => void;
let companyId: string;

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  companyId = must(await createCompany(db, ctx, { name: "Fake Traders" })).id;
});
afterAll(() => cleanup());

describe("project tasks", () => {
  it("creates a project for a client and rejects an unknown client or bad dates", async () => {
    const p = must(await createProject(db, ctx, { companyId, name: "Sample build", budgetPaise: 50_000_00 }));
    expect(p.status).toBe("ACTIVE");
    expect((await createProject(db, ctx, { companyId: "nope", name: "X" })).ok).toBe(false);
    expect((await createProject(db, other, { companyId, name: "X" })).ok).toBe(false);
    expect((await createProject(db, ctx, { companyId, name: "X", startDate: "2026-12-10", dueDate: "2026-12-01" })).ok).toBe(false);
  });

  it("adds tasks, moves them between columns and tracks completion", async () => {
    const p = must(await createProject(db, ctx, { companyId, name: "Board" }));
    const a = must(await createTask(db, ctx, p.id, { title: "Gather requirements" }));
    const b = must(await createTask(db, ctx, p.id, { title: "Wireframes", priority: "HIGH", dueDate: "2026-11-01" }));
    expect(a.status).toBe("TODO");
    expect([a.position, b.position]).toEqual([0, 1]);
    expect((await createTask(db, ctx, p.id, { title: "" })).ok).toBe(false);
    expect((await createTask(db, ctx, p.id, { title: "X", assigneeId: "nobody" })).ok).toBe(false);

    const moved = must(await updateTask(db, ctx, a.id, { status: "COMPLETED" }));
    expect(moved.completedAt).not.toBeNull();
    expect(moved.position).toBe(0);
    const back = must(await updateTask(db, ctx, a.id, { status: "REVISION" }));
    expect(back.completedAt).toBeNull();
    expect((await updateTask(db, ctx, a.id, { status: "NOT_A_COLUMN" })).ok).toBe(false);

    const tasks = must(await listTasks(db, ctx, p.id));
    expect(tasks).toHaveLength(2);
    must(await deleteTask(db, ctx, b.id));
    expect(must(await listTasks(db, ctx, p.id))).toHaveLength(1);
  });

  it("assigns a freelancer and shows the name", async () => {
    const [f] = await db.insert(schema.legacyFreelancers).values({ id: "fl-sample-1", freelancer: "Sample Freelancer" }).returning();
    const p = must(await createProject(db, ctx, { companyId, name: "Assigned" }));
    const t = must(await createTask(db, ctx, p.id, { title: "Design", assigneeId: f.id }));
    expect(must(await listTasks(db, ctx, p.id))[0].assigneeName).toBe("Sample Freelancer");
    must(await updateTask(db, ctx, t.id, { assigneeId: "" }));
    expect(must(await listTasks(db, ctx, p.id))[0].assigneeName).toBeNull();
  });

  it("reports progress, overdue tasks and overdue projects", async () => {
    const p = must(await createProject(db, ctx, { companyId, name: "Progress", dueDate: "2026-11-10" }));
    const empty = must(await listProjectProgress(db, ctx, { companyId }, now)).find((r) => r.id === p.id)!;
    expect(empty.progressPercent).toBe(0);
    expect(empty.overdue).toBe(true);

    must(await createTask(db, ctx, p.id, { title: "One", status: "COMPLETED" }));
    must(await createTask(db, ctx, p.id, { title: "Two", status: "INVOICED" }));
    must(await createTask(db, ctx, p.id, { title: "Three", status: "CLIENT_REVIEW", dueDate: "2026-11-15" }));
    must(await createTask(db, ctx, p.id, { title: "Four", status: "TODO", dueDate: "2026-11-16" }));
    const row = must(await listProjectProgress(db, ctx, {}, now)).find((r) => r.id === p.id)!;
    expect(row.tasksTotal).toBe(4);
    expect(row.tasksDone).toBe(2);
    expect(row.progressPercent).toBe(50);
    expect(row.tasksOverdue).toBe(1);
    expect(row.inReview).toBe(1);
    expect(row.companyName).toBe("Fake Traders");
  });

  it("falls back to milestones when a project has no tasks, and shows a completed project as 100%", async () => {
    const p = must(await createProject(db, ctx, { companyId, name: "Milestones" }));
    await db.insert(schema.projectMilestones).values([
      { projectId: p.id, label: "Advance", status: "DONE" },
      { projectId: p.id, label: "Final", status: "PENDING" },
    ]);
    let row = must(await listProjectProgress(db, ctx, {}, now)).find((r) => r.id === p.id)!;
    expect(row.progressPercent).toBe(50);
    await db.update(schema.deliveryProjects).set({ status: "COMPLETED" });
    row = must(await listProjectProgress(db, ctx, {}, now)).find((r) => r.id === p.id)!;
    expect(row.progressPercent).toBe(100);
    expect(row.overdue).toBe(false);
  });

  it("hides projects and tasks from another organisation", async () => {
    const p = must(await createProject(db, ctx, { companyId, name: "Private" }));
    const t = must(await createTask(db, ctx, p.id, { title: "Secret" }));
    expect((await listTasks(db, other, p.id)).ok).toBe(false);
    expect((await createTask(db, other, p.id, { title: "X" })).ok).toBe(false);
    expect((await updateTask(db, other, t.id, { title: "Hijack" })).ok).toBe(false);
    expect((await deleteTask(db, other, t.id)).ok).toBe(false);
    expect(must(await listProjectProgress(db, other, {}, now))).toHaveLength(0);
  });
});
