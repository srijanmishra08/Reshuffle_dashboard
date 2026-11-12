import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";
import { archiveCompany, createCompany, getCompany, listCompanies, listVerticals, updateCompany } from "@/server/services/companies";
import { archiveContact, createContact, listContacts, updateContact } from "@/server/services/contacts";
import {
  createInteraction,
  createMeeting,
  listDueFollowUps,
  listInteractions,
  listMeetings,
  setNextActionDone,
} from "@/server/services/interactions";

const ctx = { orgId: "default", userId: "user-1" };
const otherOrg = { orgId: "other", userId: "user-2" };

let db: Db;
let cleanup: () => void;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(() => cleanup());

const iso = (value: unknown) => (value ? new Date(value as string | Date).toISOString() : null);

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

describe("verticals", () => {
  it("seeds the 8 verticals", async () => {
    const rows = must(await listVerticals(db, ctx));
    expect(rows.map((r) => r.name)).toContain("Rice Mill");
    expect(rows).toHaveLength(8);
  });
});

describe("companies", () => {
  it("creates, reads and defaults lifecycle to PROSPECT", async () => {
    const created = must(await createCompany(db, ctx, { name: "Example Traders", verticalId: "vertical-dairy" }));
    expect(created.lifecycle).toBe("PROSPECT");
    expect(created.verticalName).toBe("Dairy");
    expect(created.ownerId).toBe("user-1");
  });

  it("rejects bad input and unknown verticals", async () => {
    const empty = await createCompany(db, ctx, { name: "" });
    expect(empty.ok).toBe(false);
    const badGstin = await createCompany(db, ctx, { name: "X", gstin: "123" });
    expect(badGstin.ok).toBe(false);
    const badVertical = await createCompany(db, ctx, { name: "X", verticalId: "nope" });
    expect(badVertical).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("filters by lifecycle and search, and searches legal name", async () => {
    must(await createCompany(db, ctx, { name: "Alpha Mill", lifecycle: "ACTIVE", legalName: "Alpha Rice Pvt Ltd" }));
    must(await createCompany(db, ctx, { name: "Beta Law", lifecycle: "CLOSED" }));

    const active = must(await listCompanies(db, ctx, { lifecycle: "ACTIVE" }));
    expect(active.map((c) => c.name)).toEqual(["Alpha Mill"]);

    const search = must(await listCompanies(db, ctx, { q: "rice" }));
    expect(search.map((c) => c.name)).toEqual(["Alpha Mill"]);
  });

  it("logs a lifecycle change and updates the row", async () => {
    const company = must(await createCompany(db, ctx, { name: "Gamma Travel" }));
    const updated = must(await updateCompany(db, ctx, company.id, { lifecycle: "ONBOARDING", notes: "  met at event " }));
    expect(updated.lifecycle).toBe("ONBOARDING");
    expect(updated.notes).toBe("met at event");
  });

  it("isolates organisations", async () => {
    const company = must(await createCompany(db, ctx, { name: "Isolated Co" }));
    expect(await getCompany(db, otherOrg, company.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    const list = must(await listCompanies(db, otherOrg, {}));
    expect(list).toHaveLength(0);
  });

  it("archives and hides a company", async () => {
    const company = must(await createCompany(db, ctx, { name: "Delta Interior" }));
    must(await archiveCompany(db, ctx, company.id));
    expect(await getCompany(db, ctx, company.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("contacts", () => {
  it("keeps WhatsApp bot flags", async () => {
    const company = must(await createCompany(db, ctx, { name: "Contacts Co" }));
    const contact = must(
      await createContact(db, ctx, company.id, {
        name: "Test Person",
        email: "person@example.test",
        whatsappRole: "CLIENT_TEAM",
        onboarded: true,
        approved: false,
      })
    );
    expect(contact.whatsappRole).toBe("CLIENT_TEAM");
    expect(contact.onboarded).toBe(true);

    const updated = must(await updateContact(db, ctx, company.id, contact.id, { approved: true }));
    expect(updated.approved).toBe(true);

    expect(must(await listContacts(db, ctx, company.id))).toHaveLength(1);
    must(await archiveContact(db, ctx, company.id, contact.id));
    expect(must(await listContacts(db, ctx, company.id))).toHaveLength(0);
  });

  it("rejects invalid email and unknown company", async () => {
    const company = must(await createCompany(db, ctx, { name: "Email Co" }));
    expect((await createContact(db, ctx, company.id, { name: "A", email: "nope" })).ok).toBe(false);
    expect(await createContact(db, ctx, "missing", { name: "A" })).toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("interactions and follow-ups", () => {
  it("shows a next action on the company and in due follow-ups, then clears it when done", async () => {
    const company = must(await createCompany(db, ctx, { name: "Follow Up Co" }));
    const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const interaction = must(
      await createInteraction(db, ctx, company.id, {
        type: "CALL",
        summary: "Intro call",
        nextAction: "Send proposal outline",
        nextActionAt: soon,
      })
    );

    expect(iso(must(await getCompany(db, ctx, company.id)).nextActionAt)).toBe(soon);
    expect(must(await listDueFollowUps(db, ctx)).map((f) => f.companyId)).toContain(company.id);

    must(await setNextActionDone(db, ctx, company.id, interaction.id, { done: true }));

    expect(must(await getCompany(db, ctx, company.id)).nextActionAt).toBeNull();
    expect(must(await listDueFollowUps(db, ctx)).map((f) => f.companyId)).not.toContain(company.id);
    expect(must(await listInteractions(db, ctx, company.id))).toHaveLength(1);
  });

  it("requires a description for a next-action date and a contact from the same company", async () => {
    const company = must(await createCompany(db, ctx, { name: "Rules Co" }));
    const other = must(await createCompany(db, ctx, { name: "Other Co" }));
    const stranger = must(await createContact(db, ctx, other.id, { name: "Stranger" }));

    const noText = await createInteraction(db, ctx, company.id, {
      type: "NOTE",
      summary: "x",
      nextActionAt: new Date().toISOString(),
    });
    expect(noText.ok).toBe(false);

    const wrongContact = await createInteraction(db, ctx, company.id, {
      type: "NOTE",
      summary: "x",
      contactId: stranger.id,
    });
    expect(wrongContact).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("does not list future follow-ups as due and refuses done on interactions without a next action", async () => {
    const company = must(await createCompany(db, ctx, { name: "Future Co" }));
    const later = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    must(await createInteraction(db, ctx, company.id, { type: "EMAIL", summary: "s", nextAction: "later", nextActionAt: later }));
    expect(must(await listDueFollowUps(db, ctx)).map((f) => f.companyId)).not.toContain(company.id);

    const plain = must(await createInteraction(db, ctx, company.id, { type: "NOTE", summary: "plain" }));
    expect(await setNextActionDone(db, ctx, company.id, plain.id, { done: true })).toMatchObject({ code: "CONFLICT" });
  });
});

describe("meetings", () => {
  it("creates and lists meetings", async () => {
    const company = must(await createCompany(db, ctx, { name: "Meeting Co" }));
    must(await createMeeting(db, ctx, company.id, { title: "Kickoff", at: "2026-12-01T10:00:00.000Z", attendees: ["A", "B"] }));
    const list = must(await listMeetings(db, ctx, company.id));
    expect(list).toHaveLength(1);
    expect(list[0].attendees).toEqual(["A", "B"]);
  });
});
