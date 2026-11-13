import { and, asc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { personInputSchema, personPatchSchema } from "@/lib/schemas/people";
import { newId } from "@/lib/ids";
import { fail, ok } from "@/server/lib/result";
import { decryptSecret, encryptSecret } from "@/server/lib/crypto";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";

const { people } = schema;
type PersonRow = typeof people.$inferSelect;

/** `canSeeSensitive` is true only for ADMIN. Others get last four digits only. */
export type PeopleViewer = ServiceContext & { canSeeSensitive: boolean };

function present(row: PersonRow, viewer: PeopleViewer) {
  const { panEnc, panLast4, bankAccountEnc, bankAccountLast4, ...rest } = row;
  return {
    ...rest,
    panMasked: panLast4 ? `••••${panLast4}` : null,
    bankAccountMasked: bankAccountLast4 ? `••••${bankAccountLast4}` : null,
    ...(viewer.canSeeSensitive
      ? {
          pan: panEnc ? decryptSecret(panEnc) : null,
          bankAccount: bankAccountEnc ? decryptSecret(bankAccountEnc) : null,
        }
      : {}),
  };
}

function secretColumns(pan?: string | null, bank?: string | null) {
  const out: Partial<typeof people.$inferInsert> = {};
  if (pan !== undefined) {
    out.panEnc = pan ? encryptSecret(pan) : null;
    out.panLast4 = pan ? pan.slice(-4) : null;
  }
  if (bank !== undefined) {
    out.bankAccountEnc = bank ? encryptSecret(bank) : null;
    out.bankAccountLast4 = bank ? bank.slice(-4) : null;
  }
  return out;
}

export async function createPerson(db: Db, ctx: PeopleViewer, raw: unknown) {
  const parsed = personInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid person", parsed.error.flatten());
  const { pan, bankAccount, ...input } = parsed.data;
  const id = newId();
  await db.insert(people).values({
    ...input,
    email: input.email ?? null,
    phone: input.phone ?? null,
    joinedOn: input.joinedOn ?? null,
    bankIfsc: input.bankIfsc ?? null,
    id,
    orgId: ctx.orgId,
    ...secretColumns(pan, bankAccount),
  });
  await logActivity({ actorId: ctx.userId, action: "person.created", module: "people", entityType: "person", entityId: id }, db);
  return getPerson(db, ctx, id);
}

export async function updatePerson(db: Db, ctx: PeopleViewer, id: string, raw: unknown) {
  const parsed = personPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid person", parsed.error.flatten());
  const { pan, bankAccount, ...rest } = parsed.data;
  if ((pan !== undefined || bankAccount !== undefined) && !ctx.canSeeSensitive) {
    return fail("FORBIDDEN", "Only admins can change PAN or bank details");
  }
  const existing = await findPerson(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Person not found");

  const changes: Record<string, unknown> = { updatedAt: new Date(), ...secretColumns(pan, bankAccount) };
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) changes[k] = v;
  await db.update(people).set(changes).where(and(eq(people.id, id), eq(people.orgId, ctx.orgId)));
  await logActivity(
    { actorId: ctx.userId, action: "person.updated", module: "people", entityType: "person", entityId: id, metadata: { fields: Object.keys(parsed.data) } },
    db
  );
  return getPerson(db, ctx, id);
}

async function findPerson(db: Db, orgId: string, id: string) {
  const rows = await db.select().from(people).where(and(eq(people.id, id), eq(people.orgId, orgId))).limit(1);
  return rows[0];
}

export async function getPerson(db: Db, ctx: PeopleViewer, id: string) {
  const row = await findPerson(db, ctx.orgId, id);
  if (!row) return fail("NOT_FOUND", "Person not found");
  return ok(present(row, ctx));
}

export async function listPeople(db: Db, ctx: PeopleViewer) {
  const rows = await db
    .select()
    .from(people)
    .where(and(eq(people.orgId, ctx.orgId), isNull(people.archivedAt)))
    .orderBy(asc(people.name));
  // The list never carries decrypted values, even for admins.
  return ok(rows.map((r) => present(r, { ...ctx, canSeeSensitive: false })));
}
