import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createCompany } from "../companies";
import { createDeal } from "../deals";
import {
  computeSchedule,
  createModule,
  createScope,
  deleteDraftScope,
  getScope,
  listModules,
  listScopes,
  reviseScope,
  sendScope,
  updateModule,
  updateScope,
} from "../scopes";

const ctx = { orgId: "default", userId: "user-1" };
let db: Db;
let cleanup: () => void;
let dealId: string;

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

const items = [
  { phase: "Phase 1", title: "Inventory module", days: 10, pricePaise: 5_000_000 },
  { phase: "Phase 2", title: "Billing module", days: 7, pricePaise: 3_333_333 },
];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await db.insert(schema.orgSettings).values({
    orgId: "default",
    legalName: "Test Studio",
    address: "1 Example Road",
    stateCode: "22",
    gstin: "22AAAAA0000A1Z5",
  });
  const companyId = must(await createCompany(db, ctx, { name: "Fake Dairy Co" })).id;
  dealId = must(await createDeal(db, ctx, { companyId, title: "Fake deal" })).id;
});
afterAll(() => cleanup());

describe("computeSchedule", () => {
  it("sums exactly to the total even when percentages do not divide evenly", () => {
    const steps = computeSchedule(8_333_333, [
      { label: "A", percent: 50 },
      { label: "B", percent: 30 },
      { label: "C", percent: 20 },
    ]);
    expect(steps.reduce((s, x) => s + x.amountPaise, 0)).toBe(8_333_333);
    expect(steps[0].amountPaise).toBe(4_166_666);
  });
});

describe("module library", () => {
  it("creates, updates and filters by active", async () => {
    const m = must(await createModule(db, ctx, { name: "Inventory", category: "Operations", defaultDays: 5, defaultPricePaise: 100000 }));
    expect(m.active).toBe(true);
    must(await updateModule(db, ctx, m.id, { active: false }));
    expect(must(await listModules(db, ctx, { activeOnly: true }))).toHaveLength(0);
    expect(must(await listModules(db, ctx))).toHaveLength(1);
    expect((await updateModule(db, ctx, "missing", { name: "x" })).ok).toBe(false);
  });
});

describe("scopes", () => {
  it("rejects bad input, unknown deals and unknown modules", async () => {
    expect((await createScope(db, ctx, { dealId, title: "" })).ok).toBe(false);
    expect((await createScope(db, ctx, { dealId: "nope", title: "X" })).ok).toBe(false);
    expect(
      (await createScope(db, ctx, { dealId, title: "X", items: [{ title: "Y", moduleId: "nope" }] })).ok
    ).toBe(false);
    const badSchedule = await createScope(db, ctx, { dealId, title: "X", paymentSchedule: [{ label: "A", percent: 60 }] });
    expect(badSchedule.ok).toBe(false);
  });

  it("computes totals, edits drafts, then freezes on send", async () => {
    const draft = must(await createScope(db, ctx, { dealId, title: "Scope v1", items }));
    expect(draft.version).toBe(1);
    expect(draft.totalPaise).toBe(8_333_333);
    expect(draft.timelineDays).toBe(17);
    expect(draft.paymentSchedule.reduce((s, x) => s + x.amountPaise, 0)).toBe(8_333_333);

    const edited = must(await updateScope(db, ctx, draft.id, { items: [items[0]] }));
    expect(edited.totalPaise).toBe(5_000_000);
    expect(edited.items).toHaveLength(1);

    const sent = must(await sendScope(db, ctx, draft.id, { idempotencyKey: "send-key-1" }));
    expect(sent.status).toBe("SENT");
    expect(sent.number).toMatch(/^SC\/\d{2}-\d{2}\/\d{3}$/);
    expect(sent.isFrozen).toBe(true);

    const retry = must(await sendScope(db, ctx, draft.id, { idempotencyKey: "send-key-1" }));
    expect(retry.number).toBe(sent.number);
    expect((await sendScope(db, ctx, draft.id, { idempotencyKey: "send-key-2" })).ok).toBe(false);
    expect((await updateScope(db, ctx, draft.id, { title: "Changed" })).ok).toBe(false);
    expect((await deleteDraftScope(db, ctx, draft.id)).ok).toBe(false);
  });

  it("refuses to send an empty scope", async () => {
    const empty = must(await createScope(db, ctx, { dealId, title: "Empty" }));
    const res = await sendScope(db, ctx, empty.id, { idempotencyKey: "empty-key-1" });
    expect(res.ok).toBe(false);
    must(await deleteDraftScope(db, ctx, empty.id));
    expect((await getScope(db, ctx, empty.id)).ok).toBe(false);
  });

  it("revises a sent scope into v+1 and supersedes the old one on send", async () => {
    const all = must(await listScopes(db, ctx, dealId));
    const sentV1 = all.find((s) => s.status === "SENT")!;

    const v2 = must(await reviseScope(db, ctx, sentV1.id));
    expect(v2.version).toBeGreaterThan(sentV1.version);
    expect(v2.status).toBe("DRAFT");
    expect(v2.items).toHaveLength(1);
    // Only one draft per deal at a time.
    expect((await reviseScope(db, ctx, sentV1.id)).ok).toBe(false);

    must(await sendScope(db, ctx, v2.id, { idempotencyKey: "send-key-v2" }));
    const after = must(await listScopes(db, ctx, dealId));
    expect(after.find((s) => s.id === sentV1.id)!.status).toBe("SUPERSEDED");
    expect(after.find((s) => s.id === v2.id)!.status).toBe("SENT");
    expect((await reviseScope(db, ctx, sentV1.id)).ok).toBe(false);
  });
});
