import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { newId } from "@/lib/ids";
import { schema, type Db } from "@/server/db/client";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";

const { socialEntries } = schema;

const platformSchema = z.enum(["Instagram", "LinkedIn", "YouTube", "X", "Facebook"]);
const statusSchema = z.enum(["IDEA", "DRAFT", "SCHEDULED", "POSTED"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createSocialEntrySchema = z.object({
  title: z.string().min(1),
  script: z.string().optional().default(""),
  platform: platformSchema,
  date: dateSchema,
  status: statusSchema,
});

export const updateSocialEntrySchema = z.object({
  title: z.string().min(1).optional(),
  script: z.string().optional(),
  platform: platformSchema.optional(),
  date: dateSchema.optional(),
  status: statusSchema.optional(),
});

export type SocialItem = {
  id: string;
  title: string;
  script: string;
  platform: z.infer<typeof platformSchema>;
  date: string;
  status: z.infer<typeof statusSchema>;
};

const rowSchema = z.object({
  id: z.string(),
  title: z.string(),
  script: z.string(),
  platform: platformSchema,
  date: dateSchema,
  status: statusSchema,
});

const columns = {
  id: socialEntries.id,
  title: socialEntries.title,
  script: socialEntries.script,
  platform: socialEntries.platform,
  date: socialEntries.date,
  status: socialEntries.status,
};

/** Rows that fail validation (for example a platform removed from the enum) are skipped. */
function toItem(row: unknown): SocialItem | null {
  const parsed = rowSchema.safeParse(row);
  return parsed.success ? parsed.data : null;
}

async function getItem(db: Db, id: string) {
  const rows = await db.select(columns).from(socialEntries).where(eq(socialEntries.id, id)).limit(1);
  return rows[0] ? toItem(rows[0]) : null;
}

export async function listSocialEntries(db: Db) {
  const rows = await db
    .select(columns)
    .from(socialEntries)
    .orderBy(asc(socialEntries.date), asc(socialEntries.createdAt));

  return ok(rows.map(toItem).filter((row): row is SocialItem => row !== null));
}

export async function createSocialEntry(db: Db, actorId: string, raw: unknown) {
  const parsed = createSocialEntrySchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid content entry", parsed.error.flatten());
  }

  const now = new Date().toISOString();
  const item: SocialItem = { id: newId(), ...parsed.data };

  await db.insert(socialEntries).values({ ...item, createdAt: now, updatedAt: now });
  await logActivity(
    {
      actorId,
      action: "social.entry.created",
      module: "social",
      entityType: "content",
      entityId: item.id,
      metadata: { title: item.title, platform: item.platform, date: item.date, status: item.status },
    },
    db
  );

  return ok(item);
}

export async function updateSocialEntry(db: Db, actorId: string, id: string, raw: unknown) {
  const parsed = updateSocialEntrySchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid content update", parsed.error.flatten());
  }

  const changes = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined)
  ) as Partial<SocialItem>;

  if (Object.keys(changes).length > 0) {
    const updated = await db
      .update(socialEntries)
      .set({ ...changes, updatedAt: new Date().toISOString() })
      .where(and(eq(socialEntries.id, id)))
      .returning({ id: socialEntries.id });

    if (updated.length === 0) {
      return fail("NOT_FOUND", "Content entry not found");
    }

    await logActivity(
      { actorId, action: "social.entry.updated", module: "social", entityType: "content", entityId: id, metadata: changes },
      db
    );
  }

  const item = await getItem(db, id);
  return item ? ok(item) : fail("NOT_FOUND", "Content entry not found");
}

export async function deleteSocialEntry(db: Db, actorId: string, id: string) {
  const deleted = await db.delete(socialEntries).where(eq(socialEntries.id, id)).returning({ id: socialEntries.id });

  if (deleted.length === 0) {
    return fail("NOT_FOUND", "Content entry not found");
  }

  await logActivity(
    { actorId, action: "social.entry.deleted", module: "social", entityType: "content", entityId: id },
    db
  );

  return ok({ id });
}
