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

const metaSchema = z.object({
  docType: z.enum(uploadedDocTypeValues),
  number: z.string().trim().max(100).default(""),
  partyName: z.string().trim().max(200).default(""),
  amountText: z.string().trim().max(60).default(""),
  dateText: z.string().trim().max(40).default(""),
  filename: z.string().trim().max(200).default(""),
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
  if (existing[0]) return ok({ id: existing[0].id, duplicate: true, invoiceLinked: false });

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
      keyId: key.id,
    })
    .returning({ id: uploadedDocuments.id });
  if (invoiceId) {
    await db.insert(attachments).values({ orgId: key.orgId, entityType: "INVOICE", entityId: invoiceId, blobKey: `${BUCKET}/${blobPath}`, filename, mime: "application/pdf", size: bytes.length, createdBy: null });
  }
  await logActivity({ action: "document.uploaded", module: "finance", entityType: "uploaded_document", entityId: row.id, metadata: { docType: m.docType, number: m.number, linkedToInvoice: Boolean(invoiceId) } }, db);
  return ok({ id: row.id, duplicate: false, invoiceLinked: Boolean(invoiceId) });
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
