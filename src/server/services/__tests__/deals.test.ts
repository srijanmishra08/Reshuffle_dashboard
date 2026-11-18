import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { eq } from "drizzle-orm";
import { createCompany } from "../companies";
import { createDeal, getDeal, listDeals, pipelineSummary, saveDiagnosis, transitionDeal, updateDeal } from "../deals";
import { canTransitionDeal } from "@/server/models/deals";
import { listStaff } from "../staff";

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

describe("lead owners", () => {
  const person = (id: string, name: string, role = "MEMBER", orgId = "default", active = true) =>
    ({ id, name, email: `${id}@example.test`, role, orgId, active, createdAt: new Date(), updatedAt: new Date() });

  it("assigns a lead to a team member, shows their name, and refuses anyone else", async () => {
    await db.insert(schema.user).values([
      person("own-sales", "Sales Staff One"),
      person("own-admin", "Admin Person", "ADMIN"),
      person("own-client", "A Client", "CLIENT"),
      person("own-gone", "Left The Team", "MEMBER", "default", false),
      person("own-other", "Other Org Person", "MEMBER", "other"),
    ]);

    const deal = must(await createDeal(db, ctx, { companyName: "Owner Co", title: "Owned", ownerId: "own-sales" }));
    expect(deal.ownerId).toBe("own-sales");
    expect(deal.ownerName).toBe("Sales Staff One");
    expect(must(await listDeals(db, ctx)).find((d) => d.id === deal.id)?.ownerName).toBe("Sales Staff One");
    expect(must(await listDeals(db, ctx, { ownerId: "own-sales" })).map((d) => d.id)).toEqual([deal.id]);

    const reassigned = must(await updateDeal(db, ctx, deal.id, { ownerId: "own-admin" }));
    expect(reassigned.ownerName).toBe("Admin Person");

    for (const bad of ["own-client", "own-gone", "own-other", "nobody"]) {
      expect((await updateDeal(db, ctx, deal.id, { ownerId: bad })).ok, bad).toBe(false);
      expect((await createDeal(db, ctx, { companyName: "Owner Co", title: "x", ownerId: bad })).ok, bad).toBe(false);
    }
  });

  it("lists the active team members of the organisation only", async () => {
    const staff = must(await listStaff(db, ctx)).map((m) => m.id);
    expect(staff).toEqual(expect.arrayContaining(["own-sales", "own-admin"]));
    expect(staff).not.toContain("own-client");
    expect(staff).not.toContain("own-gone");
    expect(staff).not.toContain("own-other");
  });
});

describe("deal modules", () => {
  async function addModule(name: string, orgId = ctx.orgId, defaultPricePaise = 0) {
    const id = `mod-${name}`;
    await db.insert(schema.modulesLibrary).values({ id, orgId, name, defaultPricePaise });
    return id;
  }

  it("prices a lead from its modules when no value is sent, and keeps a value that is sent", async () => {
    const pos = await addModule("POS", ctx.orgId, 2_500_000);
    const stock = await addModule("Stock", ctx.orgId, 1_000_000);
    const auto = must(await createDeal(db, ctx, { companyName: "Sku Co", title: "Sku", moduleIds: [pos, stock, pos] }));
    expect(auto.valuePaise).toBe(3_500_000);
    const typed = must(await createDeal(db, ctx, { companyName: "Sku Co", title: "Negotiated", moduleIds: [pos], valuePaise: 1_800_000 }));
    expect(typed.valuePaise).toBe(1_800_000);
    const none = must(await createDeal(db, ctx, { companyName: "Sku Co", title: "No modules" }));
    expect(none.valuePaise).toBe(0);
  });

  it("attaches chosen modules to a new lead and returns them on the deal and the board list", async () => {
    const billing = await addModule("Billing");
    const crm = await addModule("CRM");
    const deal = must(await createDeal(db, ctx, { companyName: "Module Lead Co", title: "Module lead", moduleIds: [crm, billing, crm] }));
    expect(deal.modules.map((m) => m.name)).toEqual(["Billing", "CRM"]);
    const listed = must(await listDeals(db, ctx)).find((d) => d.id === deal.id);
    expect(listed?.modules.map((m) => m.name)).toEqual(["Billing", "CRM"]);
  });

  it("replaces the module list on update and leaves it alone when not sent", async () => {
    const inventory = await addModule("Inventory");
    const reports = await addModule("Reports");
    const deal = must(await createDeal(db, ctx, { companyName: "Swap Co", title: "Swap", moduleIds: [inventory] }));
    expect(must(await updateDeal(db, ctx, deal.id, { moduleIds: [reports] })).modules.map((m) => m.name)).toEqual(["Reports"]);
    expect(must(await updateDeal(db, ctx, deal.id, { title: "Renamed" })).modules.map((m) => m.name)).toEqual(["Reports"]);
    expect(must(await updateDeal(db, ctx, deal.id, { moduleIds: [] })).modules).toEqual([]);
  });

  it("rejects an unknown module or one from another organisation", async () => {
    const foreign = await addModule("Foreign", "other");
    expect((await createDeal(db, ctx, { companyName: "Bad Mod Co", title: "x", moduleIds: ["nope"] })).ok).toBe(false);
    expect((await createDeal(db, ctx, { companyName: "Bad Mod Co", title: "x", moduleIds: [foreign] })).ok).toBe(false);
    const rows = await db.select().from(schema.companies).where(eq(schema.companies.name, "Bad Mod Co"));
    expect(rows).toHaveLength(0);
  });
});

describe("deals", () => {
  it("creates a brand-new company from a typed lead name, as a PROSPECT with its sales node", async () => {
    const deal = must(
      await createDeal(db, ctx, { companyName: "  Brand New Sweets ", title: "Brand New Sweets", source: "Freelancer", referrer: "Asha" })
    );
    expect(deal.stage).toBe("LEAD");
    expect(deal.company?.name).toBe("Brand New Sweets");
    expect(deal.company?.lifecycle).toBe("PROSPECT");
    const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, deal.companyId));
    expect(company.source).toBe("Freelancer");
    expect(company.referrer).toBe("Asha");
    expect(company.ownerId).toBe(ctx.userId);
    // The Client outreach page reads these from the list.
    const listed = must(await listDeals(db, ctx)).find((d) => d.id === deal.id);
    expect(listed).toMatchObject({ source: "Freelancer", referrer: "Asha", companyName: "Brand New Sweets", nextFollowUp: null });
  });

  it("reuses an existing company when the typed name matches, ignoring case", async () => {
    const before = await db.select().from(schema.companies);
    const deal = must(await createDeal(db, ctx, { companyName: "fake dairy co", title: "Second project" }));
    expect(deal.companyId).toBe(companyId);
    expect((await db.select().from(schema.companies)).length).toBe(before.length);
  });

  it("needs either a company id or a lead name", async () => {
    expect((await createDeal(db, ctx, { title: "Orphan" })).ok).toBe(false);
    expect((await createDeal(db, ctx, { companyName: "   ", title: "Blank" })).ok).toBe(false);
  });

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
