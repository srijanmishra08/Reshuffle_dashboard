import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import {
  cancelInvoiceSchema,
  invoiceInputSchema,
  invoiceListQuerySchema,
  invoicePatchSchema,
  issueInvoiceSchema,
  paymentInputSchema,
  type InvoiceItemInput,
} from "@/lib/schemas/billing";
import { newId } from "@/lib/ids";
import { fail, ok, type Result } from "@/server/lib/result";
import { computeTax } from "@/server/services/gst";
import { logActivity } from "@/server/services/activity";
import { nextNumber } from "@/server/services/numbering";
import type { ServiceContext } from "@/server/services/companies";

const { invoices, invoiceItems, payments, creditNotes, companies, orgSettings } = schema;

const DEFAULT_DUE_DAYS = 15;
const OPEN_STATUSES = ["ISSUED", "PARTIALLY_PAID"] as const;

type InvoiceRow = typeof invoices.$inferSelect;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
export type Line = {
  position: number;
  description: string;
  sacCode: string | null;
  quantity: number;
  ratePaise: number;
  amountPaise: number;
  taxable: boolean;
};

export function todayIst(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function priced(items: InvoiceItemInput[]): Line[] {
  return items.map((item, position) => ({
    position,
    description: item.description,
    sacCode: item.sacCode ?? null,
    quantity: item.quantity,
    ratePaise: item.ratePaise,
    amountPaise: item.quantity * item.ratePaise,
    taxable: item.taxable,
  }));
}

export async function loadOrgSettings(db: DbOrTx, orgId: string) {
  const rows = await db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).limit(1);
  return rows[0];
}

export async function loadCompany(db: DbOrTx, orgId: string, companyId: string) {
  const rows = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.orgId, orgId)))
    .limit(1);
  return rows[0];
}

async function fetchItems(db: DbOrTx, invoiceId: string): Promise<Line[]> {
  return db
    .select({
      position: invoiceItems.position,
      description: invoiceItems.description,
      sacCode: invoiceItems.sacCode,
      quantity: invoiceItems.quantity,
      ratePaise: invoiceItems.ratePaise,
      amountPaise: invoiceItems.amountPaise,
      taxable: invoiceItems.taxable,
    })
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceId, invoiceId))
    .orderBy(asc(invoiceItems.position));
}

async function findInvoice(db: DbOrTx, orgId: string, id: string): Promise<InvoiceRow | undefined> {
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.orgId, orgId)))
    .limit(1);
  return rows[0];
}

/** Tax columns for a set of lines. Needs the org state to pick CGST+SGST vs IGST. */
export async function computeTotals(
  db: DbOrTx,
  orgId: string,
  company: typeof companies.$inferSelect,
  lines: Line[],
  placeOfSupplyInput: string | undefined
): Promise<Result<{ columns: Partial<InvoiceRow>; placeOfSupply: string }>> {
  const org = await loadOrgSettings(db, orgId);
  const orgState = org?.stateCode?.trim() ?? "";
  if (!orgState) {
    return fail("VALIDATION", "Set the organisation state in Settings before creating invoices");
  }

  const placeOfSupply = (placeOfSupplyInput?.trim() || company.stateCode || "").toUpperCase();
  const tax = computeTax({
    items: lines.map((l) => ({ amountPaise: l.amountPaise, taxable: l.taxable })),
    orgState,
    placeOfSupply,
    hasGstin: Boolean(company.gstin),
  });

  return ok({
    placeOfSupply,
    columns: {
      taxMode: tax.mode,
      subtotalPaise: tax.subtotal,
      cgstPaise: tax.cgst,
      sgstPaise: tax.sgst,
      igstPaise: tax.igst,
      roundOffPaise: tax.roundOff,
      totalPaise: tax.total,
    },
  });
}

function outstanding(invoice: Pick<InvoiceRow, "status" | "totalPaise" | "paidPaise">): number {
  return invoice.status === "ISSUED" || invoice.status === "PARTIALLY_PAID"
    ? invoice.totalPaise - invoice.paidPaise
    : 0;
}

export async function createInvoice(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = invoiceInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid invoice", parsed.error.flatten());
  }
  const input = parsed.data;

  const company = await loadCompany(db, ctx.orgId, input.companyId);
  if (!company) return fail("NOT_FOUND", "Company not found");

  const lines = priced(input.items);
  const totals = await computeTotals(db, ctx.orgId, company, lines, input.placeOfSupply);
  if (!totals.ok) return totals;

  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(invoices).values({
      id,
      orgId: ctx.orgId,
      companyId: company.id,
      dealId: input.dealId ?? null,
      projectId: input.projectId ?? null,
      placeOfSupply: totals.data.placeOfSupply,
      issueDate: input.issueDate ?? null,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      terms: input.terms ?? null,
      createdBy: ctx.userId,
      ...totals.data.columns,
    });
    await tx.insert(invoiceItems).values(lines.map((line) => ({ ...line, invoiceId: id })));
  });

  await logActivity(
    { actorId: ctx.userId, action: "invoice.created", module: "billing", entityType: "invoice", entityId: id },
    db
  );
  return getInvoice(db, ctx, id);
}

export async function updateInvoice(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = invoicePatchSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION", "Invalid invoice", parsed.error.flatten());
  }
  const patch = parsed.data;

  const existing = await findInvoice(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Invoice not found");
  if (existing.status !== "DRAFT") {
    return fail("CONFLICT", "Issued invoices cannot be edited. Cancel with a credit note instead.");
  }

  const company = await loadCompany(db, ctx.orgId, patch.companyId ?? existing.companyId);
  if (!company) return fail("NOT_FOUND", "Company not found");

  const newLines = patch.items ? priced(patch.items) : null;
  const lines = newLines ?? (await fetchItems(db, id));
  const totals = await computeTotals(
    db,
    ctx.orgId,
    company,
    lines,
    patch.placeOfSupply ?? (patch.companyId ? undefined : existing.placeOfSupply)
  );
  if (!totals.ok) return totals;

  const applied = await db.transaction(async (tx) => {
    // Guarded on DRAFT so a concurrent issue is never overwritten.
    const updated = await tx
      .update(invoices)
      .set({
        companyId: company.id,
        dealId: patch.dealId === undefined ? existing.dealId : patch.dealId,
        projectId: patch.projectId === undefined ? existing.projectId : patch.projectId,
        issueDate: patch.issueDate === undefined ? existing.issueDate : patch.issueDate,
        dueDate: patch.dueDate === undefined ? existing.dueDate : patch.dueDate,
        notes: patch.notes === undefined ? existing.notes : patch.notes,
        terms: patch.terms === undefined ? existing.terms : patch.terms,
        placeOfSupply: totals.data.placeOfSupply,
        updatedAt: new Date(),
        ...totals.data.columns,
      })
      .where(and(eq(invoices.id, id), eq(invoices.status, "DRAFT")))
      .returning({ id: invoices.id });

    if (updated.length === 0) return false;

    if (newLines) {
      await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
      await tx.insert(invoiceItems).values(newLines.map((line) => ({ ...line, invoiceId: id })));
    }
    return true;
  });

  if (!applied) return fail("CONFLICT", "Invoice was issued while editing");

  await logActivity(
    { actorId: ctx.userId, action: "invoice.updated", module: "billing", entityType: "invoice", entityId: id },
    db
  );
  return getInvoice(db, ctx, id);
}

export async function deleteDraftInvoice(db: Db, ctx: ServiceContext, id: string) {
  const existing = await findInvoice(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Invoice not found");
  if (existing.status !== "DRAFT") {
    return fail("CONFLICT", "Only drafts can be deleted. Cancel issued invoices with a credit note.");
  }

  const removed = await db
    .delete(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.status, "DRAFT")))
    .returning({ id: invoices.id });
  if (removed.length === 0) return fail("CONFLICT", "Invoice was issued while deleting");

  await logActivity(
    { actorId: ctx.userId, action: "invoice.deleted", module: "billing", entityType: "invoice", entityId: id },
    db
  );
  return ok({ id });
}

export async function getInvoice(db: Db, ctx: ServiceContext, id: string) {
  const invoice = await findInvoice(db, ctx.orgId, id);
  if (!invoice) return fail("NOT_FOUND", "Invoice not found");

  const [items, paymentRows, creditNoteRows, company] = await Promise.all([
    fetchItems(db, id),
    db.select().from(payments).where(eq(payments.invoiceId, id)).orderBy(asc(payments.paidAt)),
    db.select().from(creditNotes).where(eq(creditNotes.invoiceId, id)),
    loadCompany(db, ctx.orgId, invoice.companyId),
  ]);

  const { snapshotJson, ...rest } = invoice;
  return ok({
    ...rest,
    isIssued: snapshotJson !== null,
    outstandingPaise: outstanding(invoice),
    companyName: company?.name ?? "",
    items,
    payments: paymentRows,
    creditNote: creditNoteRows[0] ?? null,
  });
}

/** Frozen snapshot, used to render the PDF of an issued invoice. */
export async function getInvoiceSnapshot(db: Db, ctx: ServiceContext, id: string) {
  const invoice = await findInvoice(db, ctx.orgId, id);
  if (!invoice) return fail("NOT_FOUND", "Invoice not found");
  if (!invoice.snapshotJson) return fail("CONFLICT", "Invoice has not been issued");
  return ok(invoice.snapshotJson);
}

export async function listInvoices(db: Db, ctx: ServiceContext, rawQuery: unknown = {}) {
  const parsed = invoiceListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return fail("VALIDATION", "Invalid filters", parsed.error.flatten());
  const query = parsed.data;

  const conditions = [eq(invoices.orgId, ctx.orgId)];
  if (query.status) conditions.push(eq(invoices.status, query.status));
  if (query.companyId) conditions.push(eq(invoices.companyId, query.companyId));
  if (query.overdue === "true") conditions.push(isNotNull(invoices.overdueAt));
  if (query.overdue === "false") conditions.push(isNull(invoices.overdueAt));

  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      companyId: invoices.companyId,
      companyName: companies.name,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      totalPaise: invoices.totalPaise,
      paidPaise: invoices.paidPaise,
      overdueAt: invoices.overdueAt,
      updatedAt: invoices.updatedAt,
    })
    .from(invoices)
    .leftJoin(companies, eq(companies.id, invoices.companyId))
    .where(and(...conditions))
    .orderBy(desc(invoices.updatedAt))
    .limit(query.limit)
    .offset(query.offset);

  return ok({ invoices: rows, summary: await receivables(db, ctx.orgId) });
}

/** Money still owed on open invoices, regardless of list filters. */
export async function receivables(db: Db, orgId: string) {
  const sumOutstanding = sql<number>`coalesce(sum(${invoices.totalPaise} - ${invoices.paidPaise}), 0)`;
  const count = sql<number>`count(*)`;
  const open = and(eq(invoices.orgId, orgId), inArray(invoices.status, [...OPEN_STATUSES]));

  const [all, late] = await Promise.all([
    db.select({ outstanding: sumOutstanding, count }).from(invoices).where(open),
    db
      .select({ outstanding: sumOutstanding, count })
      .from(invoices)
      .where(and(open, isNotNull(invoices.overdueAt))),
  ]);

  return {
    outstandingPaise: Number(all[0]?.outstanding ?? 0),
    openCount: Number(all[0]?.count ?? 0),
    overduePaise: Number(late[0]?.outstanding ?? 0),
    overdueCount: Number(late[0]?.count ?? 0),
  };
}

export async function issueInvoice(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = issueInvoiceSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid request", parsed.error.flatten());
  const { idempotencyKey, issueDate: issueDateInput } = parsed.data;

  const existing = await findInvoice(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Invoice not found");

  if (existing.status !== "DRAFT") {
    // A retry of the same request (double click, network retry) gets the same invoice back.
    if (existing.issueKey === idempotencyKey) return getInvoice(db, ctx, id);
    return fail("CONFLICT", "Invoice is already issued");
  }

  const items = await fetchItems(db, id);
  if (items.length === 0) return fail("VALIDATION", "Add at least one line item");

  const company = await loadCompany(db, ctx.orgId, existing.companyId);
  if (!company) return fail("NOT_FOUND", "Company not found");
  const org = await loadOrgSettings(db, ctx.orgId);
  if (!org?.stateCode) {
    return fail("VALIDATION", "Set the organisation state in Settings before issuing");
  }

  const now = new Date();
  const issueDate = issueDateInput ?? existing.issueDate ?? todayIst(now);
  const dueDate = existing.dueDate ?? addDays(issueDate, DEFAULT_DUE_DAYS);

  const issued = await db.transaction(async (tx: Tx) => {
    // Claim the draft first. Only one caller can flip DRAFT -> ISSUED, and if anything
    // below throws, the whole transaction (claim and number) rolls back.
    const claimed = await tx
      .update(invoices)
      .set({ status: "ISSUED", issueKey: idempotencyKey, updatedAt: now })
      .where(and(eq(invoices.id, id), eq(invoices.status, "DRAFT")))
      .returning({ id: invoices.id });
    if (claimed.length === 0) return false;

    const allocated = await nextNumber(tx, {
      orgId: ctx.orgId,
      docType: "INVOICE",
      date: new Date(`${issueDate}T12:00:00+05:30`),
      fyStartMonth: org.fyStartMonth,
    });

    const snapshot = {
      type: "INVOICE",
      number: allocated.number,
      fy: allocated.fy,
      issueDate,
      dueDate,
      seller: {
        legalName: org.legalName,
        address: org.address,
        stateCode: org.stateCode,
        gstin: org.gstin,
        pan: org.pan,
        bankDetails: org.bankDetails,
        signatoryName: org.signatoryName,
        signatoryTitle: org.signatoryTitle,
      },
      buyer: {
        name: company.legalName || company.name,
        address: company.address,
        gstin: company.gstin,
        stateCode: company.stateCode,
      },
      placeOfSupply: existing.placeOfSupply,
      taxMode: existing.taxMode,
      rateBps: existing.rateBps,
      items,
      subtotalPaise: existing.subtotalPaise,
      cgstPaise: existing.cgstPaise,
      sgstPaise: existing.sgstPaise,
      igstPaise: existing.igstPaise,
      roundOffPaise: existing.roundOffPaise,
      totalPaise: existing.totalPaise,
      notes: existing.notes,
      terms: existing.terms ?? org.defaultTerms,
    };

    await tx
      .update(invoices)
      .set({
        number: allocated.number,
        fy: allocated.fy,
        issueDate,
        dueDate,
        issuedAt: now,
        snapshotJson: snapshot,
      })
      .where(eq(invoices.id, id));
    return true;
  });

  if (!issued) {
    // Another request won the race. The same key means it was our own retry.
    const current = await findInvoice(db, ctx.orgId, id);
    if (current?.issueKey === idempotencyKey) return getInvoice(db, ctx, id);
    return fail("CONFLICT", "Invoice is already issued");
  }

  await logActivity(
    { actorId: ctx.userId, action: "invoice.issued", module: "billing", entityType: "invoice", entityId: id },
    db
  );
  return getInvoice(db, ctx, id);
}

export async function recordPayment(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = paymentInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid payment", parsed.error.flatten());
  const input = parsed.data;

  const existing = await findInvoice(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Invoice not found");
  if (existing.status !== "ISSUED" && existing.status !== "PARTIALLY_PAID") {
    return fail("CONFLICT", `Cannot record a payment on a ${existing.status.toLowerCase()} invoice`);
  }
  if (input.amountPaise > existing.totalPaise - existing.paidPaise) {
    return fail("VALIDATION", "Payment is more than the outstanding amount");
  }

  const paymentId = newId();
  const applied = await db.transaction(async (tx) => {
    // The WHERE re-checks the balance, so two concurrent payments cannot overpay.
    const updated = await tx
      .update(invoices)
      .set({
        paidPaise: sql`${invoices.paidPaise} + ${input.amountPaise}`,
        status: sql`case when ${invoices.paidPaise} + ${input.amountPaise} >= ${invoices.totalPaise}
          then 'PAID' else 'PARTIALLY_PAID' end`,
        overdueAt: sql`case when ${invoices.paidPaise} + ${input.amountPaise} >= ${invoices.totalPaise}
          then null else ${invoices.overdueAt} end`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(invoices.id, id),
          inArray(invoices.status, [...OPEN_STATUSES]),
          sql`${invoices.paidPaise} + ${input.amountPaise} <= ${invoices.totalPaise}`
        )
      )
      .returning({ id: invoices.id });
    if (updated.length === 0) return false;

    await tx.insert(payments).values({
      id: paymentId,
      orgId: ctx.orgId,
      invoiceId: id,
      amountPaise: input.amountPaise,
      paidAt: input.paidAt,
      method: input.method,
      reference: input.reference ?? null,
      createdBy: ctx.userId,
    });
    return true;
  });

  if (!applied) return fail("CONFLICT", "Invoice balance changed. Reload and try again.");

  await logActivity(
    {
      actorId: ctx.userId,
      action: "invoice.payment_recorded",
      module: "billing",
      entityType: "invoice",
      entityId: id,
      metadata: { paymentId, amountPaise: input.amountPaise },
    },
    db
  );
  return getInvoice(db, ctx, id);
}

/** Cancel an issued invoice by raising a credit note for the full amount. */
export async function cancelInvoice(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = cancelInvoiceSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid request", parsed.error.flatten());

  const existing = await findInvoice(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Invoice not found");
  if (existing.status === "DRAFT") return fail("CONFLICT", "Drafts are deleted, not cancelled");
  if (existing.status === "CANCELLED") return fail("CONFLICT", "Invoice is already cancelled");
  if (existing.paidPaise > 0) {
    return fail("CONFLICT", "Payments exist on this invoice. Reverse or refund them before cancelling.");
  }

  const org = await loadOrgSettings(db, ctx.orgId);
  const now = new Date();

  const done = await db.transaction(async (tx: Tx) => {
    const claimed = await tx
      .update(invoices)
      .set({ status: "CANCELLED", cancelledAt: now, updatedAt: now })
      .where(
        and(eq(invoices.id, id), inArray(invoices.status, [...OPEN_STATUSES]), eq(invoices.paidPaise, 0))
      )
      .returning({ id: invoices.id });
    if (claimed.length === 0) return false;

    const allocated = await nextNumber(tx, {
      orgId: ctx.orgId,
      docType: "CREDIT_NOTE",
      date: now,
      fyStartMonth: org?.fyStartMonth,
    });
    await tx.insert(creditNotes).values({
      orgId: ctx.orgId,
      invoiceId: id,
      number: allocated.number,
      fy: allocated.fy,
      amountPaise: existing.totalPaise,
      reason: parsed.data.reason,
      issuedAt: now,
      createdBy: ctx.userId,
    });
    return true;
  });

  if (!done) return fail("CONFLICT", "Invoice changed while cancelling. Reload and try again.");

  await logActivity(
    {
      actorId: ctx.userId,
      action: "invoice.cancelled",
      module: "billing",
      entityType: "invoice",
      entityId: id,
      metadata: { reason: parsed.data.reason },
    },
    db
  );
  return getInvoice(db, ctx, id);
}

/** Flag open invoices past their due date. Run daily by cron. */
export async function markOverdue(db: Db, today = todayIst(), orgId?: string) {
  const conditions = [
    inArray(invoices.status, [...OPEN_STATUSES]),
    isNull(invoices.overdueAt),
    isNotNull(invoices.dueDate),
    lt(invoices.dueDate, today),
  ];
  if (orgId) conditions.push(eq(invoices.orgId, orgId));

  const rows = await db
    .update(invoices)
    .set({ overdueAt: new Date() })
    .where(and(...conditions))
    .returning({ id: invoices.id });

  return rows.length;
}
