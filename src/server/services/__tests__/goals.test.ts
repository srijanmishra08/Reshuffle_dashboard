import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";
import { createGoal, deleteGoal, listGoals, updateGoal } from "../goals";

const ctx = { orgId: "default", userId: "user-1" };
const other = { orgId: "other", userId: "user-2" };
let db: Db;
let cleanup: () => void;

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(() => cleanup());

describe("goals", () => {
  it("validates month, title and date order", async () => {
    expect((await createGoal(db, ctx, { month: "2026-13", title: "x" })).ok).toBe(false);
    expect((await createGoal(db, ctx, { month: "2026-04", title: "" })).ok).toBe(false);
    expect(
      (await createGoal(db, ctx, { month: "2026-04", title: "x", startDate: "2026-04-20", dueDate: "2026-04-10" })).ok
    ).toBe(false);
  });

  it("creates with defaults, moves status, and filters", async () => {
    const g = must(await createGoal(db, ctx, { month: "2026-04", title: "Fake goal", team: "Sales" }));
    expect(g.status).toBe("TODO");
    expect(g.priority).toBe("MEDIUM");
    must(await createGoal(db, ctx, { month: "2026-05", title: "Later goal" }));

    const moved = must(await updateGoal(db, ctx, g.id, { status: "DONE" }));
    expect(moved.status).toBe("DONE");

    expect(must(await listGoals(db, ctx, { month: "2026-04" })).length).toBe(1);
    expect(must(await listGoals(db, ctx, { team: "Sales", status: "DONE" })).length).toBe(1);
    expect(must(await listGoals(db, ctx, { status: "TODO" })).length).toBe(1);
  });

  it("rejects a patch that makes dates inconsistent", async () => {
    const g = must(await createGoal(db, ctx, { month: "2026-06", title: "Dated", startDate: "2026-06-10", dueDate: "2026-06-20" }));
    expect((await updateGoal(db, ctx, g.id, { dueDate: "2026-06-01" })).ok).toBe(false);
    expect(must(await updateGoal(db, ctx, g.id, { dueDate: null })).dueDate).toBeNull();
  });

  it("isolates organisations", async () => {
    const g = must(await createGoal(db, ctx, { month: "2026-07", title: "Private" }));
    expect((await updateGoal(db, other, g.id, { status: "DONE" })).ok).toBe(false);
    expect((await deleteGoal(db, other, g.id)).ok).toBe(false);
    expect(must(await listGoals(db, other, {})).length).toBe(0);
    expect((await deleteGoal(db, ctx, g.id)).ok).toBe(true);
  });
});
