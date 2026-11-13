import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createCompany } from "@/server/services/companies";
import { cancelInvoice, createInvoice, issueInvoice } from "@/server/services/invoices";
import { createWorkOrder, issueWorkOrder } from "@/server/services/work-orders";
import { renderCreditNotePdf, renderInvoicePdf, renderWorkOrderPdf } from "../engine";

const ctx = { orgId: "default", userId: "user-1" };
let db: Db;
let cleanup: () => void;
let companyId: string;
let seq = 0;
const key = () => `pdf-key-${++seq}-abcdefgh`;

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

const items = [
  { description: "Build module", quantity: 2, ratePaise: 25_000_00, taxable: true },
  { description: "Pass-through", quantity: 1, ratePaise: 5_000_00, taxable: false },
];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await db.insert(schema.orgSettings).values({
    orgId: "default",
    legalName: "Test Studio",
    address: "1 Example Road",
    stateCode: "22",
    gstin: "22AAAAA0000A1Z5",
    bankDetails: { accountName: "Test Studio", accountNumber: "000111222", ifsc: "TEST0000001", bankName: "Test Bank" },
    signatoryName: "A Signer",
  });
  companyId = must(await createCompany(db, ctx, { name: "Fake Client", gstin: "29BBBBB1111B1Z5", stateCode: "29" })).id;
});

afterAll(() => cleanup());

const isPdf = (b: Buffer) => b.subarray(0, 5).toString() === "%PDF-" && b.length > 1500;

describe("document engine", () => {
  it("renders an issued inter-state invoice, with the rupee glyph fonts embedded", async () => {
    const draft = must(await createInvoice(db, ctx, { companyId, items }));
    const inv = must(await issueInvoice(db, ctx, draft.id, { idempotencyKey: key(), issueDate: "2026-06-10" }));
    expect(inv.taxMode).toBe("INTER");

    const pdf = must(await renderInvoicePdf(db, ctx, inv.id));
    expect(isPdf(pdf.buffer)).toBe(true);
    expect(pdf.filename).toBe(`${inv.number!.replace(/\//g, "-")}.pdf`);
    expect(pdf.buffer.toString("latin1")).toContain("NotoSans");
  });

  it("refuses to render a draft invoice", async () => {
    const draft = must(await createInvoice(db, ctx, { companyId, items }));
    const res = await renderInvoicePdf(db, ctx, draft.id);
    expect(res.ok).toBe(false);
  });

  it("renders a work order", async () => {
    const draft = must(await createWorkOrder(db, ctx, { companyId, requestedBy: "Tester", jobDetails: "Do it", items }));
    const wo = must(await issueWorkOrder(db, ctx, draft.id, { idempotencyKey: key(), issueDate: "2026-06-10" }));
    expect(isPdf(must(await renderWorkOrderPdf(db, ctx, wo.id)).buffer)).toBe(true);
  });

  it("renders a credit note after cancelling, and 404s when there is none", async () => {
    const draft = must(await createInvoice(db, ctx, { companyId, items }));
    const inv = must(await issueInvoice(db, ctx, draft.id, { idempotencyKey: key(), issueDate: "2026-06-10" }));
    expect((await renderCreditNotePdf(db, ctx, inv.id)).ok).toBe(false);

    must(await cancelInvoice(db, ctx, inv.id, { reason: "Issued in error" }));
    expect(isPdf(must(await renderCreditNotePdf(db, ctx, inv.id)).buffer)).toBe(true);
  });
});
