import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { eq } from "drizzle-orm";
import { createCompany } from "../companies";
import { createDeal, getDeal, listDeals, pipelineSummary, saveDiagnosis, transitionDeal, updateDeal } from "../deals";
import { canTransitionDeal } from "@/server/models/deals";

const ctx = { orgId: "default", userId: "user-1" };
let db: Db;
let cleanup: () => void;
let companyId: string;

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  companyId = must(await createCompany(db, ctx, { name: "Fake Dairy Co" })).id;
});
afterAll(() => cleanup());

describe("deal stage rules", () => {
  it("allows the expected moves only", () => {
    expect(canTransitionDeal("LEAD", "CONTACTED")).toBe(true);
    expect(canTransitionDeal("LEAD", "WON")).toBe(false);
    expect(canTransitionDeal("NEGOTIATION", "WON")).toBe(true);
    expect(canTransitionDeal("NEGOTIATION", "LOST")).toBe(true);
    expect(canTransitionDeal("LOST", "LEAD")).toBe(true);
    expect(canTransitionDeal("LOST", "CONTACTED")).toBe(false);
    expect(canTransitionDeal("WON", "LOST")).toBe(false);
  });
});

describe("deals", () => {
  it("rejects a deal for an unknown company", async () => {
    const res = await createDeal(db, ctx, { companyId: "nope", title: "X" });
    expect(res.ok).toBe(false);
  });

  it("walks LEAD to WON, records history and onboards the company", async () => {
    const deal = must(await createDeal(db, ctx, { companyId, title: "Dairy system", valuePaise: 5_000_000 }));
    expect(deal.stage).toBe("LEAD");
    for (const to of ["CONTACTED", "DIAGNOSED", "PROPOSAL_SENT", "NEGOTIATION", "WON"]) {
      must(await transitionDeal(db, ctx, deal.id, { to }));
    }
    const won = must(await getDeal(db, ctx, deal.id));
    expect(won.stage).toBe("WON");
    expect(won.closedAt).not.toBeNull();
    expect(won.history.map((h) => h.toStage)).toEqual(["LEAD", "CONTACTED", "DIAGNOSED", "PROPOSAL_SENT", "NEGOTIATION", "WON"]);
    const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId));
    expect(company.lifecycle).toBe("ONBOARDING");
    expect((await transitionDeal(db, ctx, deal.id, { to: "LOST", lostReason: "x" })).ok).toBe(false);
  });

  it("requires a lost reason and allows reopening", async () => {
    const deal = must(await createDeal(db, ctx, { companyId, title: "Lost one" }));
    expect((await transitionDeal(db, ctx, deal.id, { to: "LOST" })).ok).toBe(false);
    const lost = must(await transitionDeal(db, ctx, deal.id, { to: "LOST", lostReason: "Budget" }));
    expect(lost.lostReason).toBe("Budget");
    const reopened = must(await transitionDeal(db, ctx, deal.id, { to: "LEAD" }));
    expect(reopened.lostReason).toBeNull();
    expect(reopened.closedAt).toBeNull();
  });

  it("saves a diagnosis and ranks buckets by pain", async () => {
    const deal = must(await createDeal(db, ctx, { companyId, title: "Diagnosed" }));
    const res = must(
      await saveDiagnosis(db, ctx, deal.id, {
        entries: [
          { level: 1, bucket: "OPERATIONS", question: "How do orders flow?", answer: "WhatsApp", painScore: 5 },
          { level: 2, bucket: "REVENUE", question: "How do you track leads?", answer: "Notebook", painScore: 2 },
          { level: 3, bucket: "OPERATIONS", question: "Stock?", answer: "Manual", painScore: 4 },
        ],
      })
    );
    expect(res.diagnosis[0]).toMatchObject({ bucket: "OPERATIONS", totalPain: 9 });
    const replaced = must(await saveDiagnosis(db, ctx, deal.id, { entries: [] }));
    expect(replaced.diagnosisEntries).toHaveLength(0);
  });

  it("summary matches the list view per stage", async () => {
    must(await updateDeal(db, ctx, must(await createDeal(db, ctx, { companyId, title: "Valued", valuePaise: 100 })).id, { valuePaise: 250 }));
    const summary = must(await pipelineSummary(db, ctx));
    const list = must(await listDeals(db, ctx));
    for (const row of summary) {
      const inStage = list.filter((d) => d.stage === row.stage);
      expect(row.count).toBe(inStage.length);
      expect(row.valuePaise).toBe(inStage.reduce((s, d) => s + d.valuePaise, 0));
    }
  });
});
