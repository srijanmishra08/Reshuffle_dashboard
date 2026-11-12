import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createCompany } from "@/server/services/companies";
import {
  cancelWorkOrder,
  completeWorkOrder,
  createWorkOrder,
  deleteDraftWorkOrder,
  getWorkOrderSnapshot,
  issueWorkOrder,
  listWorkOrders,
  updateWorkOrder,
} from "@/server/services/work-orders";

const ctx = { orgId: "default", userId: "user-1" };

let db: Db;
let cleanup: () => void;
let inState: string;
let outState: string;

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

const items = [
  { description: "Build module", quantity: 1, ratePaise: 50_000_00, taxable: true },
  { description: "Hosting pass-through", quantity: 1, ratePaise: 10_000_00, taxable: false },
];
let keySeq = 0;
const key = () => `wo-key-${++keySeq}-abcdefgh`;

const draft = async (companyId: string, extra: Record<string, unknown> = {}) =>
  must(
    await createWorkOrder(db, ctx, {
      companyId,
      requestedBy: "Test Requester",
      department: "Operations",
      jobDetails: "Build and deploy the module",
      items,
      ...extra,
    })
  );

const issued = async (companyId: string) => {
  const d = await draft(companyId);
  return must(await issueWorkOrder(db, ctx, d.id, { idempotencyKey: key(), issueDate: "2026-06-10" }));
};

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await db.insert(schema.orgSettings).values({
    orgId: "default",
    legalName: "Test Studio",
    stateCode: "22",
    gstin: "22AAAAA0000A1Z5",
  });
  inState = must(await createCompany(db, ctx, { name: "In State Co", gstin: "22BBBBB1111B1Z5", stateCode: "22" })).id;
  outState = must(await createCompany(db, ctx, { name: "Out State Co", gstin: "27CCCCC2222C1Z5", stateCode: "27" })).id;
});
afterAll(() => cleanup());

describe("work order drafts", () => {
  it("taxes only the taxable lines (CGST+SGST in state)", async () => {
    const wo = await draft(inState);
    expect(wo.status).toBe("DRAFT");
    expect(wo.number).toBeNull();
    expect(wo.subtotalPaise).toBe(60_000_00);
    expect(wo.cgstPaise).toBe(4_500_00);
    expect(wo.sgstPaise).toBe(4_500_00);
    expect(wo.totalPaise).toBe(69_000_00);
    expect(wo.requestedBy).toBe("Test Requester");
  });

  it("uses IGST out of state", async () => {
    const wo = await draft(outState);
    expect(wo.taxMode).toBe("INTER");
    expect(wo.igstPaise).toBe(9_000_00);
    expect(wo.cgstPaise).toBe(0);
  });

  it("edits a draft and recomputes", async () => {
    const wo = await draft(inState);
    const updated = must(
      await updateWorkOrder(db, ctx, wo.id, {
        department: "Finance",
        items: [{ description: "Single line", quantity: 3, ratePaise: 10_000_00, taxable: true }],
      })
    );
    expect(updated.department).toBe("Finance");
    expect(updated.items).toHaveLength(1);
    expect(updated.subtotalPaise).toBe(30_000_00);
    expect(updated.jobDetails).toBe("Build and deploy the module");
  });

  it("is scoped to its org and can be deleted while a draft", async () => {
    const wo = await draft(inState);
    const other = { orgId: "other", userId: "u2" };
    expect(await issueWorkOrder(db, other, wo.id, { idempotencyKey: key() })).toMatchObject({
      ok: false,
      code: "NOT_FOUND",
    });
    must(await deleteDraftWorkOrder(db, ctx, wo.id));
  });
});

describe("work order issuing", () => {
  it("issues consecutive WO numbers with a snapshot", async () => {
    const a = await issued(inState);
    const b = await issued(outState);
    expect(a.number).toMatch(/^WO\/26-27\/\d{3}$/);
    expect(Number(b.number!.slice(-3))).toBe(Number(a.number!.slice(-3)) + 1);

    const snap = must(await getWorkOrderSnapshot(db, ctx, a.id));
    expect(snap.number).toBe(a.number);
    expect(snap.department).toBe("Operations");
  });

  it("does not burn two numbers on a repeated issue with the same key", async () => {
    const d = await draft(inState);
    const k = key();
    const first = must(await issueWorkOrder(db, ctx, d.id, { idempotencyKey: k, issueDate: "2026-06-11" }));
    const second = must(await issueWorkOrder(db, ctx, d.id, { idempotencyKey: k, issueDate: "2026-06-11" }));
    expect(second.number).toBe(first.number);
    const next = await issued(inState);
    expect(Number(next.number!.slice(-3))).toBe(Number(first.number!.slice(-3)) + 1);
  });

  it("returns 409 for another key, and for edits or deletes after issue", async () => {
    const wo = await issued(inState);
    expect(await issueWorkOrder(db, ctx, wo.id, { idempotencyKey: key() })).toMatchObject({ code: "CONFLICT" });
    expect(await updateWorkOrder(db, ctx, wo.id, { comments: "x" })).toMatchObject({ code: "CONFLICT" });
    expect(await deleteDraftWorkOrder(db, ctx, wo.id)).toMatchObject({ code: "CONFLICT" });
  });
});

describe("work order lifecycle", () => {
  it("completes an issued work order and filters by status", async () => {
    const wo = await issued(inState);
    const done = must(await completeWorkOrder(db, ctx, wo.id, { completedDate: "2026-07-01", comments: "All done" }));
    expect(done.status).toBe("COMPLETED");
    expect(done.completedDate).toBe("2026-07-01");
    expect(done.comments).toBe("All done");

    const list = must(await listWorkOrders(db, ctx, { status: "COMPLETED" }));
    expect(list.map((w) => w.id)).toContain(wo.id);
    expect(await completeWorkOrder(db, ctx, wo.id)).toMatchObject({ code: "CONFLICT" });
  });

  it("cancels an issued work order but not a draft or a completed one", async () => {
    const wo = await issued(inState);
    const cancelled = must(await cancelWorkOrder(db, ctx, wo.id, { reason: "Client withdrew" }));
    expect(cancelled.status).toBe("CANCELLED");

    const d = await draft(inState);
    expect(await cancelWorkOrder(db, ctx, d.id, { reason: "No longer needed" })).toMatchObject({ code: "CONFLICT" });

    const finished = await issued(inState);
    must(await completeWorkOrder(db, ctx, finished.id));
    expect(await cancelWorkOrder(db, ctx, finished.id, { reason: "Too late now" })).toMatchObject({
      code: "CONFLICT",
    });
  });
});
