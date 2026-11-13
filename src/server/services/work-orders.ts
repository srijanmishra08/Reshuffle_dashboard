import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import {
  cancelWorkOrderSchema,
  completeWorkOrderSchema,
  issueWorkOrderSchema,
  workOrderInputSchema,
  workOrderListQuerySchema,
  workOrderPatchSchema,
} from "@/lib/schemas/work-orders";
import { newId } from "@/lib/ids";
import { fail, ok } from "@/server/lib/result";
import { logActivity } from "@/server/services/activity";
import { nextNumber } from "@/server/services/numbering";
import {
  computeTotals,
  type DbOrTx,
  loadCompany,
  loadOrgSettings,
  priced,
  todayIst,
  type Line,
} from "@/server/services/invoices";
import type { ServiceContext } from "@/server/services/companies";

const { workOrders, workOrderItems, companies } = schema;

type WorkOrderRow = typeof workOrders.$inferSelect;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function fetchItems(db: DbOrTx, workOrderId: string): Promise<Line[]> {
  return db
    .select({
      position: workOrderItems.position,
      description: workOrderItems.description,
      sacCode: workOrderItems.sacCode,
      quantity: workOrderItems.quantity,
      ratePaise: workOrderItems.ratePaise,
      amountPaise: workOrderItems.amountPaise,
      taxable: workOrderItems.taxable,
    })
    .from(workOrderItems)
    .where(eq(workOrderItems.workOrderId, workOrderId))
    .orderBy(asc(workOrderItems.position));
}

async function findWorkOrder(db: DbOrTx, orgId: string, id: string): Promise<WorkOrderRow | undefined> {
  const rows = await db
    .select()
    .from(workOrders)
    .where(and(eq(workOrders.id, id), eq(workOrders.orgId, orgId)))
    .limit(1);
  return rows[0];
}

function audit(db: Db, ctx: ServiceContext, action: string, id: string, metadata?: Record<string, unknown>) {
  return logActivity(
    {
      actorId: ctx.userId,
      action: `work_order.${action}`,
      module: "billing",
      entityType: "work_order",
      entityId: id,
      metadata,
    },
    db
  );
}

export async function createWorkOrder(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = workOrderInputSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid work order", parsed.error.flatten());
  const input = parsed.data;

  const company = await loadCompany(db, ctx.orgId, input.companyId);
  if (!company) return fail("NOT_FOUND", "Company not found");

  const lines = priced(input.items);
  const totals = await computeTotals(db, ctx.orgId, company, lines, input.placeOfSupply);
  if (!totals.ok) return totals;

  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(workOrders).values({
      id,
      orgId: ctx.orgId,
      companyId: company.id,
      dealId: input.dealId ?? null,
      projectId: input.projectId ?? null,
      customerRef: input.customerRef ?? null,
      requestedBy: input.requestedBy ?? null,
      department: input.department ?? null,
      jobDetails: input.jobDetails ?? null,
      comments: input.comments ?? null,
      issueDate: input.issueDate ?? null,
      placeOfSupply: totals.data.placeOfSupply,
      createdBy: ctx.userId,
      ...totals.data.columns,
    });
    await tx.insert(workOrderItems).values(lines.map((line) => ({ ...line, workOrderId: id })));
  });

  await audit(db, ctx, "created", id);
  return getWorkOrder(db, ctx, id);
}

export async function updateWorkOrder(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = workOrderPatchSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid work order", parsed.error.flatten());
  const patch = parsed.data;

  const existing = await findWorkOrder(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Work order not found");
  if (existing.status !== "DRAFT") {
    return fail("CONFLICT", "Issued work orders cannot be edited. Cancel and raise a new one.");
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
    const updated = await tx
      .update(workOrders)
      .set({
        companyId: company.id,
        dealId: patch.dealId === undefined ? existing.dealId : patch.dealId,
        projectId: patch.projectId === undefined ? existing.projectId : patch.projectId,
        customerRef: patch.customerRef === undefined ? existing.customerRef : patch.customerRef,
        requestedBy: patch.requestedBy === undefined ? existing.requestedBy : patch.requestedBy,
        department: patch.department === undefined ? existing.department : patch.department,
        jobDetails: patch.jobDetails === undefined ? existing.jobDetails : patch.jobDetails,
        comments: patch.comments === undefined ? existing.comments : patch.comments,
        issueDate: patch.issueDate === undefined ? existing.issueDate : patch.issueDate,
        placeOfSupply: totals.data.placeOfSupply,
        updatedAt: new Date(),
        ...totals.data.columns,
      })
      .where(and(eq(workOrders.id, id), eq(workOrders.status, "DRAFT")))
      .returning({ id: workOrders.id });
    if (updated.length === 0) return false;

    if (newLines) {
      await tx.delete(workOrderItems).where(eq(workOrderItems.workOrderId, id));
      await tx.insert(workOrderItems).values(newLines.map((line) => ({ ...line, workOrderId: id })));
    }
    return true;
  });

  if (!applied) return fail("CONFLICT", "Work order was issued while editing");

  await audit(db, ctx, "updated", id);
  return getWorkOrder(db, ctx, id);
}

export async function deleteDraftWorkOrder(db: Db, ctx: ServiceContext, id: string) {
  const existing = await findWorkOrder(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Work order not found");
  if (existing.status !== "DRAFT") {
    return fail("CONFLICT", "Only drafts can be deleted. Cancel issued work orders instead.");
  }

  const removed = await db
    .delete(workOrders)
    .where(and(eq(workOrders.id, id), eq(workOrders.status, "DRAFT")))
    .returning({ id: workOrders.id });
  if (removed.length === 0) return fail("CONFLICT", "Work order was issued while deleting");

  await audit(db, ctx, "deleted", id);
  return ok({ id });
}

export async function getWorkOrder(db: Db, ctx: ServiceContext, id: string) {
  const workOrder = await findWorkOrder(db, ctx.orgId, id);
  if (!workOrder) return fail("NOT_FOUND", "Work order not found");

  const [items, company] = await Promise.all([
    fetchItems(db, id),
    loadCompany(db, ctx.orgId, workOrder.companyId),
  ]);
  const { snapshotJson, ...rest } = workOrder;
  return ok({ ...rest, isIssued: snapshotJson !== null, companyName: company?.name ?? "", items });
}

/** Frozen snapshot, used to render the PDF of an issued work order. */
export async function getWorkOrderSnapshot(db: Db, ctx: ServiceContext, id: string) {
  const workOrder = await findWorkOrder(db, ctx.orgId, id);
  if (!workOrder) return fail("NOT_FOUND", "Work order not found");
  if (!workOrder.snapshotJson) return fail("CONFLICT", "Work order has not been issued");
  return ok(workOrder.snapshotJson);
}

export async function listWorkOrders(db: Db, ctx: ServiceContext, rawQuery: unknown = {}) {
  const parsed = workOrderListQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return fail("VALIDATION", "Invalid filters", parsed.error.flatten());
  const query = parsed.data;

  const conditions = [eq(workOrders.orgId, ctx.orgId)];
  if (query.status) conditions.push(eq(workOrders.status, query.status));
  if (query.companyId) conditions.push(eq(workOrders.companyId, query.companyId));

  const rows = await db
    .select({
      id: workOrders.id,
      number: workOrders.number,
      status: workOrders.status,
      companyId: workOrders.companyId,
      companyName: companies.name,
      issueDate: workOrders.issueDate,
      completedDate: workOrders.completedDate,
      totalPaise: workOrders.totalPaise,
      updatedAt: workOrders.updatedAt,
    })
    .from(workOrders)
    .leftJoin(companies, eq(companies.id, workOrders.companyId))
    .where(and(...conditions))
    .orderBy(desc(workOrders.updatedAt))
    .limit(query.limit)
    .offset(query.offset);

  return ok(rows);
}

export async function issueWorkOrder(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = issueWorkOrderSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid request", parsed.error.flatten());
  const { idempotencyKey, issueDate: issueDateInput } = parsed.data;

  const existing = await findWorkOrder(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Work order not found");
  if (existing.status !== "DRAFT") {
    // A retry of the same request returns the same work order.
    if (existing.issueKey === idempotencyKey) return getWorkOrder(db, ctx, id);
    return fail("CONFLICT", "Work order is already issued");
  }

  const items = await fetchItems(db, id);
  if (items.length === 0) return fail("VALIDATION", "Add at least one line item");

  const company = await loadCompany(db, ctx.orgId, existing.companyId);
  if (!company) return fail("NOT_FOUND", "Company not found");
  const org = await loadOrgSettings(db, ctx.orgId);
  if (!org?.stateCode) return fail("VALIDATION", "Set the organisation state in Settings before issuing");

  const now = new Date();
  const issueDate = issueDateInput ?? existing.issueDate ?? todayIst(now);

  const issued = await db.transaction(async (tx: Tx) => {
    const claimed = await tx
      .update(workOrders)
      .set({ status: "ISSUED", issueKey: idempotencyKey, updatedAt: now })
      .where(and(eq(workOrders.id, id), eq(workOrders.status, "DRAFT")))
      .returning({ id: workOrders.id });
    if (claimed.length === 0) return false;

    const allocated = await nextNumber(tx, {
      orgId: ctx.orgId,
      docType: "WORK_ORDER",
      date: new Date(`${issueDate}T12:00:00+05:30`),
      fyStartMonth: org.fyStartMonth,
    });

    const snapshot = {
      type: "WORK_ORDER",
      number: allocated.number,
      fy: allocated.fy,
      issueDate,
      seller: { legalName: org.legalName, address: org.address, stateCode: org.stateCode, gstin: org.gstin },
      buyer: {
        name: company.legalName || company.name,
        address: company.address,
        gstin: company.gstin,
        stateCode: company.stateCode,
      },
      customerRef: existing.customerRef,
      requestedBy: existing.requestedBy,
      department: existing.department,
      jobDetails: existing.jobDetails,
      comments: existing.comments,
      placeOfSupply: existing.placeOfSupply,
      taxMode: existing.taxMode,
      items,
      subtotalPaise: existing.subtotalPaise,
      cgstPaise: existing.cgstPaise,
      sgstPaise: existing.sgstPaise,
      igstPaise: existing.igstPaise,
      roundOffPaise: existing.roundOffPaise,
      totalPaise: existing.totalPaise,
    };

    await tx
      .update(workOrders)
      .set({
        number: allocated.number,
        fy: allocated.fy,
        issueDate,
        issuedAt: now,
        snapshotJson: snapshot,
      })
      .where(eq(workOrders.id, id));
    return true;
  });

  if (!issued) {
    const current = await findWorkOrder(db, ctx.orgId, id);
    if (current?.issueKey === idempotencyKey) return getWorkOrder(db, ctx, id);
    return fail("CONFLICT", "Work order is already issued");
  }

  await audit(db, ctx, "issued", id);
  return getWorkOrder(db, ctx, id);
}

/** Mark an issued work order as done. The frozen snapshot is not touched. */
export async function completeWorkOrder(db: Db, ctx: ServiceContext, id: string, raw: unknown = {}) {
  const parsed = completeWorkOrderSchema.safeParse(raw ?? {});
  if (!parsed.success) return fail("VALIDATION", "Invalid request", parsed.error.flatten());

  const existing = await findWorkOrder(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Work order not found");
  if (existing.status !== "ISSUED") {
    return fail("CONFLICT", `Cannot complete a ${existing.status.toLowerCase()} work order`);
  }

  const updated = await db
    .update(workOrders)
    .set({
      status: "COMPLETED",
      completedDate: parsed.data.completedDate ?? todayIst(),
      comments: parsed.data.comments === undefined ? existing.comments : parsed.data.comments,
      updatedAt: new Date(),
    })
    .where(and(eq(workOrders.id, id), eq(workOrders.status, "ISSUED")))
    .returning({ id: workOrders.id });
  if (updated.length === 0) return fail("CONFLICT", "Work order changed. Reload and try again.");

  await audit(db, ctx, "completed", id);
  return getWorkOrder(db, ctx, id);
}

export async function cancelWorkOrder(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = cancelWorkOrderSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", "Invalid request", parsed.error.flatten());

  const existing = await findWorkOrder(db, ctx.orgId, id);
  if (!existing) return fail("NOT_FOUND", "Work order not found");
  if (existing.status === "DRAFT") return fail("CONFLICT", "Drafts are deleted, not cancelled");
  if (existing.status !== "ISSUED") {
    return fail("CONFLICT", `Work order is already ${existing.status.toLowerCase()}`);
  }

  const now = new Date();
  const updated = await db
    .update(workOrders)
    .set({ status: "CANCELLED", cancelledAt: now, updatedAt: now })
    .where(and(eq(workOrders.id, id), eq(workOrders.status, "ISSUED")))
    .returning({ id: workOrders.id });
  if (updated.length === 0) return fail("CONFLICT", "Work order changed. Reload and try again.");

  await audit(db, ctx, "cancelled", id, { reason: parsed.data.reason });
  return getWorkOrder(db, ctx, id);
}
