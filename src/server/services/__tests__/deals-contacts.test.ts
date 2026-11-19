import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Db } from "@/server/db/client";
import { createDeal, listDeals } from "@/server/services/deals";
import { createTestDb } from "@/test/db";

const ctx = { orgId: "default", userId: "user-1" };

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

const contactsOf = (companyId: string) => db.select().from(schema.contacts).where(eq(schema.contacts.companyId, companyId));

describe("lead contacts", () => {
  it("saves the contact entered with a new lead and returns it with the deal list", async () => {
    const deal = must(
      await createDeal(db, ctx, {
        companyName: "Contact Lead Co",
        title: "Website",
        contactName: "Asha Rao",
        contactEmail: "Asha@Contact-Lead.example",
        contactPhone: "+91 90000 00000",
      })
    );
    const people = await contactsOf(deal.company.id);
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ name: "Asha Rao", email: "asha@contact-lead.example", phone: "+91 90000 00000" });

    const row = must(await listDeals(db, ctx)).find((d) => d.id === deal.id);
    expect(row).toMatchObject({ contactName: "Asha Rao", contactEmail: "asha@contact-lead.example", contactPhone: "+91 90000 00000" });
  });

  it("names the contact 'Primary contact' when only an email is given", async () => {
    const deal = must(await createDeal(db, ctx, { companyName: "Email Only Co", title: "Audit", contactEmail: "hello@email-only.example" }));
    expect((await contactsOf(deal.company.id))[0]).toMatchObject({ name: "Primary contact", email: "hello@email-only.example" });
  });

  it("does not add the same email twice when a repeat lead reuses the client", async () => {
    const first = must(await createDeal(db, ctx, { companyName: "Repeat Co", title: "One", contactEmail: "team@repeat.example" }));
    must(await createDeal(db, ctx, { companyName: "repeat co", title: "Two", contactEmail: "TEAM@repeat.example" }));
    expect(await contactsOf(first.company.id)).toHaveLength(1);
    must(await createDeal(db, ctx, { companyName: "Repeat Co", title: "Three", contactEmail: "other@repeat.example" }));
    expect(await contactsOf(first.company.id)).toHaveLength(2);
  });

  it("creates no contact and returns nulls when none is entered", async () => {
    const deal = must(await createDeal(db, ctx, { companyName: "No Contact Co", title: "Quote" }));
    expect(await contactsOf(deal.company.id)).toHaveLength(0);
    const row = must(await listDeals(db, ctx)).find((d) => d.id === deal.id);
    expect(row).toMatchObject({ contactName: null, contactEmail: null, contactPhone: null });
  });

  it("prefers a contact that has an email over one that has none", async () => {
    const deal = must(await createDeal(db, ctx, { companyName: "Two People Co", title: "CRM", contactName: "No Email", contactPhone: "111" }));
    await db.insert(schema.contacts).values({ companyId: deal.company.id, name: "Has Email", email: "has@two-people.example" });
    const row = must(await listDeals(db, ctx)).find((d) => d.id === deal.id);
    expect(row).toMatchObject({ contactName: "Has Email", contactEmail: "has@two-people.example" });
  });

  it("rejects an invalid contact email", async () => {
    const result = await createDeal(db, ctx, { companyName: "Bad Email Co", title: "X", contactEmail: "not-an-email" });
    expect(result.ok).toBe(false);
  });
});

describe("lead list matches the clients list", () => {
  it("hides leads of an archived client", async () => {
    const deal = must(await createDeal(db, ctx, { companyName: "Archived Soon Co", title: "Hidden" }));
    expect(must(await listDeals(db, ctx)).some((d) => d.id === deal.id)).toBe(true);
    await db.update(schema.companies).set({ archivedAt: new Date() }).where(eq(schema.companies.id, deal.company.id));
    expect(must(await listDeals(db, ctx)).some((d) => d.id === deal.id)).toBe(false);
  });

  it("returns every stage, not only open ones", async () => {
    const deal = must(await createDeal(db, ctx, { companyName: "Stage Co", title: "Stage" }));
    await db.update(schema.deals).set({ stage: "DIAGNOSED" }).where(eq(schema.deals.id, deal.id));
    expect(must(await listDeals(db, ctx)).find((d) => d.id === deal.id)?.stage).toBe("DIAGNOSED");
  });
});
