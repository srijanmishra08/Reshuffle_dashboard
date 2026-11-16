import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createCompany } from "../companies";
import { createFreelancer } from "../freelancers";
import {
  cancelPayout,
  createAssignment,
  createPayout,
  getFinancePlan,
  getFreelancerTeamView,
  listPayouts,
  markPayoutPaid,
  saveFinancePlan,
  updateAssignment,
} from "../team";
import { globalSearch, likePattern, listNotices } from "../search";

const ctx = { orgId: "default", userId: "user-1" };
const other = { orgId: "other", userId: "user-2" };
let db: Db;
let cleanup: () => void;
let freelancerId: string;
let projectId: string;

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  const company = must(await createCompany(db, ctx, { name: "Fake Dairy Co" }));
  const inserted = await db
    .insert(schema.deliveryProjects)
    .values({ orgId: ctx.orgId, companyId: company.id, name: "Fake portal build", budgetPaise: 100_000_00 })
    .returning({ id: schema.deliveryProjects.id });
  projectId = inserted[0].id;
  freelancerId = (await createFreelancer({ freelancer: "Test Freelancer", skill: "Design" }, db)).id;
});
afterAll(() => cleanup());

describe("assignments", () => {
  it("validates and rejects unknown freelancers and other organisations' projects", async () => {
    expect((await createAssignment(db, ctx, freelancerId, { projectId, allocationPct: 0 })).ok).toBe(false);
    expect((await createAssignment(db, ctx, "missing", { projectId })).ok).toBe(false);
    expect((await createAssignment(db, other, freelancerId, { projectId })).ok).toBe(false);
  });

  it("adds up active allocation and drops ended assignments", async () => {
    const a = must(await createAssignment(db, ctx, freelancerId, { projectId, role: "Designer", allocationPct: 60 }));
    must(await createAssignment(db, ctx, freelancerId, { projectId, allocationPct: 50 }));
    expect(must(await getFreelancerTeamView(db, ctx, freelancerId)).utilizationPct).toBe(110);

    expect((await updateAssignment(db, other, a.id, { status: "ENDED" })).ok).toBe(false);
    must(await updateAssignment(db, ctx, a.id, { status: "ENDED" }));
    expect(must(await getFreelancerTeamView(db, ctx, freelancerId)).utilizationPct).toBe(50);
  });
});

describe("payouts", () => {
  it("rejects zero, negative and fractional amounts", async () => {
    for (const amountPaise of [0, -5, 10.5]) {
      expect((await createPayout(db, ctx, freelancerId, { amountPaise })).ok).toBe(false);
    }
  });

  it("books exactly one ledger expense when paid, and refuses a second payment", async () => {
    const p = must(await createPayout(db, ctx, freelancerId, { amountPaise: 15_000_00, description: "Logo set", projectId }));
    expect(p.status).toBe("PENDING");

    expect((await markPayoutPaid(db, other, p.id)).ok).toBe(false);
    const paid = must(await markPayoutPaid(db, ctx, p.id, { paidOn: "2026-11-10" }));
    expect(paid.status).toBe("PAID");

    const again = await markPayoutPaid(db, ctx, p.id);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("CONFLICT");

    const entries = await db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.sourceId, p.id));
    expect(entries.length).toBe(1);
    expect(entries[0].kind).toBe("EXPENSE");
    expect(entries[0].amountPaise).toBe(15_000_00);
    expect(entries[0].entryDate).toBe("2026-11-10");
    expect(entries[0].sourceType).toBe("PAYOUT");
  });

  it("cancels only pending payouts and totals by status per organisation", async () => {
    const p = must(await createPayout(db, ctx, freelancerId, { amountPaise: 2_000_00 }));
    must(await createPayout(db, ctx, freelancerId, { amountPaise: 3_000_00, dueDate: "2020-01-01" }));
    must(await cancelPayout(db, ctx, p.id));
    expect((await cancelPayout(db, ctx, p.id)).ok).toBe(false);
    expect((await markPayoutPaid(db, ctx, p.id)).ok).toBe(false);

    const list = must(await listPayouts(db, ctx));
    expect(list.pendingPaise).toBe(3_000_00);
    expect(list.paidPaise).toBe(15_000_00);
    expect(must(await listPayouts(db, ctx, { status: "PENDING" })).rows.length).toBe(1);
    expect(must(await listPayouts(db, other)).rows.length).toBe(0);

    const view = must(await getFreelancerTeamView(db, ctx, freelancerId));
    expect(view.pendingPaise).toBe(3_000_00);
    expect(must(await getFreelancerTeamView(db, other, freelancerId)).payouts.length).toBe(0);
  });
});

describe("finance plans", () => {
  it("saves, overwrites and isolates by organisation", async () => {
    expect(must(await getFinancePlan(db, ctx, "projections"))).toBeNull();
    must(await saveFinancePlan(db, ctx, "projections", { data: { quarter1: [{ id: "a" }] } }));
    must(await saveFinancePlan(db, ctx, "projections", { data: { quarter1: [{ id: "b" }] } }));
    expect(must(await getFinancePlan(db, ctx, "projections"))?.data).toEqual({ quarter1: [{ id: "b" }] });
    expect(must(await getFinancePlan(db, other, "projections"))).toBeNull();
    expect((await saveFinancePlan(db, ctx, "Bad Key!", { data: {} })).ok).toBe(false);
    expect((await saveFinancePlan(db, ctx, "projections", { data: "nope" })).ok).toBe(false);
  });
});

describe("search and notices", () => {
  it("escapes LIKE wildcards", () => {
    expect(likePattern("50%_a\\")).toBe("%50\\%\\_a\\\\%");
  });

  it("finds records by substring, ignores short queries and other organisations", async () => {
    expect(must(await globalSearch(db, ctx, "d")).length).toBe(0);
    const hits = must(await globalSearch(db, ctx, "fake"));
    expect(hits.map((h) => h.type).sort()).toEqual(["Client", "Project"]);
    expect(must(await globalSearch(db, ctx, "%")).length).toBe(0);
    expect(must(await globalSearch(db, other, "fake dairy")).length).toBe(0);
    expect(must(await globalSearch(db, ctx, "test free")).some((h) => h.type === "Freelancer")).toBe(true);
  });

  it("shows due payouts only to billing roles", async () => {
    const staff = must(await listNotices(db, ctx, { includeBilling: false }));
    expect(staff.some((n) => n.kind === "Payout due")).toBe(false);
    const billing = must(await listNotices(db, ctx, { includeBilling: true }));
    expect(billing.filter((n) => n.kind === "Payout due").length).toBe(1);
    expect(must(await listNotices(db, other, { includeBilling: true })).length).toBe(0);
  });
});
