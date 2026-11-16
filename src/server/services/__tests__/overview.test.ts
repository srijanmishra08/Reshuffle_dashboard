import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";
import { createCompany } from "../companies";
import { createDeal, transitionDeal } from "../deals";
import { getOverview } from "../overview";

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

describe("overview", () => {
  it("is all zeroes on an empty organisation", async () => {
    const o = must(await getOverview(db, ctx));
    expect(o.pipeline.openCount).toBe(0);
    expect(o.pipeline.winRatePercent).toBeNull();
    expect(o.receivables.outstandingPaise).toBe(0);
    expect(o.projects.active).toBe(0);
    expect(o.cash).toEqual({ incomePaise: 0, expensePaise: 0 });
  });

  it("counts open pipeline, wins this month and win rate, per organisation", async () => {
    const company = must(await createCompany(db, ctx, { name: "Fake Traders" }));
    const open = must(await createDeal(db, ctx, { companyId: company.id, title: "Open deal", valuePaise: 500_00 }));
    const won = must(await createDeal(db, ctx, { companyId: company.id, title: "Won deal", valuePaise: 1200_00 }));
    const lost = must(await createDeal(db, ctx, { companyId: company.id, title: "Lost deal", valuePaise: 300_00 }));

    for (const to of ["CONTACTED", "DIAGNOSED", "PROPOSAL_SENT", "WON"]) {
      must(await transitionDeal(db, ctx, won.id, { to }));
    }
    must(await transitionDeal(db, ctx, lost.id, { to: "LOST", lostReason: "Budget" }));

    const o = must(await getOverview(db, ctx));
    expect(o.pipeline.openCount).toBe(1);
    expect(o.pipeline.openValuePaise).toBe(500_00);
    expect(o.pipeline.wonThisMonthCount).toBe(1);
    expect(o.pipeline.wonThisMonthPaise).toBe(1200_00);
    expect(o.pipeline.winRatePercent).toBe(50);
    expect(open.stage).toBe("LEAD");

    const elsewhere = must(await getOverview(db, other));
    expect(elsewhere.pipeline.openCount).toBe(0);
    expect(elsewhere.pipeline.wonThisMonthCount).toBe(0);
  });
});
