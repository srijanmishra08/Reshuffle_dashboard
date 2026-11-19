import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";
import { createCompany } from "../companies";
import { createDeal } from "../deals";
import { createDoc, deleteDoc, getDoc, listDocs, updateDoc } from "../docs";

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

describe("docs", () => {
  it("rejects invalid input", async () => {
    expect((await createDoc(db, ctx, { title: "" })).ok).toBe(false);
    expect((await createDoc(db, ctx, { title: "x", type: "BOGUS" })).ok).toBe(false);
  });

  it("creates, updates, and deletes", async () => {
    const d = must(await createDoc(db, ctx, { title: "Fake SOP", type: "SOP", body: "# Steps" }));
    expect(d.type).toBe("SOP");
    const u = must(await updateDoc(db, ctx, d.id, { body: "# Steps\n1. one" }));
    expect(u.body).toContain("1. one");
    expect((await deleteDoc(db, ctx, d.id)).ok).toBe(true);
    expect((await getDoc(db, ctx, d.id)).ok).toBe(false);
  });

  it("filters by type and searches title and body literally", async () => {
    must(await createDoc(db, ctx, { title: "Alpha playbook", type: "PLAYBOOK", body: "pitch 100% value" }));
    must(await createDoc(db, ctx, { title: "Beta note", type: "NOTE", body: "other" }));
    expect(must(await listDocs(db, ctx, { type: "PLAYBOOK" })).map((r) => r.title)).toEqual(["Alpha playbook"]);
    expect(must(await listDocs(db, ctx, { q: "alpha" })).length).toBe(1);
    expect(must(await listDocs(db, ctx, { q: "100%" })).length).toBe(1);
    expect(must(await listDocs(db, ctx, { q: "%" })).length).toBe(1);
  });

  it("isolates organisations", async () => {
    const d = must(await createDoc(db, ctx, { title: "Private" }));
    expect((await getDoc(db, other, d.id)).ok).toBe(false);
    expect((await updateDoc(db, other, d.id, { title: "x" })).ok).toBe(false);
    expect((await deleteDoc(db, other, d.id)).ok).toBe(false);
    expect(must(await listDocs(db, other, {})).length).toBe(0);
  });

  it("starts as a draft and filters by status", async () => {
    const d = must(await createDoc(db, ctx, { title: "Status doc" }));
    expect(d.status).toBe("DRAFT");
    must(await updateDoc(db, ctx, d.id, { status: "PUBLISHED" }));
    const published = must(await listDocs(db, ctx, { status: "PUBLISHED" })).map((r) => r.id);
    expect(published).toContain(d.id);
    expect((await updateDoc(db, ctx, d.id, { status: "BOGUS" })).ok).toBe(false);
  });

  it("links a doc to a client and a lead, and lists them by link", async () => {
    const company = must(await createCompany(db, ctx, { name: "Fake Docs Client" }));
    const otherCompany = must(await createCompany(db, ctx, { name: "Fake Other Client" }));
    const deal = must(await createDeal(db, ctx, { companyName: "Fake Docs Client", title: "Fake lead" }));

    const forClient = must(await createDoc(db, ctx, { title: "Client brief", companyId: company.id }));
    expect(forClient.companyName).toBe("Fake Docs Client");
    expect(forClient.dealId).toBeNull();

    // A lead pulls in its client.
    const forLead = must(await createDoc(db, ctx, { title: "Lead notes", dealId: deal.id }));
    expect(forLead.companyId).toBe(company.id);
    expect(forLead.dealTitle).toBe("Fake lead");

    expect(must(await listDocs(db, ctx, { companyId: company.id })).map((r) => r.title).sort()).toEqual([
      "Client brief",
      "Lead notes",
    ]);
    expect(must(await listDocs(db, ctx, { dealId: deal.id })).map((r) => r.title)).toEqual(["Lead notes"]);

    // The lead and the client must agree.
    expect((await createDoc(db, ctx, { title: "x", dealId: deal.id, companyId: otherCompany.id })).ok).toBe(false);
    expect((await updateDoc(db, ctx, forLead.id, { companyId: otherCompany.id })).ok).toBe(false);

    // Unlinking the lead keeps the client; unlinking both clears the doc.
    const unlinkedLead = must(await updateDoc(db, ctx, forLead.id, { dealId: null }));
    expect(unlinkedLead.dealId).toBeNull();
    expect(unlinkedLead.companyId).toBe(company.id);
    const cleared = must(await updateDoc(db, ctx, forLead.id, { companyId: null }));
    expect(cleared.companyId).toBeNull();
  });

  it("rejects links to records that do not exist or belong to another org", async () => {
    const mine = must(await createCompany(db, ctx, { name: "Fake Org Client" }));
    expect((await createDoc(db, ctx, { title: "x", companyId: "nope" })).ok).toBe(false);
    expect((await createDoc(db, ctx, { title: "x", dealId: "nope" })).ok).toBe(false);
    expect((await createDoc(db, other, { title: "x", companyId: mine.id })).ok).toBe(false);
  });
});
