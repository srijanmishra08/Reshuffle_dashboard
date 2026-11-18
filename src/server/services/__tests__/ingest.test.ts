import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import type { Storage } from "@/server/lib/storage";
import { createCompany } from "../companies";
import { getInvoice } from "../invoices";
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
  recordUploadedInvoice,
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
  await db.insert(schema.orgSettings).values({ orgId: "default", legalName: "Test Studio", address: "1 Example Road", stateCode: "22", gstin: "22AAAAA0000A1Z5", signatoryName: "A Signer" });
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

  it("does not attach a test PDF that merely reuses a real invoice's number", async () => {
    const { storage } = fakeStorage();
    const company = must(await createCompany(db, ctx, { name: "Real Client Pvt Ltd" }));
    const [inv] = await db.insert(schema.invoices).values({ orgId: "default", companyId: company.id, status: "ISSUED", number: "RESHUFFLE/2026/05/01", totalPaise: 11_800_000 }).returning();
    // The test from the screenshot: default number, made-up client, small total.
    const test = must(await ingestDocument(db, key, { ...meta, number: "RESHUFFLE/2026/05/01", partyName: "asd", amountText: "₹1,180.00" }, pdf("test invoice"), storage));
    expect(test.invoiceLinked).toBe(false);
    expect(await db.select().from(schema.attachments).where(eq(schema.attachments.entityId, inv.id))).toHaveLength(0);
    // Same number and same total: it is the real invoice, whatever the client was typed as.
    const byTotal = must(await ingestDocument(db, key, { ...meta, number: "RESHUFFLE/2026/05/01", partyName: "Real Client", amountText: "₹1,18,000.00" }, pdf("real by total"), storage));
    expect(byTotal.invoiceLinked).toBe(true);
    // Same number and same client name, a different total (for example a revised draft): also linked.
    const byName = must(await ingestDocument(db, key, { ...meta, number: "RESHUFFLE/2026/05/01", partyName: "real client pvt ltd", amountText: "₹5.00" }, pdf("real by name"), storage));
    expect(byName.invoiceLinked).toBe(true);
    expect(await db.select().from(schema.attachments).where(eq(schema.attachments.entityId, inv.id))).toHaveLength(2);
    // Every upload is still saved and listed, linked or not.
    expect(must(await listUploadedDocuments(db, ctx, { q: "asd" })).length).toBe(1);
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

describe("recording an uploaded invoice in the dashboard", () => {
  const detail = (over: Record<string, unknown> = {}) =>
    JSON.stringify({ clientName: "Fake Traders", clientGstin: "", clientAddress: "1 Market Road, Raipur", items: [{ description: "Video production", amount: "1000" }], advance: "0", paymentTerms: "50% upfront", notes: "Pay in 30 days", ...over });
  const send = (n: number, over: { number?: string; party?: string; amount?: string; date?: string; json?: string } = {}) => {
    const { storage } = fakeStorage();
    return ingestDocument(
      db,
      key,
      { docType: "INVOICE", number: over.number ?? `REC/2026/${n}`, partyName: over.party ?? "Fake Traders", amountText: over.amount ?? "₹1,180.00", dateText: over.date ?? "12 May 2026", filename: `rec-${n}.pdf`, invoiceJson: over.json ?? detail() },
      pdf(`record test ${n} ${over.number ?? ""} ${over.json ?? ""}`),
      storage
    );
  };
  const invoiceCount = async () => (await db.select().from(schema.invoices)).length;

  it("records an invoice for a client the dashboard already knows, keeping its number", async () => {
    const res = must(await send(1));
    expect(res).toMatchObject({ recorded: true, recordIssue: null, invoiceLinked: true });
    const row = (await db.select().from(schema.uploadedDocuments).where(eq(schema.uploadedDocuments.id, res.id)))[0];
    expect(row.invoiceId).not.toBeNull();
    expect(row.recordNote).toBeNull();
    const inv = must(await getInvoice(db, ctx, row.invoiceId!));
    expect(inv).toMatchObject({ number: "REC/2026/1", status: "ISSUED", issueDate: "2026-05-12", fy: "2026-27", totalPaise: 118_000, subtotalPaise: 100_000, paidPaise: 0, isIssued: true, companyName: "Fake Traders" });
    expect(inv.items).toHaveLength(1);
    expect(inv.notes).toBe("Pay in 30 days");
    expect(await db.select().from(schema.attachments).where(eq(schema.attachments.entityId, row.invoiceId!))).toHaveLength(1);
  });

  it("finds the client by GSTIN when the name differs, and uses IGST for another state", async () => {
    const other = must(await createCompany(db, ctx, { name: "Spherecho", legalName: "Spherecho Productions Private Limited", gstin: "27AAAAA1111A1Z1", stateCode: "27" }));
    const res = must(await send(2, { party: "Sphere Echo", json: detail({ clientName: "Sphere Echo", clientGstin: "27aaaaa1111a1z1" }) }));
    expect(res.recorded).toBe(true);
    const row = (await db.select().from(schema.uploadedDocuments).where(eq(schema.uploadedDocuments.id, res.id)))[0];
    const inv = must(await getInvoice(db, ctx, row.invoiceId!));
    expect(inv.companyId).toBe(other.id);
    expect(inv.taxMode).toBe("INTER");
    expect(inv.igstPaise).toBe(18_000);
    expect(inv.totalPaise).toBe(118_000);
  });

  it("creates the client and records the invoice when the client is not in the dashboard yet", async () => {
    const before = (await db.select().from(schema.companies)).length;
    const res = must(await send(3, { party: "asd", json: detail({ clientName: "asd", clientGstin: "not a gstin" }) }));
    expect(res).toMatchObject({ recorded: true, recordIssue: null });
    expect((await db.select().from(schema.companies)).length).toBe(before + 1);
    const row = (await db.select().from(schema.uploadedDocuments).where(eq(schema.uploadedDocuments.id, res.id)))[0];
    const inv = must(await getInvoice(db, ctx, row.invoiceId!));
    expect(inv).toMatchObject({ number: "REC/2026/3", companyName: "asd" });
    const client = (await db.select().from(schema.companies).where(eq(schema.companies.id, inv.companyId)))[0];
    // A GSTIN that is not valid is not stored, so it cannot break the tax split.
    expect(client).toMatchObject({ source: "Invoice software", lifecycle: "ACTIVE", gstin: null, stateCode: null });
    expect((await recordUploadedInvoice(db, ctx, res.id, { createClient: true })).ok).toBe(false);
  });

  it("creates the client with its GSTIN and state", async () => {
    const res = must(await send(4, { party: "New Buyer", json: detail({ clientName: "New Buyer", clientGstin: "29AAAAA2222A1Z2", clientAddress: "Bengaluru" }) }));
    expect(res.recorded).toBe(true);
    const row = (await db.select().from(schema.uploadedDocuments).where(eq(schema.uploadedDocuments.id, res.id)))[0];
    const inv = must(await getInvoice(db, ctx, row.invoiceId!));
    const client = (await db.select().from(schema.companies).where(eq(schema.companies.id, inv.companyId)))[0];
    expect(client).toMatchObject({ gstin: "29AAAAA2222A1Z2", stateCode: "29", address: "Bengaluru" });
    expect(inv.taxMode).toBe("INTER");
  });

  it("leaves a PDF unrecorded, with a reason and no stray invoice, when something does not add up", async () => {
    const before = await invoiceCount();
    // Same number, but neither the total nor the client name on the PDF matches: it is not attached, and the number is taken.
    expect(must(await send(5, { number: "REC/2026/1", party: "Other Co", amount: "₹2,000.00" })).recordIssue).toBe("NUMBER_USED");
    expect(must(await send(6, { amount: "₹5,000.00" })).recordIssue).toBe("TOTAL_MISMATCH");
    expect(must(await send(7, { date: "someday" })).recordIssue).toBe("NO_DATE");
    expect(must(await send(8, { json: detail({ items: [{ description: "x", amount: "ten" }] }) })).recordIssue).toBe("BAD_ITEMS");
    expect(must(await send(9, { json: "" })).recordIssue).toBe("NO_DETAILS");
    expect(must(await send(10, { json: "{not json" })).recordIssue).toBe("NO_DETAILS");
    expect(await invoiceCount()).toBe(before);
    expect(await db.select().from(schema.invoices).where(eq(schema.invoices.status, "DRAFT"))).toHaveLength(0);
    const noDetails = must(await listUploadedDocuments(db, ctx, { q: "REC/2026/9" }))[0];
    expect(noDetails.canRecord).toBe(false);
  });

  it("accepts the rupee rounding between the PDF and the dashboard's total", async () => {
    const res = must(await send(11, { json: detail({ items: [{ description: "Odd amount", amount: "1234.57" }] }), amount: "₹1,456.99" }));
    expect(res.recorded).toBe(true);
    const row = (await db.select().from(schema.uploadedDocuments).where(eq(schema.uploadedDocuments.id, res.id)))[0];
    const inv = must(await getInvoice(db, ctx, row.invoiceId!));
    expect(Math.abs(inv.totalPaise - 145_699)).toBeLessThanOrEqual(100);
  });

  it("only records invoices, only in the right organisation, and never twice", async () => {
    const { storage } = fakeStorage();
    const wo = must(await ingestDocument(db, key, { docType: "WORK_ORDER", number: "WO/9", partyName: "Fake Traders", amountText: "₹100", dateText: "1 June 2026", filename: "wo.pdf" }, pdf("wo record test"), storage));
    expect((await recordUploadedInvoice(db, ctx, wo.id, {})).ok).toBe(false);
    const res = must(await send(12, { amount: "₹5,000.00" }));
    expect((await recordUploadedInvoice(db, other, res.id, { createClient: true })).ok).toBe(false);
    expect((await recordUploadedInvoice(db, ctx, "missing", {})).ok).toBe(false);
  });
});
