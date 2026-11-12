import { and, asc, desc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import {
  interactionInputSchema,
  interactionPatchSchema,
  meetingInputSchema,
} from "@/lib/schemas/crm";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import { getCompany, type ServiceContext } from "@/server/services/companies";

const { interactions, meetings, companies, contacts } = schema;

const interactionColumns = {
  id: interactions.id,
  companyId: interactions.companyId,
  contactId: interactions.contactId,
  contactName: contacts.name,
  type: interactions.type,
  summary: interactions.summary,
  at: interactions.at,
  nextAction: interactions.nextAction,
  nextActionAt: interactions.nextActionAt,
  nextActionDoneAt: interactions.nextActionDoneAt,
  createdAt: interactions.createdAt,
};

export async function listInteractions(db: Db, ctx: ServiceContext, companyId: string) {
  const company = await getCompany(db, ctx, companyId);
  if (!company.ok) {
    return company;
  }

  const rows = await db
    .select(interactionColumns)
    .from(interactions)
    .leftJoin(contacts, eq(contacts.id, interactions.contactId))
    .where(and(eq(interactions.companyId, companyId), eq(interactions.orgId, ctx.orgId)))
    .orderBy(desc(interactions.at));

  return ok(rows);
}

async function getInteraction(db: Db, ctx: ServiceContext, companyId: string, id: string) {
  const rows = await db
    .select(interactionColumns)
    .from(interactions)
    .leftJoin(contacts, eq(contacts.id, interactions.contactId))
    .where(
      and(eq(interactions.id, id), eq(interactions.companyId, companyId), eq(interactions.orgId, ctx.orgId))
    )
    .limit(1);

  return rows[0] ? ok(rows[0]) : fail("NOT_FOUND", "Interaction not found");
}

export async function createInteraction(db: Db, ctx: ServiceContext, companyId: string, raw: unknown) {
  const parsed = interactionInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid interaction", parsed.error.flatten());
  }

  const company = await getCompany(db, ctx, companyId);
  if (!company.ok) {
    return company;
  }

  const input = parsed.data;

  if (input.contactId) {
    const contact = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(eq(contacts.id, input.contactId), eq(contacts.companyId, companyId), eq(contacts.orgId, ctx.orgId))
      )
      .limit(1);

    if (contact.length === 0) {
      return fail("VALIDATION", "Contact does not belong to this company");
    }
  }

  if (input.nextActionAt && !input.nextAction) {
    return fail("VALIDATION", "A next-action date needs a description");
  }

  const now = new Date();
  const inserted = await db
    .insert(interactions)
    .values({
      orgId: ctx.orgId,
      companyId,
      contactId: input.contactId ?? null,
      type: input.type,
      summary: input.summary,
      at: input.at ? new Date(input.at) : now,
      nextAction: input.nextAction ?? null,
      nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : null,
      createdBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: interactions.id });

  const id = inserted[0].id;

  // Touching a company bumps it to the top of recent lists.
  await db
    .update(companies)
    .set({ updatedAt: now })
    .where(and(eq(companies.id, companyId), eq(companies.orgId, ctx.orgId)));

  await logActivity(
    {
      actorId: ctx.userId,
      action: "interaction.created",
      module: "crm",
      entityType: "interaction",
      entityId: id,
      metadata: { companyId, type: input.type },
    },
    db
  );

  return getInteraction(db, ctx, companyId, id);
}

/** Mark a pending next action as done (or reopen it). */
export async function setNextActionDone(
  db: Db,
  ctx: ServiceContext,
  companyId: string,
  interactionId: string,
  raw: unknown
) {
  const parsed = interactionPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid update", parsed.error.flatten());
  }

  const existing = await getInteraction(db, ctx, companyId, interactionId);
  if (!existing.ok) {
    return existing;
  }

  if (!existing.data.nextActionAt) {
    return fail("CONFLICT", "This interaction has no next action");
  }

  const now = new Date();
  await db
    .update(interactions)
    .set({ nextActionDoneAt: parsed.data.done ? now : null, updatedAt: now })
    .where(and(eq(interactions.id, interactionId), eq(interactions.orgId, ctx.orgId)));

  await logActivity(
    {
      actorId: ctx.userId,
      action: parsed.data.done ? "interaction.next_action_done" : "interaction.next_action_reopened",
      module: "crm",
      entityType: "interaction",
      entityId: interactionId,
      metadata: { companyId },
    },
    db
  );

  return getInteraction(db, ctx, companyId, interactionId);
}

/** Pending next actions due on or before `until` (default: the next 24 hours, including overdue). */
export async function listDueFollowUps(db: Db, ctx: ServiceContext, until?: Date) {
  const cutoff = until ?? new Date(Date.now() + 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: interactions.id,
      companyId: interactions.companyId,
      companyName: companies.name,
      nextAction: interactions.nextAction,
      nextActionAt: interactions.nextActionAt,
      type: interactions.type,
    })
    .from(interactions)
    .innerJoin(companies, eq(companies.id, interactions.companyId))
    .where(
      and(
        eq(interactions.orgId, ctx.orgId),
        isNotNull(interactions.nextActionAt),
        isNull(interactions.nextActionDoneAt),
        isNull(companies.archivedAt),
        lte(interactions.nextActionAt, cutoff)
      )
    )
    .orderBy(asc(interactions.nextActionAt));

  return ok(rows);
}

export async function listMeetings(db: Db, ctx: ServiceContext, companyId: string) {
  const company = await getCompany(db, ctx, companyId);
  if (!company.ok) {
    return company;
  }

  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.companyId, companyId), eq(meetings.orgId, ctx.orgId)))
    .orderBy(desc(meetings.at));

  return ok(
    rows.map((row) => ({
      id: row.id,
      companyId: row.companyId,
      title: row.title,
      at: row.at,
      location: row.location,
      attendees: row.attendees,
      notes: row.notes,
    }))
  );
}

export async function createMeeting(db: Db, ctx: ServiceContext, companyId: string, raw: unknown) {
  const parsed = meetingInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid meeting", parsed.error.flatten());
  }

  const company = await getCompany(db, ctx, companyId);
  if (!company.ok) {
    return company;
  }

  const input = parsed.data;
  const now = new Date();
  const inserted = await db
    .insert(meetings)
    .values({
      orgId: ctx.orgId,
      companyId,
      title: input.title,
      at: new Date(input.at),
      location: input.location ?? null,
      attendees: input.attendees ?? [],
      notes: input.notes ?? null,
      createdBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: meetings.id });

  const id = inserted[0].id;

  await logActivity(
    { actorId: ctx.userId, action: "meeting.created", module: "crm", entityType: "meeting", entityId: id, metadata: { companyId } },
    db
  );

  const all = await listMeetings(db, ctx, companyId);
  return all.ok ? ok(all.data.find((m) => m.id === id)!) : all;
}
