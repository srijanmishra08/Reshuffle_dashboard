import { and, eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { schema, type Db } from "@/server/db/client";
import { fail, ok, type Result } from "@/server/lib/result";
import type { ServiceContext } from "@/server/services/companies";
import { getInvoiceSnapshot } from "@/server/services/invoices";
import { getLetterSnapshot } from "@/server/services/letters";
import { getSalarySlipSnapshot } from "@/server/services/salary-slips";
import { getWorkOrderSnapshot } from "@/server/services/work-orders";
import { registerFonts } from "./fonts";
import { setSignatureImage } from "./parts";
import { CreditNoteDocument } from "./templates/credit-note";
import { InvoiceDocument } from "./templates/invoice";
import { LetterDocument } from "./templates/letter";
import { SalarySlipDocument } from "./templates/salary-slip";
import { WorkOrderDocument } from "./templates/work-order";
import type { CreditNoteData, DocumentData, InvoiceSnapshot, LetterSnapshot, SalarySlipSnapshot, WorkOrderSnapshot } from "./types";

export type RenderedPdf = { filename: string; buffer: Buffer };

/**
 * Issued documents are immutable snapshots, so a PDF is a pure function of the
 * snapshot and can be re-rendered on demand without storing it.
 */
let signatureCache: { at: number; buf: Buffer | null } | null = null;

/** Signature PNG from the private "brand-assets" bucket. Missing storage config or file just means no image. */
async function loadSignature(): Promise<Buffer | null> {
  if (signatureCache && Date.now() - signatureCache.at < 10 * 60_000) return signatureCache.buf;
  let buf: Buffer | null = null;
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (base && key) {
    try {
      const res = await fetch(`${base}/storage/v1/object/brand-assets/signature.png`, {
        headers: { Authorization: `Bearer ${key}`, apikey: key },
        cache: "no-store",
      });
      if (res.ok) buf = Buffer.from(await res.arrayBuffer());
    } catch {
      buf = null;
    }
  }
  signatureCache = { at: Date.now(), buf };
  return buf;
}

export async function renderDocument(data: DocumentData): Promise<RenderedPdf> {
  registerFonts();
  setSignatureImage(await loadSignature());
  switch (data.type) {
    case "INVOICE":
      return { filename: safeName(data.number), buffer: await renderToBuffer(<InvoiceDocument data={data} />) };
    case "WORK_ORDER":
      return { filename: safeName(data.number), buffer: await renderToBuffer(<WorkOrderDocument data={data} />) };
    case "LETTER":
      return { filename: safeName(data.number), buffer: await renderToBuffer(<LetterDocument data={data} />) };
    case "SALARY_SLIP":
      return { filename: safeName(data.number), buffer: await renderToBuffer(<SalarySlipDocument data={data} />) };
    case "CREDIT_NOTE":
      return { filename: safeName(data.number), buffer: await renderToBuffer(<CreditNoteDocument data={data} />) };
  }
}

/** "RS/26-27/001" -> "RS-26-27-001.pdf" */
function safeName(number: string): string {
  return `${number.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
}

export async function renderInvoicePdf(db: Db, ctx: ServiceContext, id: string): Promise<Result<RenderedPdf>> {
  const snapshot = await getInvoiceSnapshot(db, ctx, id);
  if (!snapshot.ok) return snapshot;
  return ok(await renderDocument(snapshot.data as unknown as InvoiceSnapshot));
}

export async function renderWorkOrderPdf(db: Db, ctx: ServiceContext, id: string): Promise<Result<RenderedPdf>> {
  const snapshot = await getWorkOrderSnapshot(db, ctx, id);
  if (!snapshot.ok) return snapshot;
  return ok(await renderDocument(snapshot.data as unknown as WorkOrderSnapshot));
}

export async function renderLetterPdf(db: Db, ctx: ServiceContext, id: string): Promise<Result<RenderedPdf>> {
  const snapshot = await getLetterSnapshot(db, ctx, id);
  if (!snapshot.ok) return snapshot;
  return ok(await renderDocument(snapshot.data as unknown as LetterSnapshot));
}

export async function renderSalarySlipPdf(db: Db, ctx: ServiceContext, id: string): Promise<Result<RenderedPdf>> {
  const snapshot = await getSalarySlipSnapshot(db, ctx, id);
  if (!snapshot.ok) return snapshot;
  return ok(await renderDocument(snapshot.data as unknown as SalarySlipSnapshot));
}

/** The credit note reverses the whole invoice, so it reuses the invoice's frozen figures. */
export async function renderCreditNotePdf(db: Db, ctx: ServiceContext, invoiceId: string): Promise<Result<RenderedPdf>> {
  const rows = await db
    .select()
    .from(schema.creditNotes)
    .where(and(eq(schema.creditNotes.invoiceId, invoiceId), eq(schema.creditNotes.orgId, ctx.orgId)))
    .limit(1);
  const note = rows[0];
  if (!note) return fail("NOT_FOUND", "No credit note for this invoice");

  const snapshot = await getInvoiceSnapshot(db, ctx, invoiceId);
  if (!snapshot.ok) return snapshot;
  const inv = snapshot.data as unknown as InvoiceSnapshot;

  const data: CreditNoteData = {
    type: "CREDIT_NOTE",
    number: note.number,
    issueDate: note.issuedAt.toISOString().slice(0, 10),
    reason: note.reason,
    amountPaise: note.amountPaise,
    invoiceNumber: inv.number,
    invoiceDate: inv.issueDate,
    seller: inv.seller,
    buyer: inv.buyer,
    taxMode: inv.taxMode,
    rateBps: inv.rateBps,
    subtotalPaise: inv.subtotalPaise,
    cgstPaise: inv.cgstPaise,
    sgstPaise: inv.sgstPaise,
    igstPaise: inv.igstPaise,
    roundOffPaise: inv.roundOffPaise,
  };
  return ok(await renderDocument(data));
}
