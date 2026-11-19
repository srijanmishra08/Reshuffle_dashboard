import { and, desc, eq, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import {
  dealLinkSchema,
  interactionInputSchema,
  interactionPatchSchema,
  meetingInputSchema,
} from "@/lib/schemas/crm";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import { getCompany, type ServiceContext } from "@/server/services/companies";
import { dealStageLabels, openDealStages, type DealStage } from "@/server/models/deals";

const { interactions, meetings, companies, contacts, deals } = schema;

const interactionColumns = {
  id: interactions.id,
  companyId: interactions.companyId,
  contactId: interactions.contactId,
  contactName: contacts.name,
  dealId: interactions.dealId,
  type: interactions.type,
  summary: interactions.summary,
  at: interactions.at,
  nextAction: interactions.nextAction,
  nextActionAt: interactions.nextActionAt,
  nextActionDoneAt: interactions.nextActionDoneAt,
  createdAt: interactions.createdAt,
};

/** True when the deal exists in this organisation and belongs to this company. */
async function dealBelongsTo(db: Db, orgId: string, companyId: string, dealId: string): Promise<boolean> {
  const rows = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.id, dealId), eq(deals.companyId, companyId), eq(deals.orgId, orgId)))
    .limit(1);
  return rows.length > 0;
}

export async function listInteractions(db: Db, ctx: ServiceContext, companyId: string, dealId?: string | null) {
  const company = await getCompany(db, ctx, companyId);
  if (!company.ok) {
    return company;
  }

  const rows = await db
    .select(interactionColumns)
    .from(interactions)
    .leftJoin(contacts, eq(contacts.id, interactions.contactId))
    .where(and(eq(interactions.companyId, companyId), eq(interactions.orgId, ctx.orgId), dealId ? eq(interactions.dealId, dealId) : undefined))
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
        and(
          eq(contacts.id, input.contactId),
          eq(contacts.companyId, companyId),
          eq(contacts.orgId, ctx.orgId),
          isNull(contacts.archivedAt)
        )
      )
      .limit(1);

    if (contact.length === 0) {
      return fail("VALIDATION", "Contact does not belong to this company or is archived");
    }
  }

  if (input.nextActionAt && !input.nextAction) {
    return fail("VALIDATION", "A next-action date needs a description");
  }

  if (input.dealId && !(await dealBelongsTo(db, ctx.orgId, companyId, input.dealId))) {
    return fail("VALIDATION", "That lead does not belong to this company");
  }

  const now = new Date();
  // Insert, touch the company and audit together: all or nothing.
  const id = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(interactions)
      .values({
        orgId: ctx.orgId,
        companyId,
        contactId: input.contactId ?? null,
        dealId: input.dealId ?? null,
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

    const newId = inserted[0].id;

    // Touching a company bumps it to the top of recent lists.
    await tx
      .update(companies)
      .set({ updatedAt: now })
      .where(and(eq(companies.id, companyId), eq(companies.orgId, ctx.orgId)));

    await logActivity(
      {
        actorId: ctx.userId,
        action: "interaction.created",
        module: "crm",
        entityType: "interaction",
        entityId: newId,
        metadata: { companyId, type: input.type },
      },
      tx
    );

    return newId;
  });

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

export type DueFollowUp = {
  /** Unique across both kinds: a logged touch uses its interaction id, a lead uses `lead-<deal id>`. */
  id: string;
  /** `TOUCH` is a next action logged on a client; `LEAD` is the next follow-up date on an open deal. */
  kind: "TOUCH" | "LEAD";
  companyId: string;
  companyName: string;
  dealId: string | null;
  nextAction: string | null;
  nextActionAt: Date;
  /** A lead's follow-up is a calendar day, not a time. */
  allDay: boolean;
  type: string;
  /** Where to act on it: the client page for a touch, the deal page for a lead. */
  href: string;
};

const istDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);

/**
 * Everything the team has promised to do next, from both places it is recorded: next actions logged on a client
 * (due on or before `until`, default the next 24 hours) and the follow-up date on every open deal. Overdue items are
 * always included. A lead's date counts as due until the end of that day, India time.
 */
export async function listDueFollowUps(db: Db, ctx: ServiceContext, until?: Date) {
  const now = new Date();
  const cutoff = until ?? new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [touches, leads] = await Promise.all([
    db
      .select({
        id: interactions.id,
        companyId: interactions.companyId,
        companyName: companies.name,
        dealId: interactions.dealId,
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
      ),
    db
      .select({
        id: deals.id,
        title: deals.title,
        stage: deals.stage,
        nextFollowUp: deals.nextFollowUp,
        companyId: deals.companyId,
        companyName: companies.name,
      })
      .from(deals)
      .innerJoin(companies, eq(companies.id, deals.companyId))
      .where(
        and(
          eq(deals.orgId, ctx.orgId),
          inArray(deals.stage, [...openDealStages]),
          isNotNull(deals.nextFollowUp),
          lte(deals.nextFollowUp, istDay(cutoff)),
          isNull(companies.archivedAt)
        )
      ),
  ]);

  const today = istDay(now);
  const items: DueFollowUp[] = [
    ...touches.flatMap((t) =>
      t.nextActionAt
        ? [{ id: t.id, kind: "TOUCH" as const, companyId: t.companyId, companyName: t.companyName, dealId: t.dealId, nextAction: t.nextAction, nextActionAt: t.nextActionAt, allDay: false, type: t.type, href: t.dealId ? `/sales/${t.dealId}` : `/crm/${t.companyId}` }]
        : []
    ),
    ...leads.flatMap((l) => {
      if (!l.nextFollowUp) return [];
      const dueAt = new Date(`${l.nextFollowUp}T23:59:59+05:30`);
      if (l.nextFollowUp > today && dueAt > cutoff) return [];
      return [
        {
          id: `lead-${l.id}`,
          kind: "LEAD" as const,
          companyId: l.companyId,
          companyName: l.companyName,
          dealId: l.id,
          nextAction: `Follow up: ${l.title} (${dealStageLabels[l.stage as DealStage] ?? l.stage})`,
          nextActionAt: dueAt,
          allDay: true,
          type: "LEAD",
          href: `/sales/${l.id}`,
        },
      ];
    }),
  ];

  items.sort((a, b) => a.nextActionAt.getTime() - b.nextActionAt.getTime());
  return ok(items);
}

export async function listMeetings(db: Db, ctx: ServiceContext, companyId: string, dealId?: string | null) {
  const company = await getCompany(db, ctx, companyId);
  if (!company.ok) {
    return company;
  }

  const rows = await db
    .select()
    .from(meetings)
    .where(and(eq(meetings.companyId, companyId), eq(meetings.orgId, ctx.orgId), dealId ? eq(meetings.dealId, dealId) : undefined))
    .orderBy(desc(meetings.at));

  return ok(
    rows.map((row) => ({
      id: row.id,
      companyId: row.companyId,
      dealId: row.dealId,
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
  if (input.dealId && !(await dealBelongsTo(db, ctx.orgId, companyId, input.dealId))) {
    return fail("VALIDATION", "That lead does not belong to this company");
  }
  const now = new Date();
  const inserted = await db
    .insert(meetings)
    .values({
      orgId: ctx.orgId,
      companyId,
      dealId: input.dealId ?? null,
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

/** Tie an already-logged touch to one of the client's leads, or untie it with `dealId: null`. */
export async function setInteractionDeal(db: Db, ctx: ServiceContext, companyId: string, interactionId: string, raw: unknown) {
  const parsed = dealLinkSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid lead", parsed.error.flatten());

  const existing = await getInteraction(db, ctx, companyId, interactionId);
  if (!existing.ok) return existing;

  const { dealId } = parsed.data;
  if (dealId && !(await dealBelongsTo(db, ctx.orgId, companyId, dealId))) {
    return fail("VALIDATION", "That lead does not belong to this company");
  }

  await db
    .update(interactions)
    .set({ dealId, updatedAt: new Date() })
    .where(and(eq(interactions.id, interactionId), eq(interactions.orgId, ctx.orgId)));
  await logActivity(
    { actorId: ctx.userId, action: "interaction.deal_linked", module: "crm", entityType: "interaction", entityId: interactionId, metadata: { companyId, dealId } },
    db
  );
  return getInteraction(db, ctx, companyId, interactionId);
}

/** Tie an already-logged meeting to one of the client's leads, or untie it with `dealId: null`. */
export async function setMeetingDeal(db: Db, ctx: ServiceContext, companyId: string, meetingId: string, raw: unknown) {
  const parsed = dealLinkSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid lead", parsed.error.flatten());

  const company = await getCompany(db, ctx, companyId);
  if (!company.ok) return company;

  const found = await db
    .select({ id: meetings.id })
    .from(meetings)
    .where(and(eq(meetings.id, meetingId), eq(meetings.companyId, companyId), eq(meetings.orgId, ctx.orgId)))
    .limit(1);
  if (found.length === 0) return fail("NOT_FOUND", "Meeting not found");

  const { dealId } = parsed.data;
  if (dealId && !(await dealBelongsTo(db, ctx.orgId, companyId, dealId))) {
    return fail("VALIDATION", "That lead does not belong to this company");
  }

  await db
    .update(meetings)
    .set({ dealId, updatedAt: new Date() })
    .where(and(eq(meetings.id, meetingId), eq(meetings.orgId, ctx.orgId)));
  await logActivity(
    { actorId: ctx.userId, action: "meeting.deal_linked", module: "crm", entityType: "meeting", entityId: meetingId, metadata: { companyId, dealId } },
    db
  );
  const all = await listMeetings(db, ctx, companyId);
  return all.ok ? ok(all.data.find((m) => m.id === meetingId)!) : all;
}
