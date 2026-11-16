import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import {
  eventInputSchema,
  eventListQuerySchema,
  eventPatchSchema,
  registrationBulkSchema,
  registrationInputSchema,
  registrationPatchSchema,
  teamMemberInputSchema,
} from "@/lib/schemas/events";
import { newId } from "@/lib/ids";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";

const { events, eventTeam, eventRegistrations } = schema;

function audit(db: Db, ctx: ServiceContext, action: string, id: string) {
  return logActivity(
    { actorId: ctx.userId, action: `event.${action}`, module: "events", entityType: "event", entityId: id },
    db
  );
}

export async function listEvents(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = eventListQuerySchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid query", parsed.error.flatten());
  const conditions = [eq(events.orgId, ctx.orgId)];
  if (parsed.data.status) conditions.push(eq(events.status, parsed.data.status));
  const rows = await db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(asc(events.date), desc(events.createdAt));
  const counts = await db
    .select({
      eventId: eventRegistrations.eventId,
      registered: count(),
      paid: sql<number>`count(*) filter (where ${eventRegistrations.paid})`.mapWith(Number),
    })
    .from(eventRegistrations)
    .where(eq(eventRegistrations.orgId, ctx.orgId))
    .groupBy(eventRegistrations.eventId);
  const byEvent = new Map(counts.map((c) => [c.eventId, c]));
  return ok(
    rows.map((e) => ({
      ...e,
      registered: byEvent.get(e.id)?.registered ?? 0,
      paidCount: byEvent.get(e.id)?.paid ?? 0,
    }))
  );
}

async function findEvent(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.id, id), eq(events.orgId, ctx.orgId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Event with its team, registrations and a revenue figure (paid registrations x ticket price). */
export async function getEvent(db: Db, ctx: ServiceContext, id: string) {
  const event = await findEvent(db, ctx, id);
  if (!event) return fail("NOT_FOUND", "Event not found");
  const [team, registrations] = await Promise.all([
    db
      .select()
      .from(eventTeam)
      .where(and(eq(eventTeam.eventId, id), eq(eventTeam.orgId, ctx.orgId)))
      .orderBy(asc(eventTeam.createdAt)),
    db
      .select()
      .from(eventRegistrations)
      .where(and(eq(eventRegistrations.eventId, id), eq(eventRegistrations.orgId, ctx.orgId)))
      .orderBy(asc(eventRegistrations.createdAt)),
  ]);
  const paidCount = registrations.filter((r) => r.paid).length;
  return ok({
    ...event,
    team,
    registrations,
    registered: registrations.length,
    paidCount,
    attendedCount: registrations.filter((r) => r.attended).length,
    revenuePaise: paidCount * event.ticketPricePaise,
  });
}

export async function createEvent(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = eventInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid event", parsed.error.flatten());
  const id = newId();
  await db.insert(events).values({ id, orgId: ctx.orgId, ...parsed.data, createdBy: ctx.userId });
  await audit(db, ctx, "created", id);
  return getEvent(db, ctx, id);
}

export async function updateEvent(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = eventPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid event", parsed.error.flatten());
  if (!(await findEvent(db, ctx, id))) return fail("NOT_FOUND", "Event not found");
  await db
    .update(events)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(events.id, id), eq(events.orgId, ctx.orgId)));
  await audit(db, ctx, "updated", id);
  return getEvent(db, ctx, id);
}

export async function deleteEvent(db: Db, ctx: ServiceContext, id: string) {
  const removed = await db
    .delete(events)
    .where(and(eq(events.id, id), eq(events.orgId, ctx.orgId)))
    .returning({ id: events.id });
  if (removed.length === 0) return fail("NOT_FOUND", "Event not found");
  await audit(db, ctx, "deleted", id);
  return ok({ id });
}

export async function addTeamMember(db: Db, ctx: ServiceContext, eventId: string, raw: unknown) {
  const parsed = teamMemberInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid team member", parsed.error.flatten());
  if (!(await findEvent(db, ctx, eventId))) return fail("NOT_FOUND", "Event not found");
  await db.insert(eventTeam).values({ orgId: ctx.orgId, eventId, ...parsed.data });
  await audit(db, ctx, "team_added", eventId);
  return getEvent(db, ctx, eventId);
}

export async function removeTeamMember(db: Db, ctx: ServiceContext, eventId: string, memberId: string) {
  const removed = await db
    .delete(eventTeam)
    .where(and(eq(eventTeam.id, memberId), eq(eventTeam.eventId, eventId), eq(eventTeam.orgId, ctx.orgId)))
    .returning({ id: eventTeam.id });
  if (removed.length === 0) return fail("NOT_FOUND", "Team member not found");
  await audit(db, ctx, "team_removed", eventId);
  return getEvent(db, ctx, eventId);
}

export async function addRegistration(db: Db, ctx: ServiceContext, eventId: string, raw: unknown) {
  const parsed = registrationInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid registration", parsed.error.flatten());
  return insertRegistrations(db, ctx, eventId, [parsed.data]);
}

/** Bulk add, used by the CSV import. All rows are validated before any is written. */
export async function addRegistrations(db: Db, ctx: ServiceContext, eventId: string, raw: unknown) {
  const parsed = registrationBulkSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid registrations", parsed.error.flatten());
  return insertRegistrations(db, ctx, eventId, parsed.data.rows);
}

async function insertRegistrations(
  db: Db,
  ctx: ServiceContext,
  eventId: string,
  rows: { name: string; contact?: string | null; paid: boolean; attended: boolean }[]
) {
  const event = await findEvent(db, ctx, eventId);
  if (!event) return fail("NOT_FOUND", "Event not found");
  if (event.capacity != null) {
    const [{ n }] = await db
      .select({ n: count() })
      .from(eventRegistrations)
      .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.orgId, ctx.orgId)));
    if (n + rows.length > event.capacity) {
      return fail("CONFLICT", `Capacity is ${event.capacity}; ${n} already registered`);
    }
  }
  await db.insert(eventRegistrations).values(rows.map((r) => ({ orgId: ctx.orgId, eventId, ...r })));
  await audit(db, ctx, "registrations_added", eventId);
  return getEvent(db, ctx, eventId);
}

export async function updateRegistration(
  db: Db,
  ctx: ServiceContext,
  eventId: string,
  regId: string,
  raw: unknown
) {
  const parsed = registrationPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid registration", parsed.error.flatten());
  const updated = await db
    .update(eventRegistrations)
    .set(parsed.data)
    .where(
      and(
        eq(eventRegistrations.id, regId),
        eq(eventRegistrations.eventId, eventId),
        eq(eventRegistrations.orgId, ctx.orgId)
      )
    )
    .returning({ id: eventRegistrations.id });
  if (updated.length === 0) return fail("NOT_FOUND", "Registration not found");
  await audit(db, ctx, "registration_updated", eventId);
  return getEvent(db, ctx, eventId);
}

export async function removeRegistration(db: Db, ctx: ServiceContext, eventId: string, regId: string) {
  const removed = await db
    .delete(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.id, regId),
        eq(eventRegistrations.eventId, eventId),
        eq(eventRegistrations.orgId, ctx.orgId)
      )
    )
    .returning({ id: eventRegistrations.id });
  if (removed.length === 0) return fail("NOT_FOUND", "Registration not found");
  await audit(db, ctx, "registration_removed", eventId);
  return getEvent(db, ctx, eventId);
}
