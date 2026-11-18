import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { eq } from "drizzle-orm";
import { schema, type Db } from "@/server/db/client";
import { getDeal } from "../deals";
import {
  addRegistration,
  addRegistrations,
  addTeamMember,
  createEvent,
  deleteEvent,
  getEvent,
  listEvents,
  makeLeadFromRegistration,
  removeRegistration,
  removeTeamMember,
  updateEvent,
  updateRegistration,
} from "../events";

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

describe("events", () => {
  it("validates input and defaults", async () => {
    expect((await createEvent(db, ctx, { name: "" })).ok).toBe(false);
    expect((await createEvent(db, ctx, { name: "x", docUrl: "javascript:alert(1)" })).ok).toBe(false);
    expect((await createEvent(db, ctx, { name: "x", ticketPricePaise: 1.5 })).ok).toBe(false);
    const e = must(await createEvent(db, ctx, { name: "Fake Workshop", docUrl: "https://example.com/doc" }));
    expect(e.status).toBe("PLANNED");
    expect(e.type).toBe("WORKSHOP");
    expect(e.ticketPricePaise).toBe(0);
  });

  it("moves status and filters the list", async () => {
    const e = must(await createEvent(db, ctx, { name: "Fake Sprint", type: "SPRINT", date: "2026-12-01" }));
    expect(must(await updateEvent(db, ctx, e.id, { status: "CONFIRMED" })).status).toBe("CONFIRMED");
    const confirmed = must(await listEvents(db, ctx, { status: "CONFIRMED" }));
    expect(confirmed.map((x) => x.id)).toContain(e.id);
    expect((await listEvents(db, ctx, { status: "NOPE" })).ok).toBe(false);
  });

  it("manages team members", async () => {
    const e = must(await createEvent(db, ctx, { name: "Team event" }));
    const withTeam = must(await addTeamMember(db, ctx, e.id, { name: "Fake Person", role: "Host" }));
    expect(withTeam.team).toHaveLength(1);
    const memberId = withTeam.team[0].id;
    expect((await removeTeamMember(db, other, e.id, memberId)).ok).toBe(false);
    expect(must(await removeTeamMember(db, ctx, e.id, memberId)).team).toHaveLength(0);
  });

  it("tracks registrations, revenue and capacity", async () => {
    const e = must(await createEvent(db, ctx, { name: "Paid event", capacity: 3, ticketPricePaise: 50_000 }));
    must(await addRegistration(db, ctx, e.id, { name: "Fake A", paid: true }));
    const bulk = must(
      await addRegistrations(db, ctx, e.id, { rows: [{ name: "Fake B" }, { name: "Fake C", paid: true }] })
    );
    expect(bulk.registered).toBe(3);
    expect(bulk.paidCount).toBe(2);
    expect(bulk.revenuePaise).toBe(100_000);

    const full = await addRegistration(db, ctx, e.id, { name: "Fake D" });
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.code).toBe("CONFLICT");

    const reg = bulk.registrations[1];
    const attended = must(await updateRegistration(db, ctx, e.id, reg.id, { paid: true, attended: true }));
    expect(attended.paidCount).toBe(3);
    expect(attended.attendedCount).toBe(1);
    expect(must(await removeRegistration(db, ctx, e.id, reg.id)).registered).toBe(2);

    const listed = must(await listEvents(db, ctx, {})).find((x) => x.id === e.id);
    expect(listed?.registered).toBe(2);
  });

  it("rejects an invalid bulk import without writing any row", async () => {
    const e = must(await createEvent(db, ctx, { name: "Bulk event" }));
    expect((await addRegistrations(db, ctx, e.id, { rows: [{ name: "Fake ok" }, { name: "" }] })).ok).toBe(false);
    expect(must(await getEvent(db, ctx, e.id)).registered).toBe(0);
  });

  it("isolates organisations and cascades on delete", async () => {
    const e = must(await createEvent(db, ctx, { name: "Private event" }));
    must(await addRegistration(db, ctx, e.id, { name: "Fake E" }));
    expect((await getEvent(db, other, e.id)).ok).toBe(false);
    expect((await updateEvent(db, other, e.id, { name: "Hacked" })).ok).toBe(false);
    expect((await addRegistration(db, other, e.id, { name: "Intruder" })).ok).toBe(false);
    expect((await deleteEvent(db, other, e.id)).ok).toBe(false);
    expect(must(await listEvents(db, other, {})).length).toBe(0);
    expect((await deleteEvent(db, ctx, e.id)).ok).toBe(true);
    expect((await getEvent(db, ctx, e.id)).ok).toBe(false);
  });
});

describe("event signups as leads", () => {
  it("turns a signup into one lead, keeps how to reach them, and refuses another organisation", async () => {
    const event = must(await createEvent(db, ctx, { name: "Lead Workshop" }));
    const withRegs = must(await addRegistrations(db, ctx, event.id, { rows: [{ name: "Signup Person", contact: "signup@example.test" }, { name: "No Contact" }] }));
    const [first, second] = withRegs.registrations;

    const made = must(await makeLeadFromRegistration(db, ctx, event.id, first.id));
    expect(made.created).toBe(true);
    const deal = must(await getDeal(db, ctx, made.dealId));
    expect(deal).toMatchObject({ stage: "LEAD", source: "Event", referrer: "Lead Workshop", title: "Signup Person (from Lead Workshop)" });
    expect(deal.company?.name).toBe("Signup Person");
    const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, deal.companyId));
    expect(company.notes).toContain("signup@example.test");

    const again = must(await makeLeadFromRegistration(db, ctx, event.id, first.id));
    expect(again).toEqual({ dealId: made.dealId, created: false });
    expect(must(await getEvent(db, ctx, event.id)).registrations.find((r) => r.id === first.id)?.dealId).toBe(made.dealId);

    const plain = must(await makeLeadFromRegistration(db, ctx, event.id, second.id));
    expect(plain.created).toBe(true);
    expect(plain.dealId).not.toBe(made.dealId);

    expect(await makeLeadFromRegistration(db, other, event.id, first.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await makeLeadFromRegistration(db, ctx, event.id, "nope")).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});
