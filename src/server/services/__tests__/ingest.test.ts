import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import type { Storage } from "@/server/lib/storage";
import { createCompany } from "../companies";
import {
  authenticateIngestKey,
  createIngestKey,
  deleteUploadedDocument,
  getUploadedDocumentFile,
  ingestDocument,
  listIngestKeys,
  listUploadedDocuments,
  parseAmountPaise,
  parseDocumentDate,
  revokeIngestKey,
  safeFilename,
} from "../ingest";

const ctx = { orgId: "default", userId: "admin-1" };
const other = { orgId: "other", userId: "x" };
let db: Db;
let cleanup: () => void;
let token: string;
let key: { id: string; orgId: string };

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

/** An in-memory stand-in for file storage. */
function fakeStorage() {
  const files = new Map<string, Buffer>();
  let failNext = false;
  const storage: Storage = {
    async put(bucket, path, body) {
      if (failNext) {
        failNext = false;
        throw new Error("storage down");
      }
      files.set(`${bucket}/${path}`, body);
    },
    async get(bucket, path) {
      return files.get(`${bucket}/${path}`) ?? null;
    },
    async remove(bucket, path) {
      files.delete(`${bucket}/${path}`);
    },
  };
  return { storage, files, failOnce: () => (failNext = true) };
}

const pdf = (text: string) => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`);
const meta = { docType: "INVOICE", number: "RESHUFFLE/2026/05/01", partyName: "Fake Traders", amountText: "₹1,23,456.00", dateText: "12 May 2026", filename: "reshuffle-invoice.pdf" };

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await createCompany(db, ctx, { name: "Fake Traders" });
  const made = must(await createIngestKey(db, ctx, { label: "Invoice software" }));
  token = made.token;
  key = { id: made.id, orgId: "default" };
});
afterAll(() => cleanup());

describe("parsing", () => {
  it("reads amounts in rupees as paise, and refuses anything else", () => {
    expect(parseAmountPaise("₹1,23,456.00")).toBe(12_345_600);
    expect(parseAmountPaise("₹ 999")).toBe(99_900);
    expect(parseAmountPaise("1234.5")).toBe(123_450);
    for (const bad of ["", "₹0.00", "abc", "1.234", "₹99999999999", null, undefined]) expect(parseAmountPaise(bad as string), String(bad)).toBeNull();
  });

  it("reads the date typed in the software", () => {
    expect(parseDocumentDate("12 May 2026")).toBe("2026-05-12");
    expect(parseDocumentDate("5 January, 2027")).toBe("2027-01-05");
    expect(parseDocumentDate("2026-05-12")).toBe("2026-05-12");
    for (const bad of ["", "31 Feb 2026", "12 Foo 2026", "tomorrow", "1 May 1999", null]) expect(parseDocumentDate(bad as string), String(bad)).toBeNull();
  });

  it("makes safe file names", () => {
    expect(safeFilename("RESHUFFLE/2026/05/01", "x")).toBe("RESHUFFLE-2026-05-01.pdf");
    expect(safeFilename("a.pdf", "x")).toBe("a.pdf");
    expect(safeFilename("../../etc/passwd", "x")).not.toContain("/");
    expect(safeFilename("", "fallback")).toBe("fallback.pdf");
    expect(safeFilename("x".repeat(500), "f").length).toBeLessThanOrEqual(124);
  });
});

describe("keys", () => {
  it("shows the token once and keeps only its hash", async () => {
    expect(token).toMatch(/^rsk_[A-Za-z0-9_-]{40,}$/);
    const rows = await db.select().from(schema.ingestKeys);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    const listed = must(await listIngestKeys(db, ctx));
    expect(Object.keys(listed[0]).sort()).toEqual(["createdAt", "id", "label", "lastUsedAt", "prefix", "revokedAt"]);
    expect((await createIngestKey(db, ctx, { label: "  " })).ok).toBe(false);
  });

  it("accepts the key, refuses anything else, and notes when it was used", async () => {
    expect(await authenticateIngestKey(db, token)).toEqual({ id: key.id, orgId: "default" });
    expect((await listIngestKeys(db, ctx)).ok && must(await listIngestKeys(db, ctx))[0].lastUsedAt).not.toBeNull();
    for (const bad of [null, "", "rsk_short", "not-a-key", `${token}x`, token.slice(0, -1)]) expect(await authenticateIngestKey(db, bad), String(bad)).toBeNull();
  });

  it("stops working when revoked, and cannot be revoked by another organisation", async () => {
    const extra = must(await createIngestKey(db, ctx, { label: "Temporary" }));
    expect(await authenticateIngestKey(db, extra.token)).not.toBeNull();
    expect((await revokeIngestKey(db, other, extra.id)).ok).toBe(false);
    must(await revokeIngestKey(db, ctx, extra.id));
    expect(await authenticateIngestKey(db, extra.token)).toBeNull();
    expect((await revokeIngestKey(db, ctx, extra.id)).ok).toBe(false);
    expect(must(await listIngestKeys(db, other))).toEqual([]);
  });
});

describe("saving a PDF", () => {
  it("stores the file, records the details and returns the same id for the same file", async () => {
    const { storage, files } = fakeStorage();
    const bytes = pdf("first invoice");
    const first = must(await ingestDocument(db, key, meta, bytes, storage));
    expect(first).toMatchObject({ duplicate: false });
    expect([...files.keys()]).toHaveLength(1);
    expect([...files.keys()][0]).toMatch(/^invoice-originals\/uploads\/[0-9a-f]{64}\.pdf$/);
    const row = (await db.select().from(schema.uploadedDocuments).where(eq(schema.uploadedDocuments.id, first.id)))[0];
    expect(row).toMatchObject({ docType: "INVOICE", number: "RESHUFFLE/2026/05/01", partyName: "Fake Traders", amountPaise: 12_345_600, documentDate: "2026-05-12", sizeBytes: bytes.length, filename: "reshuffle-invoice.pdf", keyId: key.id });
    const again = must(await ingestDocument(db, key, meta, bytes, storage));
    expect(again).toMatchObject({ id: first.id, duplicate: true });
    expect(files.size).toBe(1);
    expect(await db.select().from(schema.uploadedDocuments)).toHaveLength(1);
  });

  it("refuses files that are not PDFs, are empty, too large, or have unknown details, and stores nothing", async () => {
    const { storage, files } = fakeStorage();
    expect((await ingestDocument(db, key, meta, Buffer.from("hello"), storage)).ok).toBe(false);
    expect((await ingestDocument(db, key, meta, Buffer.alloc(0), storage)).ok).toBe(false);
    expect((await ingestDocument(db, key, meta, Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(8 * 1024 * 1024)]), storage)).ok).toBe(false);
    expect((await ingestDocument(db, key, { ...meta, docType: "SALARY_SLIP" }, pdf("slip"), storage)).ok).toBe(false);
    expect((await ingestDocument(db, key, { ...meta, docType: "OFFER_LETTER" }, pdf("offer"), storage)).ok).toBe(false);
    expect(files.size).toBe(0);
  });

  it("records nothing when storage fails", async () => {
    const { storage, failOnce } = fakeStorage();
    failOnce();
    const before = (await db.select().from(schema.uploadedDocuments)).length;
    expect((await ingestDocument(db, key, meta, pdf("storage failure"), storage)).ok).toBe(false);
    expect((await db.select().from(schema.uploadedDocuments)).length).toBe(before);
  });

  it("attaches the PDF to the dashboard invoice with the same number, ignoring case", async () => {
    const { storage } = fakeStorage();
    const company = must(await createCompany(db, ctx, { name: "Linked Client" }));
    const [inv] = await db.insert(schema.invoices).values({ orgId: "default", companyId: company.id, status: "ISSUED", number: "RS/26-27/777" }).returning();
    const res = must(await ingestDocument(db, key, { ...meta, number: "rs/26-27/777", partyName: "Linked Client" }, pdf("matching invoice"), storage));
    expect(res.invoiceLinked).toBe(true);
    const attached = await db.select().from(schema.attachments).where(eq(schema.attachments.entityId, inv.id));
    expect(attached).toHaveLength(1);
    expect(attached[0]).toMatchObject({ entityType: "INVOICE", mime: "application/pdf" });
    // A work order with a matching number is not an invoice.
    const wo = must(await ingestDocument(db, key, { ...meta, docType: "WORK_ORDER", number: "RS/26-27/777" }, pdf("work order"), storage));
    expect(wo.invoiceLinked).toBe(false);
  });

  it("keeps different organisations' identical files apart", async () => {
    const { storage } = fakeStorage();
    const bytes = pdf("same bytes");
    const a = must(await ingestDocument(db, key, meta, bytes, storage));
    const b = must(await ingestDocument(db, { id: key.id, orgId: "other" }, meta, bytes, storage));
    expect(a.id).not.toBe(b.id);
  });
});

describe("listing, opening and deleting", () => {
  it("lists newest first, searches, filters, and matches the client by name", async () => {
    const all = must(await listUploadedDocuments(db, ctx));
    expect(all.length).toBeGreaterThan(2);
    expect(all.map((d) => d.createdAt.getTime())).toEqual([...all.map((d) => d.createdAt.getTime())].sort((a, b) => b - a));
    const fake = all.find((d) => d.partyName === "Fake Traders")!;
    expect(fake.companyId).not.toBeNull();
    expect(must(await listUploadedDocuments(db, ctx, { q: "RS/26-27/777" })).every((d) => d.number.toLowerCase() === "rs/26-27/777")).toBe(true);
    expect(must(await listUploadedDocuments(db, ctx, { docType: "WORK_ORDER" })).every((d) => d.docType === "WORK_ORDER")).toBe(true);
    expect(must(await listUploadedDocuments(db, ctx, { q: "%" }))).toEqual([]);
    expect((await listUploadedDocuments(db, ctx, { docType: "SALARY_SLIP" })).ok).toBe(false);
    expect(must(await listUploadedDocuments(db, other)).every((d) => d.partyName === "Fake Traders")).toBe(true);
    expect(must(await listUploadedDocuments(db, { orgId: "nobody", userId: "x" }))).toEqual([]);
  });

  it("opens the stored file, and not for another organisation or when the file is gone", async () => {
    const { storage, files } = fakeStorage();
    const bytes = pdf("open me");
    const saved = must(await ingestDocument(db, key, { ...meta, number: "OPEN/1" }, bytes, storage));
    const file = must(await getUploadedDocumentFile(db, ctx, saved.id, storage));
    expect(file.bytes.equals(bytes)).toBe(true);
    expect(file.filename).toBe("reshuffle-invoice.pdf");
    expect((await getUploadedDocumentFile(db, other, saved.id, storage)).ok).toBe(false);
    files.clear();
    expect((await getUploadedDocumentFile(db, ctx, saved.id, storage)).ok).toBe(false);
    expect((await getUploadedDocumentFile(db, ctx, "missing", storage)).ok).toBe(false);
  });

  it("deletes the record, the stored file and the invoice attachment", async () => {
    const { storage, files } = fakeStorage();
    const company = must(await createCompany(db, ctx, { name: "Delete Client" }));
    const [inv] = await db.insert(schema.invoices).values({ orgId: "default", companyId: company.id, status: "ISSUED", number: "DEL/1" }).returning();
    const saved = must(await ingestDocument(db, key, { ...meta, number: "DEL/1" }, pdf("to delete"), storage));
    expect(files.size).toBe(1);
    expect((await deleteUploadedDocument(db, other, saved.id, storage)).ok).toBe(false);
    must(await deleteUploadedDocument(db, ctx, saved.id, storage));
    expect(files.size).toBe(0);
    expect(await db.select().from(schema.attachments).where(eq(schema.attachments.entityId, inv.id))).toHaveLength(0);
    expect((await getUploadedDocumentFile(db, ctx, saved.id, storage)).ok).toBe(false);
    expect((await deleteUploadedDocument(db, ctx, saved.id, storage)).ok).toBe(false);
  });
});
