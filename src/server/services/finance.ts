import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import {
  categoryInputSchema,
  ledgerEntryInputSchema,
  ledgerQuerySchema,
  monthlyQuerySchema,
} from "@/lib/schemas/finance";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";

const { ledgerEntries, expenseCategories, payments } = schema;

function audit(db: Db, ctx: ServiceContext, action: string, id: string, metadata?: Record<string, unknown>) {
  return logActivity(
    { actorId: ctx.userId, action: `ledger.${action}`, module: "finance", entityType: "ledger_entry", entityId: id, metadata },
    db
  );
}

export async function listCategories(db: Db, ctx: ServiceContext) {
  const rows = await db
    .select()
    .from(expenseCategories)
    .where(eq(expenseCategories.orgId, ctx.orgId))
    .orderBy(asc(expenseCategories.name));
  return ok(rows);
}

export async function createCategory(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = categoryInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid category", parsed.error.flatten());
  const inserted = await db
    .insert(expenseCategories)
    .values({ orgId: ctx.orgId, name: parsed.data.name })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) return fail("CONFLICT", "That category already exists");
  return ok(inserted[0]);
}

export async function createEntry(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = ledgerEntryInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid entry", parsed.error.flatten());
  const input = parsed.data;

  if (input.categoryId) {
    const cat = await db
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(and(eq(expenseCategories.id, input.categoryId), eq(expenseCategories.orgId, ctx.orgId)))
      .limit(1);
    if (cat.length === 0) return fail("VALIDATION", "Unknown category");
  }

  const inserted = await db
    .insert(ledgerEntries)
    .values({
      orgId: ctx.orgId,
      kind: input.kind,
      entryDate: input.entryDate,
      amountPaise: input.amountPaise,
      categoryId: input.categoryId ?? null,
      description: input.description,
      companyId: input.companyId ?? null,
      projectId: input.projectId ?? null,
      sourceType: "MANUAL",
      createdBy: ctx.userId,
    })
    .returning();
  await audit(db, ctx, "created", inserted[0].id, { kind: input.kind, amountPaise: input.amountPaise });
  return ok(inserted[0]);
}

export async function listEntries(db: Db, ctx: ServiceContext, rawQuery: unknown = {}) {
  const parsed = ledgerQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return fail("VALIDATION", "Invalid filters", parsed.error.flatten());
  const conditions = [eq(ledgerEntries.orgId, ctx.orgId)];
  if (parsed.data.kind) conditions.push(eq(ledgerEntries.kind, parsed.data.kind));
  if (parsed.data.month) conditions.push(like(ledgerEntries.entryDate, `${parsed.data.month}-%`));
  const rows = await db
    .select()
    .from(ledgerEntries)
    .where(and(...conditions))
    .orderBy(desc(ledgerEntries.entryDate), desc(ledgerEntries.createdAt));
  return ok(rows);
}

/** Only manual entries can be deleted. Automatic ones follow the payment or payout they came from. */
export async function deleteEntry(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .select()
    .from(ledgerEntries)
    .where(and(eq(ledgerEntries.id, id), eq(ledgerEntries.orgId, ctx.orgId)))
    .limit(1);
  const entry = rows[0];
  if (!entry) return fail("NOT_FOUND", "Entry not found");
  if (entry.sourceType !== "MANUAL") return fail("CONFLICT", "Automatic entries cannot be deleted");
  await db.delete(ledgerEntries).where(eq(ledgerEntries.id, id));
  await audit(db, ctx, "deleted", id);
  return ok({ id });
}

/** Income, expense and net per month for one financial year (April to March). All integer paise. */
export async function monthlySummary(db: Db, ctx: ServiceContext, rawQuery: unknown) {
  const parsed = monthlyQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return fail("VALIDATION", "Invalid financial year", parsed.error.flatten());
  const start = parsed.data.fy;
  const from = `${start}-04-01`;
  const to = `${start + 1}-03-31`;

  const rows = await db
    .select({
      month: sql<string>`substr(${ledgerEntries.entryDate}, 1, 7)`,
      kind: ledgerEntries.kind,
      total: sql<number>`coalesce(sum(${ledgerEntries.amountPaise}), 0)`,
    })
    .from(ledgerEntries)
    .where(
      and(
        eq(ledgerEntries.orgId, ctx.orgId),
        sql`${ledgerEntries.entryDate} >= ${from}`,
        sql`${ledgerEntries.entryDate} <= ${to}`
      )
    )
    .groupBy(sql`substr(${ledgerEntries.entryDate}, 1, 7)`, ledgerEntries.kind);

  const months: { month: string; incomePaise: number; expensePaise: number; netPaise: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const m = ((3 + i) % 12) + 1;
    const y = m >= 4 ? start : start + 1;
    const key = `${y}-${String(m).padStart(2, "0")}`;
    const income = Number(rows.find((r) => r.month === key && r.kind === "INCOME")?.total ?? 0);
    const expense = Number(rows.find((r) => r.month === key && r.kind === "EXPENSE")?.total ?? 0);
    months.push({ month: key, incomePaise: income, expensePaise: expense, netPaise: income - expense });
  }
  return ok({
    fy: start,
    months,
    incomePaise: months.reduce((s, m) => s + m.incomePaise, 0),
    expensePaise: months.reduce((s, m) => s + m.expensePaise, 0),
  });
}

/**
 * Writes an INCOME entry for every invoice payment that has none yet. Safe to run repeatedly: the
 * unique source index skips payments already booked. Covers payments recorded before Phase 6.
 */
export async function backfillPaymentEntries(db: Db, ctx: ServiceContext) {
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.orgId, ctx.orgId))
    .orderBy(asc(payments.paidAt));
  let created = 0;
  for (const p of rows) {
    const inserted = await db
      .insert(ledgerEntries)
      .values({
        orgId: ctx.orgId,
        kind: "INCOME",
        entryDate: p.paidAt,
        amountPaise: p.amountPaise,
        description: "Invoice payment",
        sourceType: "PAYMENT",
        sourceId: p.id,
        createdBy: ctx.userId,
      })
      .onConflictDoNothing()
      .returning({ id: ledgerEntries.id });
    created += inserted.length;
  }
  return ok({ created, scanned: rows.length });
}
