import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import {
  issueLetterSchema,
  letterInputSchema,
  letterListQuerySchema,
  letterPatchSchema,
} from "@/lib/schemas/letters";
import { newId } from "@/lib/ids";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import { nextNumber } from "@/server/services/numbering";
import { type DbOrTx, loadCompany, loadOrgSettings, todayIst } from "@/server/services/invoices";
import type { ServiceContext } from "@/server/services/companies";

const { letters } = schema;

type LetterRow = typeof letters.$inferSelect;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function findLetter(db: DbOrTx, orgId: string, id: string): Promise<LetterRow | undefined> {
  const rows = await db
    .select()
    .from(letters)
    .where(and(eq(letters.id, id), eq(letters.orgId, orgId)))
    .limit(1);
  return rows[0];
}

function audit(db: Db, ctx: ServiceContext, action: string, id: string) {
  return logActivity(
    { actorId: ctx.userId, action: `letter.${action}`, module: "billing", entityType: "letter", entityId: id },
    db
  );
}

export async function createLetter(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = letterInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid letter", parsed.error.flatten());
  const input = parsed.data;

  if (input.companyId && !(await loadCompany(db, ctx.orgId, input.companyId))) {
    return fail("NOT_FOUND", "Company not found");
  }

  const id = newId();
  await db.insert(letters).values({
    id,
    orgId: ctx.orgId,
    companyId: input.companyId ?? null,
    recipientName: input.recipientName,
    recipientAddress: input.recipientAddress ?? null,
    subject: input.subject,
    body: input.body,
    issueDate: input.issueDate ?? null,
    createdBy: ctx.userId,
  });
  await audit(db, ctx, "created", id);
  return getLetter(db, ctx, id);
}

export async function updateLetter(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = letterPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid letter", parsed.error.flatten());
  const patch = parsed.data;

  const existing = await findLetter(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Letter not found");
  if (existing.status !== "DRAFT") return fail("CONFLICT", "Issued letters cannot be edited.");

  if (patch.companyId && !(await loadCompany(db, ctx.orgId, patch.companyId))) {
    return fail("NOT_FOUND", "Company not found");
  }

  const updated = await db
    .update(letters)
    .set({
      companyId: patch.companyId === undefined ? existing.companyId : patch.companyId,
      recipientName: patch.recipientName ?? existing.recipientName,
      recipientAddress: patch.recipientAddress === undefined ? existing.recipientAddress : patch.recipientAddress,
      subject: patch.subject ?? existing.subject,
      body: patch.body ?? existing.body,
      issueDate: patch.issueDate === undefined ? existing.issueDate : patch.issueDate,
      updatedAt: new Date(),
    })
    .where(and(eq(letters.id, id), eq(letters.status, "DRAFT")))
    .returning({ id: letters.id });
  if (updated.length === 0) return fail("CONFLICT", "Letter was issued while editing");

  await audit(db, ctx, "updated", id);
  return getLetter(db, ctx, id);
}

export async function deleteDraftLetter(db: Db, ctx: ServiceContext, id: string) {
  const existing = await findLetter(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Letter not found");
  if (existing.status !== "DRAFT") return fail("CONFLICT", "Only drafts can be deleted.");

  const removed = await db
    .delete(letters)
    .where(and(eq(letters.id, id), eq(letters.status, "DRAFT")))
    .returning({ id: letters.id });
  if (removed.length === 0) return fail("CONFLICT", "Letter was issued while deleting");

  await audit(db, ctx, "deleted", id);
  return ok({ id });
}

export async function getLetter(db: Db, ctx: ServiceContext, id: string) {
  const letter = await findLetter(db, ctx.orgId, id);
  if (!letter) return fail("NOT_FOUND", "Letter not found");
  const { snapshotJson, issueKey: _issueKey, ...rest } = letter;
  void _issueKey;
  return ok({ ...rest, isIssued: snapshotJson !== null });
}

/** Frozen snapshot, used to render the PDF of an issued letter. */
export async function getLetterSnapshot(db: Db, ctx: ServiceContext, id: string) {
  const letter = await findLetter(db, ctx.orgId, id);
  if (!letter) return fail("NOT_FOUND", "Letter not found");
  if (!letter.snapshotJson) return fail("CONFLICT", "Letter has not been issued");
  return ok(letter.snapshotJson);
}

export async function listLetters(db: Db, ctx: ServiceContext, rawQuery: unknown = {}) {
  const parsed = letterListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return fail("VALIDATION", "Invalid filters", parsed.error.flatten());
  const query = parsed.data;

  const conditions = [eq(letters.orgId, ctx.orgId)];
  if (query.status) conditions.push(eq(letters.status, query.status));

  const rows = await db
    .select({
      id: letters.id,
      number: letters.number,
      status: letters.status,
      recipientName: letters.recipientName,
      subject: letters.subject,
      issueDate: letters.issueDate,
      updatedAt: letters.updatedAt,
    })
    .from(letters)
    .where(and(...conditions))
    .orderBy(desc(letters.updatedAt))
    .limit(query.limit)
    .offset(query.offset);

  return ok(rows);
}

export async function issueLetter(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = issueLetterSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid request", parsed.error.flatten());
  const { idempotencyKey, issueDate: issueDateInput } = parsed.data;

  const existing = await findLetter(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Letter not found");
  if (existing.status !== "DRAFT") {
    // A retry of the same request returns the same letter.
    if (existing.issueKey === idempotencyKey) return getLetter(db, ctx, id);
    return fail("CONFLICT", "Letter is already issued");
  }

  const org = await loadOrgSettings(db, ctx.orgId);
  if (!org) return fail("VALIDATION", "Fill in organisation settings before issuing");

  const now = new Date();
  const issueDate = issueDateInput ?? existing.issueDate ?? todayIst(now);

  const issued = await db.transaction(async (tx: Tx) => {
    const claimed = await tx
      .update(letters)
      .set({ status: "ISSUED", issueKey: idempotencyKey, updatedAt: now })
      .where(and(eq(letters.id, id), eq(letters.status, "DRAFT")))
      .returning({ id: letters.id });
    if (claimed.length === 0) return false;

    const allocated = await nextNumber(tx, {
      orgId: ctx.orgId,
      docType: "LETTER",
      date: new Date(`${issueDate}T12:00:00+05:30`),
      fyStartMonth: org.fyStartMonth,
    });

    const snapshot = {
      type: "LETTER",
      number: allocated.number,
      fy: allocated.fy,
      issueDate,
      seller: { legalName: org.legalName, address: org.address, stateCode: org.stateCode, gstin: org.gstin },
      recipientName: existing.recipientName,
      recipientAddress: existing.recipientAddress,
      subject: existing.subject,
      body: existing.body,
    };

    await tx
      .update(letters)
      .set({
        number: allocated.number,
        fy: allocated.fy,
        issueDate,
        issuedAt: now,
        snapshotJson: snapshot,
      })
      .where(eq(letters.id, id));
    return true;
  });

  if (!issued) {
    const current = await findLetter(db, ctx.orgId, id);
    if (current?.issueKey === idempotencyKey) return getLetter(db, ctx, id);
    return fail("CONFLICT", "Letter is already issued");
  }

  await audit(db, ctx, "issued", id);
  return getLetter(db, ctx, id);
}
