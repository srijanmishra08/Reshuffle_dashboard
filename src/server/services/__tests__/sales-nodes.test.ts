import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createDeal, listDeals, transitionDeal, updateDeal } from "../deals";
import { createSalesNode, listSalesNodes, updateSalesNode } from "../sales-nodes";

const ctx = { orgId: "default", userId: "user-1" };
const manager = { includeMoney: true };
const member = { includeMoney: false };
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

describe("sales nodes", () => {
  it("creates nodes, refuses duplicate names ignoring case, and hides money from non-managers", async () => {
    const asha = must(await createSalesNode(db, ctx, manager, { name: "Asha Mehra", kind: "FREELANCER", commissionPercent: 10 }));
    expect(asha).toMatchObject({ name: "Asha Mehra", kind: "FREELANCER", kindLabel: "Freelancer", commissionPercent: 10 });
    expect(await createSalesNode(db, ctx, manager, { name: "asha mehra" })).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(await createSalesNode(db, ctx, member, { name: "Needs Pay", commissionPercent: 5 })).toMatchObject({ ok: false, code: "FORBIDDEN" });

    const plain = must(await createSalesNode(db, ctx, member, { name: "Plain Referrer" }));
    expect(plain).not.toHaveProperty("commissionPercent");
    expect(must(await listSalesNodes(db, ctx, member)).every((n) => !("commissionDuePaise" in n))).toBe(true);
    expect(await createSalesNode(db, ctx, manager, { name: "Bad", kind: "ROBOT" })).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("fills a lead's source and referrer from its node, counts leads per node, and works out the commission on accepted deals", async () => {
    const node = must(await createSalesNode(db, ctx, manager, { name: "Agency Alpha", kind: "AGENCY", commissionPercent: 12.5 }));
    const first = must(await createDeal(db, ctx, { companyName: "Node Lead One", title: "One", salesNodeId: node.id, valuePaise: 4_000_000 }));
    expect(first).toMatchObject({ source: "Agency", referrer: "Agency Alpha", salesNodeId: node.id });
    const second = must(await createDeal(db, ctx, { companyName: "Node Lead Two", title: "Two", salesNodeId: node.id, valuePaise: 1_000_000 }));
    const third = must(await createDeal(db, ctx, { companyName: "Node Lead Three", title: "Three", salesNodeId: node.id, valuePaise: 500_000 }));

    for (const to of ["CONTACTED", "PROPOSAL_SENT", "WON"] as const) must(await transitionDeal(db, ctx, first.id, { to }));
    must(await transitionDeal(db, ctx, second.id, { to: "LOST", lostReason: "no budget" }));

    const stats = must(await listSalesNodes(db, ctx, manager)).find((n) => n.id === node.id)!;
    expect(stats).toMatchObject({ leads: 3, open: 1, accepted: 1, lost: 1, acceptedPaise: 4_000_000, commissionPercent: 12.5, commissionDuePaise: 500_000 });
    expect(must(await listSalesNodes(db, ctx, member)).find((n) => n.id === node.id)).not.toHaveProperty("acceptedPaise");
    expect(third.stage).toBe("LEAD");
    expect(must(await listDeals(db, ctx)).find((d) => d.id === first.id)?.salesNodeId).toBe(node.id);
  });

  it("re-labels a lead when its node changes, clears the link, and refuses unknown or foreign nodes", async () => {
    const a = must(await createSalesNode(db, ctx, manager, { name: "Node A", kind: "SALES_STAFF" }));
    const b = must(await createSalesNode(db, ctx, manager, { name: "Node B", kind: "INDIVIDUAL" }));
    await db.insert(schema.salesNodes).values({ id: "foreign-node", orgId: "other", name: "Foreign" });
    const deal = must(await createDeal(db, ctx, { companyName: "Relabel Co", title: "Relabel", salesNodeId: a.id }));
    expect(deal).toMatchObject({ source: "Sales staff", referrer: "Node A" });

    const moved = must(await updateDeal(db, ctx, deal.id, { salesNodeId: b.id }));
    expect(moved).toMatchObject({ source: "Individual referral", referrer: "Node B", salesNodeId: b.id });

    const cleared = must(await updateDeal(db, ctx, deal.id, { salesNodeId: null }));
    expect(cleared.salesNodeId).toBeNull();
    expect(cleared.referrer).toBe("Node B");

    expect((await updateDeal(db, ctx, deal.id, { salesNodeId: "foreign-node" })).ok).toBe(false);
    expect((await createDeal(db, ctx, { companyName: "Relabel Co", title: "x", salesNodeId: "nope" })).ok).toBe(false);
  });

  it("edits a node and lets it be switched off", async () => {
    const n = must(await createSalesNode(db, ctx, manager, { name: "Editable Node" }));
    const edited = must(await updateSalesNode(db, ctx, manager, n.id, { name: "Edited Node", phone: "+910000000009", commissionPercent: 7, active: false }));
    expect(edited).toMatchObject({ name: "Edited Node", phone: "+910000000009", commissionPercent: 7, active: false });
    expect(must(await listSalesNodes(db, ctx, manager, { activeOnly: true })).some((x) => x.id === n.id)).toBe(false);
    expect(await updateSalesNode(db, ctx, member, n.id, { commissionPercent: 1 })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await updateSalesNode(db, ctx, manager, "nope", { name: "x" })).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("backfills nodes from existing referrers (migration 0027)", async () => {
    const t = await createTestDb();
    try {
      await t.db.insert(schema.companies).values({ id: "bf-co", orgId: "default", name: "Backfill Co" });
      await t.db.insert(schema.deals).values([
        { id: "bf-d1", orgId: "default", companyId: "bf-co", title: "A", source: "Freelancer", referrer: " Priya  " },
        { id: "bf-d2", orgId: "default", companyId: "bf-co", title: "B", source: "Referral", referrer: "priya" },
        { id: "bf-d3", orgId: "default", companyId: "bf-co", title: "C", source: "Agency", referrer: "Studio X" },
        { id: "bf-d4", orgId: "default", companyId: "bf-co", title: "D" },
      ]);
      const file = readFileSync("drizzle/0027_sales_nodes.sql", "utf8");
      // Undo what the migration already did on this empty-at-the-time database, then run its own backfill.
      await t.db.execute(sql`delete from sales_nodes`);
      await t.db.execute(sql`update deals set sales_node_id = null`);
      for (const part of file.slice(file.indexOf("-- Existing leads keep")).split("--> statement-breakpoint")) {
        await t.db.execute(sql.raw(part));
      }
      const nodes = (await t.db.select().from(schema.salesNodes)).map((n) => `${n.name}:${n.kind}`).sort();
      expect(nodes).toEqual(["Priya:FREELANCER", "Studio X:AGENCY"]);
      const linked = await t.db.select().from(schema.deals);
      const byId = Object.fromEntries(linked.map((d) => [d.id, d.salesNodeId]));
      expect(byId["bf-d1"]).not.toBeNull();
      expect(byId["bf-d1"]).toBe(byId["bf-d2"]);
      expect(byId["bf-d3"]).not.toBeNull();
      expect(byId["bf-d4"]).toBeNull();
    } finally {
      t.cleanup();
    }
  });
});
