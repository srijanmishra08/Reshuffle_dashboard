import { and, desc, eq, ne } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import {
  issueSalarySlipSchema,
  salarySlipInputSchema,
  salarySlipListQuerySchema,
  salarySlipPatchSchema,
} from "@/lib/schemas/salary-slips";
import { newId } from "@/lib/ids";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import { nextNumber, type DbOrTx } from "@/server/services/numbering";
import { loadOrgSettings, todayIst } from "@/server/services/invoices";
import type { ServiceContext } from "@/server/services/companies";

const { salarySlips, people } = schema;

type SlipRow = typeof salarySlips.$inferSelect;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type PayLine = { label: string; amountPaise: number };

const sum = (lines: PayLine[]) => lines.reduce((s, l) => s + l.amountPaise, 0);

function figures(earnings: PayLine[], deductions: PayLine[]) {
  const grossPaise = sum(earnings);
  const deductionsPaise = sum(deductions);
  return { grossPaise, deductionsPaise, netPaise: grossPaise - deductionsPaise };
}

async function findSlip(db: DbOrTx, orgId: string, id: string): Promise<SlipRow | undefined> {
  const rows = await db
    .select()
    .from(salarySlips)
    .where(and(eq(salarySlips.id, id), eq(salarySlips.orgId, orgId)))
    .limit(1);
  return rows[0];
}

async function findPerson(db: DbOrTx, orgId: string, id: string) {
  const rows = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.orgId, orgId)))
    .limit(1);
  return rows[0];
}

function audit(db: Db, ctx: ServiceContext, action: string, id: string) {
  return logActivity(
    { actorId: ctx.userId, action: `salary_slip.${action}`, module: "people", entityType: "salary_slip", entityId: id },
    db
  );
}

/** Another slip (draft or issued) for the same person and month. */
async function duplicateExists(db: DbOrTx, orgId: string, personId: string, payPeriod: string, exceptId?: string) {
  const conditions = [
    eq(salarySlips.orgId, orgId),
    eq(salarySlips.personId, personId),
    eq(salarySlips.payPeriod, payPeriod),
  ];
  if (exceptId) conditions.push(ne(salarySlips.id, exceptId));
  const rows = await db.select({ id: salarySlips.id }).from(salarySlips).where(and(...conditions)).limit(1);
  return rows.length > 0;
}

/** Callers must already have checked ADMIN: salary data is admin only. */
export async function createSalarySlip(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = salarySlipInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid salary slip", parsed.error.flatten());
  const input = parsed.data;

  if (!(await findPerson(db, ctx.orgId, input.personId))) return fail("NOT_FOUND", "Person not found");
  if (await duplicateExists(db, ctx.orgId, input.personId, input.payPeriod)) {
    return fail("CONFLICT", "A salary slip already exists for this person and month");
  }

  const id = newId();
  await db.insert(salarySlips).values({
    id,
    orgId: ctx.orgId,
    personId: input.personId,
    payPeriod: input.payPeriod,
    payDate: input.payDate ?? null,
    earningsJson: JSON.stringify(input.earnings),
    deductionsJson: JSON.stringify(input.deductions),
    ...figures(input.earnings, input.deductions),
    createdBy: ctx.userId,
  });
  await audit(db, ctx, "created", id);
  return getSalarySlip(db, ctx, id);
}

export async function updateSalarySlip(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = salarySlipPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid salary slip", parsed.error.flatten());
  const patch = parsed.data;

  const existing = await findSlip(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Salary slip not found");
  if (existing.status !== "DRAFT") return fail("CONFLICT", "Issued salary slips cannot be edited.");

  const earnings = patch.earnings ?? (JSON.parse(existing.earningsJson) as PayLine[]);
  const deductions = patch.deductions ?? (JSON.parse(existing.deductionsJson) as PayLine[]);
  const f = figures(earnings, deductions);
  if (f.netPaise < 0) return fail("VALIDATION", "Deductions cannot exceed gross earnings");

  const updated = await db
    .update(salarySlips)
    .set({
      payDate: patch.payDate === undefined ? existing.payDate : patch.payDate,
      earningsJson: JSON.stringify(earnings),
      deductionsJson: JSON.stringify(deductions),
      ...f,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(salarySlips.id, id), eq(salarySlips.status, "DRAFT")))
    .returning({ id: salarySlips.id });
  if (updated.length === 0) return fail("CONFLICT", "Salary slip was issued while editing");

  await audit(db, ctx, "updated", id);
  return getSalarySlip(db, ctx, id);
}

export async function deleteDraftSalarySlip(db: Db, ctx: ServiceContext, id: string) {
  const existing = await findSlip(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Salary slip not found");
  if (existing.status !== "DRAFT") return fail("CONFLICT", "Only drafts can be deleted.");

  const removed = await db
    .delete(salarySlips)
    .where(and(eq(salarySlips.id, id), eq(salarySlips.status, "DRAFT")))
    .returning({ id: salarySlips.id });
  if (removed.length === 0) return fail("CONFLICT", "Salary slip was issued while deleting");

  await audit(db, ctx, "deleted", id);
  return ok({ id });
}

export async function getSalarySlip(db: Db, ctx: ServiceContext, id: string) {
  const slip = await findSlip(db, ctx.orgId, id);
  if (!slip) return fail("NOT_FOUND", "Salary slip not found");
  const { earningsJson, deductionsJson, snapshotJson, issueKey: _issueKey, ...rest } = slip;
  void _issueKey;
  return ok({
    ...rest,
    earnings: JSON.parse(earningsJson) as PayLine[],
    deductions: JSON.parse(deductionsJson) as PayLine[],
    isIssued: snapshotJson !== null,
  });
}

export async function getSalarySlipSnapshot(db: Db, ctx: ServiceContext, id: string) {
  const slip = await findSlip(db, ctx.orgId, id);
  if (!slip) return fail("NOT_FOUND", "Salary slip not found");
  if (!slip.snapshotJson) return fail("CONFLICT", "Salary slip has not been issued");
  return ok(JSON.parse(slip.snapshotJson) as Record<string, unknown>);
}

export async function listSalarySlips(db: Db, ctx: ServiceContext, rawQuery: unknown = {}) {
  const parsed = salarySlipListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return fail("VALIDATION", "Invalid filters", parsed.error.flatten());
  const query = parsed.data;

  const conditions = [eq(salarySlips.orgId, ctx.orgId)];
  if (query.personId) conditions.push(eq(salarySlips.personId, query.personId));
  if (query.status) conditions.push(eq(salarySlips.status, query.status));

  const rows = await db
    .select({
      id: salarySlips.id,
      personId: salarySlips.personId,
      personName: people.name,
      payPeriod: salarySlips.payPeriod,
      status: salarySlips.status,
      number: salarySlips.number,
      grossPaise: salarySlips.grossPaise,
      netPaise: salarySlips.netPaise,
    })
    .from(salarySlips)
    .innerJoin(people, eq(people.id, salarySlips.personId))
    .where(and(...conditions))
    .orderBy(desc(salarySlips.payPeriod), desc(salarySlips.createdAt))
    .limit(query.limit)
    .offset(query.offset);
  return ok(rows);
}

export async function issueSalarySlip(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = issueSalarySlipSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid request", parsed.error.flatten());
  const { idempotencyKey, payDate: payDateInput } = parsed.data;

  const existing = await findSlip(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Salary slip not found");
  if (existing.status !== "DRAFT") {
    if (existing.issueKey === idempotencyKey) return getSalarySlip(db, ctx, id);
    return fail("CONFLICT", "Salary slip is already issued");
  }

  const person = await findPerson(db, ctx.orgId, existing.personId);
  if (!person) return fail("NOT_FOUND", "Person not found");
  const org = await loadOrgSettings(db, ctx.orgId);
  if (!org) return fail("VALIDATION", "Fill in organisation settings before issuing");

  const now = new Date();
  const payDate = payDateInput ?? existing.payDate ?? todayIst(now);

  const issued = await db.transaction(async (tx: Tx) => {
    const claimed = await tx
      .update(salarySlips)
      .set({ status: "ISSUED", issueKey: idempotencyKey, updatedAt: now.toISOString() })
      .where(and(eq(salarySlips.id, id), eq(salarySlips.status, "DRAFT")))
      .returning({ id: salarySlips.id });
    if (claimed.length === 0) return false;

    const allocated = await nextNumber(tx, {
      orgId: ctx.orgId,
      docType: "SALARY_SLIP",
      date: new Date(`${payDate}T12:00:00+05:30`),
      fyStartMonth: org.fyStartMonth,
    });

    const snapshot = {
      type: "SALARY_SLIP",
      number: allocated.number,
      fy: allocated.fy,
      issueDate: payDate,
      payPeriod: existing.payPeriod,
      seller: { legalName: org.legalName, address: org.address, stateCode: org.stateCode, gstin: org.gstin },
      employee: {
        name: person.name,
        role: person.role,
        joinedOn: person.joinedOn,
        panMasked: person.panLast4 ? `XXXXXX${person.panLast4}` : null,
        bankAccountMasked: person.bankAccountLast4 ? `XXXXXXXX${person.bankAccountLast4}` : null,
        bankIfsc: person.bankIfsc,
      },
      earnings: JSON.parse(existing.earningsJson) as PayLine[],
      deductions: JSON.parse(existing.deductionsJson) as PayLine[],
      grossPaise: existing.grossPaise,
      deductionsPaise: existing.deductionsPaise,
      netPaise: existing.netPaise,
    };

    await tx
      .update(salarySlips)
      .set({
        number: allocated.number,
        fy: allocated.fy,
        payDate,
        issuedAt: now.toISOString(),
        snapshotJson: JSON.stringify(snapshot),
      })
      .where(eq(salarySlips.id, id));
    return true;
  });

  if (!issued) {
    const current = await findSlip(db, ctx.orgId, id);
    if (current?.issueKey === idempotencyKey) return getSalarySlip(db, ctx, id);
    return fail("CONFLICT", "Salary slip is already issued");
  }

  await audit(db, ctx, "issued", id);
  return getSalarySlip(db, ctx, id);
}
