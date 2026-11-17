import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import { createCompany } from "@/server/services/companies";
import type { ServiceContext } from "@/server/services/companies";
import { createContact } from "@/server/services/contacts";
import { createDeal, transitionDeal } from "@/server/services/deals";
import { deletePipelineItem } from "@/server/services/pipeline-items";
import { createTask } from "@/server/services/project-tasks";

/**
 * Moves cards off the two older kanban boards into the systems that replaced them:
 * the old task board feeds project tasks, the old outreach board feeds clients and deals.
 * A card is removed only after what replaces it has been created.
 */
const { pipelineItems, companies, deliveryProjects, legacyFreelancers, socialEntries, contentItems, socialAccounts } = schema;

export const legacyTaskImportSchema = z.object({
  cardId: z.string().trim().min(1).max(200),
  projectId: z.string().trim().min(1).max(100),
  /** Which older board the card is on. */
  board: z.enum(["projects", "app-dev"]).default("projects"),
});
export const legacyOutreachImportSchema = z.object({ cardId: z.string().trim().min(1).max(200) });

/** How each older board's stages become task columns. Nothing goes to Client review, so the client is never asked early. */
const TASK_STATUS: Record<"projects" | "app-dev", Record<string, string>> = {
  projects: { BACKLOG: "BACKLOG", IN_PROGRESS: "IN_PROGRESS", BLOCKED: "TODO", DONE: "COMPLETED" },
  "app-dev": { BACKLOG: "BACKLOG", IN_SPRINT: "IN_PROGRESS", IN_REVIEW: "IN_PROGRESS", RELEASED: "COMPLETED" },
};

async function findCard(db: Db, module: string, cardId: string) {
  const rows = await db
    .select()
    .from(pipelineItems)
    .where(and(eq(pipelineItems.module, module), eq(pipelineItems.entityId, cardId)))
    .limit(1);
  return rows[0] ?? null;
}

const metaText = (meta: Record<string, unknown> | null, key: string) => {
  const value = meta?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

/** An old task-board card becomes a task on a project. The assignee is kept when it matches a freelancer by name. */
export async function importLegacyTask(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = legacyTaskImportSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Choose a card and a project");
  const { cardId, projectId, board } = parsed.data;

  const card = await findCard(db, board, cardId);
  if (!card) return fail("NOT_FOUND", "That card is no longer on the old board");
  const project = await db
    .select({ id: deliveryProjects.id })
    .from(deliveryProjects)
    .where(and(eq(deliveryProjects.id, projectId), eq(deliveryProjects.orgId, ctx.orgId)))
    .limit(1);
  if (project.length === 0) return fail("NOT_FOUND", "Project not found");

  const assignee = metaText(card.metadata, "assignee");
  const freelancer = assignee
    ? (await db.select({ id: legacyFreelancers.id }).from(legacyFreelancers).where(sql`lower(${legacyFreelancers.freelancer}) = lower(${assignee})`).limit(1))[0]
    : undefined;
  const note = [card.subtitle?.trim(), card.stage === "BLOCKED" ? "Was blocked on the old board." : null, card.stage === "IN_REVIEW" ? "Was in review on the old app development board." : null, assignee && !freelancer ? `Was assigned to ${assignee} on the old board.` : null]
    .filter(Boolean)
    .join("\n");

  const task = await createTask(db, ctx, projectId, {
    title: card.title.slice(0, 200),
    description: note.slice(0, 4000),
    status: TASK_STATUS[board][card.stage] ?? "TODO",
    assigneeId: freelancer?.id ?? null,
  });
  if (!task.ok) return task;
  await deletePipelineItem(board, cardId, db);
  await logActivity({ actorId: ctx.userId, action: "legacy.task_imported", module: "projects", entityType: "task", entityId: task.data.id, metadata: { cardId, projectId, board } }, db);
  return ok({ taskId: task.data.id, projectId });
}

/**
 * An old outreach card becomes a client, with a contact when the card has a phone or email and a deal
 * while the lead is still open. An existing client with the same name is reused rather than duplicated.
 */
export async function importLegacyOutreach(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = legacyOutreachImportSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Choose a card");
  const { cardId } = parsed.data;

  const card = await findCard(db, "outreach", cardId);
  if (!card) return fail("NOT_FOUND", "That card is no longer on the old board");

  const existing = (
    await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.orgId, ctx.orgId), sql`lower(${companies.name}) = lower(${card.title})`))
      .limit(1)
  )[0];

  let companyId = existing?.id;
  const reused = Boolean(existing);
  if (!companyId) {
    const company = await createCompany(db, ctx, {
      name: card.title.slice(0, 200),
      source: "Outreach board",
      notes: card.subtitle ?? "",
      lifecycle: card.stage === "LOST" ? "CLOSED" : "PROSPECT",
    });
    if (!company.ok) return company;
    companyId = company.data.id;
  }

  const phone = metaText(card.metadata, "phone");
  const email = metaText(card.metadata, "email");
  if (!reused && (phone || email)) {
    const contact = await createContact(db, ctx, companyId, { name: (card.subtitle?.trim() || card.title).slice(0, 200), phone, email });
    if (!contact.ok) return contact;
  }

  let dealId: string | null = null;
  if (card.stage !== "WON" && card.stage !== "LOST") {
    const deal = await createDeal(db, ctx, { companyId, title: `${card.title} lead`.slice(0, 200), source: "Outreach board" });
    if (!deal.ok) return deal;
    dealId = deal.data.id;
    if (card.stage === "QUALIFIED" || card.stage === "FOLLOW_UP") {
      const moved = await transitionDeal(db, ctx, dealId, { to: "CONTACTED" });
      if (!moved.ok) return moved;
    }
  }

  await deletePipelineItem("outreach", cardId, db);
  await logActivity({ actorId: ctx.userId, action: "legacy.outreach_imported", module: "sales", entityType: "company", entityId: companyId, metadata: { cardId, dealId, reused } }, db);
  return ok({ companyId, dealId, reused });
}

const PLATFORM: Record<string, string> = { Instagram: "INSTAGRAM", LinkedIn: "LINKEDIN", YouTube: "YOUTUBE", Facebook: "FACEBOOK", X: "X" };
const CONTENT_STATUS: Record<string, string> = { IDEA: "IDEA", DRAFT: "DRAFT", SCHEDULED: "SCHEDULED", POSTED: "PUBLISHED" };

/**
 * Every entry on the older social media calendar becomes a content item on Marketing's calendar, with POSTED becoming
 * PUBLISHED. An item is attached to a Marketing social account when exactly one account exists for its platform;
 * otherwise the platform is written at the top of the caption so it is not lost. Entries are removed only after the
 * copies exist.
 */
export async function importLegacySocial(db: Db, ctx: ServiceContext) {
  const entries = await db.select().from(socialEntries);
  if (entries.length === 0) return ok({ moved: 0, attached: 0 });
  const accounts = await db.select({ id: socialAccounts.id, platform: socialAccounts.platform }).from(socialAccounts).where(eq(socialAccounts.orgId, ctx.orgId));
  const onlyAccountFor = (platform: string) => {
    const matching = accounts.filter((a) => a.platform === (PLATFORM[platform] ?? platform.toUpperCase()));
    return matching.length === 1 ? matching[0].id : null;
  };
  const rows = entries.map((e) => {
    const accountId = onlyAccountFor(e.platform);
    return {
      orgId: ctx.orgId,
      accountId,
      title: e.title,
      caption: [accountId ? null : `Platform: ${e.platform}`, e.script || null].filter(Boolean).join("\n\n") || null,
      status: CONTENT_STATUS[e.status] ?? "IDEA",
      scheduledDate: e.date,
      createdBy: ctx.userId,
    };
  });
  await db.insert(contentItems).values(rows);
  await db.delete(socialEntries).where(inArray(socialEntries.id, entries.map((e) => e.id)));
  await logActivity({ actorId: ctx.userId, action: "legacy.social_imported", module: "marketing", entityType: "content", entityId: "social", metadata: { moved: entries.length } }, db);
  return ok({ moved: entries.length, attached: rows.filter((r) => r.accountId).length });
}
