import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@/server/db/client";
import { archiveCompany, createCompany, getCompany, listCompanies, updateCompany } from "@/server/services/companies";
import { createDeal, transitionDeal, updateDeal } from "@/server/services/deals";
import { archiveContact, createContact, listContacts, updateContact } from "@/server/services/contacts";
import {
  createInteraction,
  createMeeting,
  listDueFollowUps,
  listInteractions,
  listMeetings,
  setInteractionDeal,
  setMeetingDeal,
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

describe("companies", () => {
  it("creates, reads and defaults lifecycle to PROSPECT", async () => {
    const created = must(await createCompany(db, ctx, { name: "Example Traders" }));
    expect(created.lifecycle).toBe("PROSPECT");
    expect(created.modules).toEqual([]);
    expect(created.ownerId).toBe("user-1");
  });

  it("rejects bad input", async () => {
    const empty = await createCompany(db, ctx, { name: "" });
    expect(empty.ok).toBe(false);
    const badGstin = await createCompany(db, ctx, { name: "X", gstin: "123" });
    expect(badGstin.ok).toBe(false);
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

  it("edits a company's name, legal name, website, address, source and referrer", async () => {
    const company = must(await createCompany(db, ctx, { name: "Old Name" }));
    const updated = must(
      await updateCompany(db, ctx, company.id, {
        name: "New Name",
        legalName: "New Name Pvt Ltd",
        website: "https://new.example.test",
        address: "Raipur",
        source: "Agency",
        referrer: "Meera",
      })
    );
    expect(updated).toMatchObject({ name: "New Name", legalName: "New Name Pvt Ltd", source: "Agency", referrer: "Meera", address: "Raipur" });
    expect((await updateCompany(db, ctx, company.id, { name: "  " })).ok).toBe(false);
  });

  it("lets you set a client's modules (SKUs) when adding it and edit them later", async () => {
    await db.insert(schema.modulesLibrary).values([
      { id: "crm-mod-a", orgId: "default", name: "Billing" },
      { id: "crm-mod-b", orgId: "default", name: "Inventory" },
      { id: "crm-mod-c", orgId: "default", name: "Reports" },
    ]);
    const added = must(await createCompany(db, ctx, { name: "Sku Client One", moduleIds: ["crm-mod-b", "crm-mod-a", "crm-mod-b"] }));
    expect(added.modules.map((m) => m.name)).toEqual(["Billing", "Inventory"]);

    const swapped = must(await updateCompany(db, ctx, added.id, { moduleIds: ["crm-mod-c", "crm-mod-a"] }));
    expect(swapped.modules.map((m) => m.name)).toEqual(["Billing", "Reports"]);

    // Other edits leave the modules alone; an empty list clears them.
    expect(must(await updateCompany(db, ctx, added.id, { notes: "x" })).modules).toHaveLength(2);
    expect(must(await updateCompany(db, ctx, added.id, { moduleIds: [] })).modules).toEqual([]);

    expect((await updateCompany(db, ctx, added.id, { moduleIds: ["nope"] })).ok).toBe(false);
    expect((await createCompany(db, ctx, { name: "Bad Mod Client", moduleIds: ["nope"] })).ok).toBe(false);
    expect(must(await listCompanies(db, ctx, { q: "Bad Mod Client" }))).toHaveLength(0);
  });

  it("adds a lead's modules to the client, keeps them if the deal is lost, and filters the list by module", async () => {
    const client = must(await createCompany(db, ctx, { name: "Sku Client Two", moduleIds: ["crm-mod-a"] }));
    const deal = must(await createDeal(db, ctx, { companyId: client.id, title: "Add inventory", moduleIds: ["crm-mod-b"] }));
    expect(must(await getCompany(db, ctx, client.id)).modules.map((m) => m.name)).toEqual(["Billing", "Inventory"]);

    must(await transitionDeal(db, ctx, deal.id, { to: "LOST", lostReason: "no budget" }));
    expect(must(await getCompany(db, ctx, client.id)).modules).toHaveLength(2);

    const inventory = must(await listCompanies(db, ctx, { moduleId: "crm-mod-b" })).map((c) => c.name);
    expect(inventory).toEqual(["Sku Client Two"]);
    const billing = must(await listCompanies(db, ctx, { moduleId: "crm-mod-a" })).map((c) => c.name);
    expect(billing).toEqual(["Sku Client Two"]);
    expect(must(await listCompanies(db, ctx, { moduleId: "crm-mod-c" }))).toHaveLength(0);
  });

  it("will not archive a company that still has an open deal", async () => {
    const company = must(await createCompany(db, ctx, { name: "Busy Client" }));
    const deal = must(await createDeal(db, ctx, { companyId: company.id, title: "Open one" }));
    expect(await archiveCompany(db, ctx, company.id)).toMatchObject({ ok: false, code: "CONFLICT" });
    must(await transitionDeal(db, ctx, deal.id, { to: "LOST", lostReason: "no budget" }));
    must(await archiveCompany(db, ctx, company.id));
    expect(await getCompany(db, ctx, company.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("calls and meetings tied to a lead", () => {
  it("stores the lead on a touch or meeting, filters by it, and refuses another client's lead", async () => {
    const client = must(await createCompany(db, ctx, { name: "Activity Client" }));
    const other = must(await createCompany(db, ctx, { name: "Activity Other" }));
    const leadA = must(await createDeal(db, ctx, { companyId: client.id, title: "Lead A" }));
    const leadB = must(await createDeal(db, ctx, { companyId: client.id, title: "Lead B" }));
    const foreign = must(await createDeal(db, ctx, { companyId: other.id, title: "Foreign" }));

    const call = must(
      await createInteraction(db, ctx, client.id, {
        dealId: leadA.id,
        type: "CALL",
        summary: "1st call",
        nextAction: "Send deck",
        nextActionAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
    );
    expect(call.dealId).toBe(leadA.id);
    must(await createInteraction(db, ctx, client.id, { type: "NOTE", summary: "Client-level note" }));
    must(await createInteraction(db, ctx, client.id, { dealId: leadB.id, type: "CALL", summary: "Other lead call" }));
    const meeting = must(await createMeeting(db, ctx, client.id, { dealId: leadA.id, title: "1st meeting", at: new Date().toISOString() }));
    expect(meeting.dealId).toBe(leadA.id);

    expect(must(await listInteractions(db, ctx, client.id, leadA.id)).map((i) => i.summary)).toEqual(["1st call"]);
    expect(must(await listInteractions(db, ctx, client.id)).length).toBe(3);
    expect(must(await listMeetings(db, ctx, client.id, leadA.id)).map((m) => m.title)).toEqual(["1st meeting"]);
    expect(must(await listMeetings(db, ctx, client.id, leadB.id))).toEqual([]);

    expect(await createInteraction(db, ctx, client.id, { dealId: foreign.id, type: "CALL", summary: "x" })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await createMeeting(db, ctx, client.id, { dealId: foreign.id, title: "x", at: new Date().toISOString() })).toMatchObject({ ok: false, code: "VALIDATION" });

    // A next action logged on a lead opens that lead from the follow-up list.
    const due = must(await listDueFollowUps(db, ctx, new Date(Date.now() + 2 * 60 * 60 * 1000))).find((f) => f.id === call.id);
    expect(due).toMatchObject({ kind: "TOUCH", dealId: leadA.id, href: `/sales/${leadA.id}` });
  });
});

describe("tying existing activity to a lead afterwards", () => {
  it("links, unlinks and refuses another client's lead, a missing record and another organisation", async () => {
    const client = must(await createCompany(db, ctx, { name: "Relink Client" }));
    const other = must(await createCompany(db, ctx, { name: "Relink Other" }));
    const lead = must(await createDeal(db, ctx, { companyId: client.id, title: "Relink Lead" }));
    const foreign = must(await createDeal(db, ctx, { companyId: other.id, title: "Relink Foreign" }));
    const touch = must(await createInteraction(db, ctx, client.id, { type: "CALL", summary: "Before the lead existed" }));
    const meeting = must(await createMeeting(db, ctx, client.id, { title: "Intro", at: new Date().toISOString() }));
    expect(touch.dealId).toBeNull();

    expect(must(await setInteractionDeal(db, ctx, client.id, touch.id, { dealId: lead.id })).dealId).toBe(lead.id);
    expect(must(await setMeetingDeal(db, ctx, client.id, meeting.id, { dealId: lead.id })).dealId).toBe(lead.id);
    expect(must(await listInteractions(db, ctx, client.id, lead.id)).map((i) => i.id)).toEqual([touch.id]);

    expect(must(await setInteractionDeal(db, ctx, client.id, touch.id, { dealId: null })).dealId).toBeNull();
    expect(must(await setMeetingDeal(db, ctx, client.id, meeting.id, { dealId: null })).dealId).toBeNull();

    expect(await setInteractionDeal(db, ctx, client.id, touch.id, { dealId: foreign.id })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await setMeetingDeal(db, ctx, client.id, meeting.id, { dealId: foreign.id })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await setInteractionDeal(db, ctx, client.id, touch.id, {})).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await setInteractionDeal(db, ctx, client.id, "missing", { dealId: lead.id })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await setMeetingDeal(db, ctx, client.id, "missing", { dealId: lead.id })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect((await setInteractionDeal(db, otherOrg, client.id, touch.id, { dealId: lead.id })).ok).toBe(false);
    expect((await setMeetingDeal(db, otherOrg, client.id, meeting.id, { dealId: lead.id })).ok).toBe(false);
  });
});

describe("follow-ups from leads", () => {
  const istDay = (offsetDays: number) => {
    const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
  };

  it("lists open leads with a follow-up date alongside logged next actions, and drops them when closed or cleared", async () => {
    const overdueCo = must(await createCompany(db, ctx, { name: "Fu Overdue Co" }));
    const todayCo = must(await createCompany(db, ctx, { name: "Fu Today Co" }));
    const laterCo = must(await createCompany(db, ctx, { name: "Fu Later Co" }));
    const closedCo = must(await createCompany(db, ctx, { name: "Fu Closed Co" }));
    const touchCo = must(await createCompany(db, ctx, { name: "Fu Touch Co" }));

    const overdue = must(await createDeal(db, ctx, { companyId: overdueCo.id, title: "Overdue lead", nextFollowUp: istDay(-2) }));
    const today = must(await createDeal(db, ctx, { companyId: todayCo.id, title: "Today lead", nextFollowUp: istDay(0) }));
    const later = must(await createDeal(db, ctx, { companyId: laterCo.id, title: "Next week lead", nextFollowUp: istDay(4) }));
    const closed = must(await createDeal(db, ctx, { companyId: closedCo.id, title: "Dropped lead", nextFollowUp: istDay(-1) }));
    must(await transitionDeal(db, ctx, closed.id, { to: "LOST", lostReason: "no budget" }));
    must(await createDeal(db, ctx, { companyId: touchCo.id, title: "No date lead" }));
    must(
      await createInteraction(db, ctx, touchCo.id, {
        type: "CALL",
        summary: "Spoke",
        nextAction: "Send brochure",
        nextActionAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
    );

    const due = must(await listDueFollowUps(db, ctx));
    const names = due.map((f) => f.companyName);
    expect(names).toContain("Fu Overdue Co");
    expect(names).toContain("Fu Today Co");
    expect(names).toContain("Fu Touch Co");
    expect(names).not.toContain("Fu Later Co");
    expect(names).not.toContain("Fu Closed Co");

    const lead = due.find((f) => f.companyName === "Fu Overdue Co")!;
    expect(lead).toMatchObject({ kind: "LEAD", allDay: true, dealId: overdue.id, href: `/sales/${overdue.id}`, id: `lead-${overdue.id}` });
    expect(lead.nextAction).toContain("Overdue lead");
    expect(due.find((f) => f.companyName === "Fu Touch Co")).toMatchObject({ kind: "TOUCH", allDay: false, dealId: null, href: `/crm/${touchCo.id}` });
    // Oldest first: the overdue lead comes before today's.
    expect(names.indexOf("Fu Overdue Co")).toBeLessThan(names.indexOf("Fu Today Co"));
    // A lead due today is not overdue until the day is over.
    expect(due.find((f) => f.companyName === "Fu Today Co")!.nextActionAt.getTime()).toBeGreaterThan(Date.now());

    const week = must(await listDueFollowUps(db, ctx, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))).map((f) => f.companyName);
    expect(week).toContain("Fu Later Co");

    must(await updateDeal(db, ctx, today.id, { nextFollowUp: null }));
    must(await updateDeal(db, ctx, later.id, { nextFollowUp: istDay(30) }));
    const after = must(await listDueFollowUps(db, ctx, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))).map((f) => f.companyName);
    expect(after).not.toContain("Fu Today Co");
    expect(after).not.toContain("Fu Later Co");
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

  it("rejects an archived contact and records the interaction, company touch and audit row together", async () => {
    const company = must(await createCompany(db, ctx, { name: "Archive Rule Co" }));
    const contact = must(await createContact(db, ctx, company.id, { name: "Leaver" }));
    const before = must(await getCompany(db, ctx, company.id)).updatedAt;

    must(await archiveContact(db, ctx, company.id, contact.id));
    expect(
      await createInteraction(db, ctx, company.id, { type: "NOTE", summary: "x", contactId: contact.id })
    ).toMatchObject({ ok: false, code: "VALIDATION" });

    const created = must(await createInteraction(db, ctx, company.id, { type: "NOTE", summary: "ok" }));
    const after = must(await getCompany(db, ctx, company.id)).updatedAt;
    expect(new Date(after as string | Date).getTime()).toBeGreaterThanOrEqual(new Date(before as string | Date).getTime());

    const audit = await db
      .select()
      .from(schema.activityLogs)
      .where(eq(schema.activityLogs.entityId, created.id));
    expect(audit.map((a) => a.action)).toEqual(["interaction.created"]);
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
