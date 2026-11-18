import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/server/db/client";
import { schema } from "@/server/db/client";
import { fail, ok } from "@/server/lib/result";
import { toPaise } from "@/server/lib/money";
import { supabaseStorage, type Storage } from "@/server/lib/storage";
import { logActivity } from "@/server/services/activity";
import type { ServiceContext } from "@/server/services/companies";
import { uploadedDocTypeValues } from "@/server/db/schema/ingest";
import { recordIssueMessages, uploadedInvoiceDetailsSchema, type RecordIssue } from "@/lib/schemas/ingest";
import { createCompany } from "@/server/services/companies";
import { createInvoice, deleteDraftInvoice, issueInvoice } from "@/server/services/invoices";

const { ingestKeys, uploadedDocuments, invoices, attachments, companies } = schema;

export const BUCKET = "invoice-originals";
export const MAX_PDF_BYTES = 8 * 1024 * 1024;

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/* ---------------------------------- keys ---------------------------------- */

const keyLabelSchema = z.object({ label: z.string().trim().min(1, "Give the key a name").max(100) });

/** Makes a key. The token is returned once and only its hash is kept. */
export async function createIngestKey(db: Db, ctx: ServiceContext, raw: unknown) {
  const parsed = keyLabelSchema.safeParse(raw);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Invalid key");
  const token = `rsk_${randomBytes(32).toString("base64url")}`;
  const [row] = await db
    .insert(ingestKeys)
    .values({ orgId: ctx.orgId, label: parsed.data.label, tokenHash: sha256(token), prefix: token.slice(0, 8), createdBy: ctx.userId })
    .returning({ id: ingestKeys.id, label: ingestKeys.label, prefix: ingestKeys.prefix });
  await logActivity({ actorId: ctx.userId, action: "ingest_key.created", module: "finance", entityType: "ingest_key", entityId: row.id }, db);
  return ok({ ...row, token });
}

export async function listIngestKeys(db: Db, ctx: ServiceContext) {
  const rows = await db
    .select({ id: ingestKeys.id, label: ingestKeys.label, prefix: ingestKeys.prefix, createdAt: ingestKeys.createdAt, lastUsedAt: ingestKeys.lastUsedAt, revokedAt: ingestKeys.revokedAt })
    .from(ingestKeys)
    .where(eq(ingestKeys.orgId, ctx.orgId))
    .orderBy(desc(ingestKeys.createdAt));
  return ok(rows);
}

export async function revokeIngestKey(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .update(ingestKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(ingestKeys.id, id), eq(ingestKeys.orgId, ctx.orgId), sql`${ingestKeys.revokedAt} is null`))
    .returning({ id: ingestKeys.id });
  if (rows.length === 0) return fail("NOT_FOUND", "Key not found or already revoked");
  await logActivity({ actorId: ctx.userId, action: "ingest_key.revoked", module: "finance", entityType: "ingest_key", entityId: id }, db);
  return ok({ id });
}

/** The key behind a bearer token, or null when it is unknown or revoked. Records when it was last used, at most once a minute. */
export async function authenticateIngestKey(db: Db, token: string | null, now = new Date()) {
  if (!token || !/^rsk_[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const rows = await db
    .select({ id: ingestKeys.id, orgId: ingestKeys.orgId, revokedAt: ingestKeys.revokedAt, lastUsedAt: ingestKeys.lastUsedAt })
    .from(ingestKeys)
    .where(eq(ingestKeys.tokenHash, sha256(token)))
    .limit(1);
  const key = rows[0];
  if (!key || key.revokedAt) return null;
  if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() > 60_000) {
    await db.update(ingestKeys).set({ lastUsedAt: now }).where(eq(ingestKeys.id, key.id));
  }
  return { id: key.id, orgId: key.orgId };
}

/* --------------------------------- parsing -------------------------------- */

/** "₹1,23,456.00" becomes paise. Anything that is not a plain amount, or is absurdly large, becomes null. */
export function parseAmountPaise(text: string | null | undefined): number | null {
  const cleaned = (text ?? "").replace(/[^\d.,]/g, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const paise = toPaise(cleaned);
  return paise > 0 && paise <= 2_000_000_000 ? paise : null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "12 May 2026", "12 May, 2026" or "2026-05-12" become `2026-05-12`. Anything else becomes null. */
export function parseDocumentDate(text: string | null | undefined): string | null {
  const t = (text ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const words = /^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$/.exec(t);
  let y: number, m: number, d: number;
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (words) {
    m = MONTHS.indexOf(words[2].slice(0, 3).toLowerCase()) + 1;
    [y, d] = [Number(words[3]), Number(words[1])];
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** A name safe to store and to put in a download header. */
export function safeFilename(name: string, fallback: string): string {
  const base = name.replace(/[^A-Za-z0-9._ -]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
  const named = base || fallback;
  return /\.pdf$/i.test(named) ? named : `${named}.pdf`;
}

/* -------------------------------- documents ------------------------------- */

type UploadRow = typeof uploadedDocuments.$inferSelect;

/** A plain amount typed in the form ("1000", "12.50") as paise, or null. */
function plainPaise(text: string): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const paise = toPaise(t);
  return paise > 0 && paise <= 2_000_000_000 ? paise : null;
}

const VALID_GSTIN = /^[0-9A-Z]{15}$/;

/** Writes the issue on the upload so the page can say why, and returns it. */
async function noteIssue(db: Db, uploadId: string, issue: RecordIssue) {
  await db.update(uploadedDocuments).set({ recordNote: issue }).where(eq(uploadedDocuments.id, uploadId));
  return { recorded: false as const, issue };
}

/**
 * Records an uploaded invoice as an issued invoice in the dashboard, keeping the number it already carries. The dashboard works
 * out the tax itself from the line items and only records the invoice if its total agrees with the PDF (within the rupee
 * rounding), so a typing slip cannot create a wrong invoice. A client that is not in the dashboard yet is created when
 * `createClient` is set (the upload path sets it: the key is made by an admin and is upload-only).
 */
async function recordFromUpload(db: Db, ctx: ServiceContext, upload: UploadRow, opts: { createClient: boolean }) {
  const details = uploadedInvoiceDetailsSchema.safeParse(upload.details);
  if (!details.success) return noteIssue(db, upload.id, "NO_DETAILS");
  const d = details.data;
  if (!upload.number.trim()) return noteIssue(db, upload.id, "NO_NUMBER");
  if (!upload.documentDate) return noteIssue(db, upload.id, "NO_DATE");

  const taken = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.orgId, ctx.orgId), sql`lower(${invoices.number}) = lower(${upload.number})`))
    .limit(1);
  if (taken.length > 0) return noteIssue(db, upload.id, "NUMBER_USED");

  const lines = d.items.map((i) => ({ description: i.description, ratePaise: plainPaise(i.amount) }));
  if (lines.some((l) => l.ratePaise === null)) return noteIssue(db, upload.id, "BAD_ITEMS");

  const gstin = d.clientGstin.toUpperCase().replace(/\s+/g, "");
  const byName = sql`(lower(${companies.name}) = lower(${d.clientName}) or lower(coalesce(${companies.legalName}, '')) = lower(${d.clientName}))`;
  const found = (
    await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.orgId, ctx.orgId), sql`${companies.archivedAt} is null`, VALID_GSTIN.test(gstin) ? or(eq(companies.gstin, gstin), byName) : byName))
      .limit(1)
  )[0];
  let companyId = found?.id;
  if (!companyId) {
    if (!opts.createClient) return noteIssue(db, upload.id, "NEW_CLIENT");
    const made = await createCompany(db, ctx, {
      name: d.clientName,
      gstin: VALID_GSTIN.test(gstin) ? gstin : null,
      stateCode: VALID_GSTIN.test(gstin) ? gstin.slice(0, 2) : null,
      address: d.clientAddress || null,
      lifecycle: "ACTIVE",
      source: "Invoice software",
    });
    if (!made.ok) return noteIssue(db, upload.id, "NEW_CLIENT");
    companyId = made.data.id;
  }

  const draft = await createInvoice(db, ctx, {
    companyId,
    issueDate: upload.documentDate,
    notes: d.notes || null,
    items: lines.map((l) => ({ description: l.description, quantity: 1, ratePaise: l.ratePaise as number, taxable: true })),
  });
  if (!draft.ok) return noteIssue(db, upload.id, /organisation state/i.test(draft.error) ? "NO_SETTINGS" : "BAD_ITEMS");

  if (upload.amountPaise === null || Math.abs(draft.data.totalPaise - upload.amountPaise) > 100) {
    await deleteDraftInvoice(db, ctx, draft.data.id);
    return noteIssue(db, upload.id, "TOTAL_MISMATCH");
  }

  let issued;
  try {
    issued = await issueInvoice(db, ctx, draft.data.id, { idempotencyKey: `upload-${upload.id}`, issueDate: upload.documentDate }, { externalNumber: upload.number });
  } catch {
    // The only way this fails after the check above is another invoice taking the number at the same moment.
    await deleteDraftInvoice(db, ctx, draft.data.id);
    return noteIssue(db, upload.id, "NUMBER_USED");
  }
  if (!issued.ok) {
    await deleteDraftInvoice(db, ctx, draft.data.id);
    return noteIssue(db, upload.id, "NUMBER_USED");
  }

  await db.insert(attachments).values({ orgId: ctx.orgId, entityType: "INVOICE", entityId: draft.data.id, blobKey: upload.blobKey, filename: upload.filename, mime: "application/pdf", size: upload.sizeBytes, createdBy: null });
  await db.update(uploadedDocuments).set({ invoiceId: draft.data.id, recordNote: null }).where(eq(uploadedDocuments.id, upload.id));
  await logActivity({ actorId: ctx.userId, action: "document.recorded_as_invoice", module: "finance", entityType: "invoice", entityId: draft.data.id, metadata: { uploadId: upload.id, number: upload.number } }, db);
  return { recorded: true as const, invoiceId: draft.data.id };
}

/** The "Record as invoice" button: tries again, and creates the client if asked to. */
export async function recordUploadedInvoice(db: Db, ctx: ServiceContext, id: string, raw: unknown) {
  const parsed = z.object({ createClient: z.boolean().default(false) }).safeParse(raw ?? {});
  if (!parsed.success) return fail("VALIDATION", "Invalid request");
  const doc = await findDocument(db, ctx, id);
  if (!doc) return fail("NOT_FOUND", "Document not found");
  if (doc.docType !== "INVOICE") return fail("VALIDATION", "Only invoices can be recorded");
  if (doc.invoiceId) return fail("CONFLICT", "This PDF is already attached to a dashboard invoice");
  const result = await recordFromUpload(db, ctx, doc, { createClient: parsed.data.createClient });
  if (!result.recorded) return fail("CONFLICT", recordIssueMessages[result.issue], { issue: result.issue });
  return ok({ invoiceId: result.invoiceId });
}

const nextNumberQuerySchema = z.object({
  prefix: z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/).default("RESHUFFLE"),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

/**
 * The next invoice number in the pattern PREFIX/YEAR/MONTH/NN (for example RESHUFFLE/2026/05/01): one more than the highest
 * number already used for that month, counting both dashboard invoices and PDFs saved from the invoice software, so a PDF
 * that was made but not recorded yet is not given out twice.
 */
export async function nextInvoiceNumber(db: Db, orgId: string, rawQuery: unknown) {
  const parsed = nextNumberQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return fail("VALIDATION", "Give a prefix, a year and a month");
  const { prefix, year, month } = parsed.data;
  const base = `${prefix}/${year}/${String(month).padStart(2, "0")}/`;
  // "_" and "%" are LIKE wildcards; the prefix only allows letters, digits, "_" and "-", so escape "_" to match literally.
  const like = `${base.replace(/_/g, "\\_")}%`;
  const [fromInvoices, fromUploads] = await Promise.all([
    db.select({ n: invoices.number }).from(invoices).where(and(eq(invoices.orgId, orgId), ilike(invoices.number, like))),
    db.select({ n: uploadedDocuments.number }).from(uploadedDocuments).where(and(eq(uploadedDocuments.orgId, orgId), eq(uploadedDocuments.docType, "INVOICE"), ilike(uploadedDocuments.number, like))),
  ]);
  let highest = 0;
  const tail = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{1,6})$`, "i");
  for (const row of [...fromInvoices, ...fromUploads]) {
    const m = tail.exec((row.n ?? "").trim());
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  return ok({ number: `${base}${String(highest + 1).padStart(2, "0")}` });
}

const metaSchema = z.object({
  docType: z.enum(uploadedDocTypeValues),
  number: z.string().trim().max(100).default(""),
  partyName: z.string().trim().max(200).default(""),
  amountText: z.string().trim().max(60).default(""),
  dateText: z.string().trim().max(40).default(""),
  filename: z.string().trim().max(200).default(""),
  /** JSON with the client, line items and so on, from the invoice software. Optional. */
  invoiceJson: z.string().max(40_000).default(""),
});

/**
 * Saves a PDF sent by the invoice software. The file is checked (a real PDF, within the size limit), stored in private
 * storage, and recorded. An identical file sent twice is stored once. If a dashboard invoice has the same number, the PDF
 * is also attached to it, so it shows there as the original PDF.
 */
export async function ingestDocument(
  db: Db,
  key: { id: string; orgId: string },
  rawMeta: unknown,
  bytes: Buffer,
  storage: Storage = supabaseStorage
) {
  const meta = metaSchema.safeParse(rawMeta);
  if (!meta.success) return fail("VALIDATION", meta.error.issues[0]?.message ?? "Invalid document details");
  if (bytes.length === 0) return fail("VALIDATION", "The file is empty");
  if (bytes.length > MAX_PDF_BYTES) return fail("VALIDATION", "The file is larger than 8 MB");
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") return fail("VALIDATION", "The file is not a PDF");

  const hash = sha256(bytes);
  const existing = await db
    .select({ id: uploadedDocuments.id })
    .from(uploadedDocuments)
    .where(and(eq(uploadedDocuments.orgId, key.orgId), eq(uploadedDocuments.sha256, hash)))
    .limit(1);
  if (existing[0]) return ok({ id: existing[0].id, duplicate: true, invoiceLinked: false, recorded: false, recordIssue: null as RecordIssue | null });

  const m = meta.data;
  const blobPath = `uploads/${hash}.pdf`;
  try {
    await storage.put(BUCKET, blobPath, bytes, "application/pdf");
  } catch (error) {
    console.error("Could not store an uploaded PDF", error);
    return fail("VALIDATION", "The file could not be stored. Try again in a moment.");
  }

  // The PDF is attached to a dashboard invoice only when the number matches AND either the total or the client
  // matches too. The invoice software starts every new invoice with a real-looking number, so a test PDF must not
  // end up as the original PDF of a real invoice just because it kept that number.
  const amountPaise = parseAmountPaise(m.amountText);
  let invoiceId: string | null = null;
  if (m.docType === "INVOICE" && m.number) {
    const candidates = await db
      .select({ id: invoices.id, totalPaise: invoices.totalPaise, companyName: companies.name })
      .from(invoices)
      .leftJoin(companies, eq(companies.id, invoices.companyId))
      .where(and(eq(invoices.orgId, key.orgId), sql`lower(${invoices.number}) = lower(${m.number})`))
      .limit(1);
    const candidate = candidates[0];
    const sameTotal = candidate && amountPaise !== null && candidate.totalPaise === amountPaise;
    const sameClient = candidate && m.partyName !== "" && (candidate.companyName ?? "").trim().toLowerCase() === m.partyName.trim().toLowerCase();
    invoiceId = sameTotal || sameClient ? candidate.id : null;
  }
  const filename = safeFilename(m.filename || m.number, `${m.docType.toLowerCase()}-${hash.slice(0, 8)}`);
  let details: Record<string, unknown> | null = null;
  if (m.docType === "INVOICE" && m.invoiceJson) {
    try {
      const parsedDetails = uploadedInvoiceDetailsSchema.safeParse(JSON.parse(m.invoiceJson));
      details = parsedDetails.success ? parsedDetails.data : null;
    } catch {
      details = null;
    }
  }
  const [row] = await db
    .insert(uploadedDocuments)
    .values({
      orgId: key.orgId,
      docType: m.docType,
      number: m.number,
      partyName: m.partyName,
      amountPaise,
      documentDate: parseDocumentDate(m.dateText),
      filename,
      blobKey: `${BUCKET}/${blobPath}`,
      sizeBytes: bytes.length,
      sha256: hash,
      invoiceId,
      details,
      keyId: key.id,
    })
    .returning();
  if (invoiceId) {
    await db.insert(attachments).values({ orgId: key.orgId, entityType: "INVOICE", entityId: invoiceId, blobKey: `${BUCKET}/${blobPath}`, filename, mime: "application/pdf", size: bytes.length, createdBy: null });
  }
  await logActivity({ action: "document.uploaded", module: "finance", entityType: "uploaded_document", entityId: row.id, metadata: { docType: m.docType, number: m.number, linkedToInvoice: Boolean(invoiceId) } }, db);

  // An invoice that matches no dashboard invoice is recorded as a new one, when it can be done safely.
  let recorded = false;
  let recordIssue: RecordIssue | null = null;
  if (m.docType === "INVOICE" && !invoiceId) {
    const result = await recordFromUpload(db, { orgId: key.orgId, userId: "invoice-software" }, row, { createClient: true });
    recorded = result.recorded;
    recordIssue = result.recorded ? null : result.issue;
  }
  return ok({ id: row.id, duplicate: false, invoiceLinked: Boolean(invoiceId) || recorded, recorded, recordIssue });
}

const listQuerySchema = z.object({
  docType: z.enum(uploadedDocTypeValues).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/** PDFs saved from the invoice software, newest first, each with the client and dashboard invoice it matches, if any. */
export async function listUploadedDocuments(db: Db, ctx: ServiceContext, rawQuery: unknown = {}) {
  const parsed = listQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return fail("VALIDATION", "Invalid filters");
  const { docType, q, limit } = parsed.data;
  const conditions = [eq(uploadedDocuments.orgId, ctx.orgId)];
  if (docType) conditions.push(eq(uploadedDocuments.docType, docType));
  if (q) {
    const p = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(or(ilike(uploadedDocuments.number, p), ilike(uploadedDocuments.partyName, p), ilike(uploadedDocuments.filename, p))!);
  }
  const rows = await db
    .select({
      id: uploadedDocuments.id,
      docType: uploadedDocuments.docType,
      number: uploadedDocuments.number,
      partyName: uploadedDocuments.partyName,
      amountPaise: uploadedDocuments.amountPaise,
      documentDate: uploadedDocuments.documentDate,
      filename: uploadedDocuments.filename,
      sizeBytes: uploadedDocuments.sizeBytes,
      createdAt: uploadedDocuments.createdAt,
      invoiceId: uploadedDocuments.invoiceId,
      recordNote: uploadedDocuments.recordNote,
      canRecord: sql<boolean>`(${uploadedDocuments.details} is not null and ${uploadedDocuments.invoiceId} is null and ${uploadedDocuments.docType} = 'INVOICE')`,
      companyId: companies.id,
    })
    .from(uploadedDocuments)
    .leftJoin(companies, and(eq(companies.orgId, uploadedDocuments.orgId), sql`lower(${companies.name}) = lower(${uploadedDocuments.partyName})`))
    .where(and(...conditions))
    .orderBy(desc(uploadedDocuments.createdAt))
    .limit(limit);
  return ok(rows);
}

async function findDocument(db: Db, ctx: ServiceContext, id: string) {
  const rows = await db
    .select()
    .from(uploadedDocuments)
    .where(and(eq(uploadedDocuments.id, id), eq(uploadedDocuments.orgId, ctx.orgId)))
    .limit(1);
  return rows[0] ?? null;
}

const splitKey = (blobKey: string) => {
  const i = blobKey.indexOf("/");
  return { bucket: blobKey.slice(0, i), path: blobKey.slice(i + 1) };
};

/** The stored PDF, for the team to open. */
export async function getUploadedDocumentFile(db: Db, ctx: ServiceContext, id: string, storage: Storage = supabaseStorage) {
  const doc = await findDocument(db, ctx, id);
  if (!doc) return fail("NOT_FOUND", "Document not found");
  const { bucket, path } = splitKey(doc.blobKey);
  const bytes = await storage.get(bucket, path);
  if (!bytes) return fail("NOT_FOUND", "The stored file is missing");
  return ok({ filename: doc.filename, bytes });
}

/** Removes an upload by mistake: the record, the stored file and any invoice attachment pointing at it. */
export async function deleteUploadedDocument(db: Db, ctx: ServiceContext, id: string, storage: Storage = supabaseStorage) {
  const doc = await findDocument(db, ctx, id);
  if (!doc) return fail("NOT_FOUND", "Document not found");
  const { bucket, path } = splitKey(doc.blobKey);
  await db.delete(attachments).where(and(eq(attachments.blobKey, doc.blobKey), eq(attachments.orgId, ctx.orgId)));
  await db.delete(uploadedDocuments).where(eq(uploadedDocuments.id, id));
  // The file is shared by nothing else: the hash is unique per organisation.
  await storage.remove(bucket, path).catch((error) => console.error("Could not delete a stored PDF", error));
  await logActivity({ actorId: ctx.userId, action: "document.deleted", module: "finance", entityType: "uploaded_document", entityId: id }, db);
  return ok({ id });
}
