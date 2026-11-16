import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createLetter, deleteDraftLetter, issueLetter, listLetters, updateLetter } from "../letters";
import { renderLetterPdf } from "@/server/documents/engine";
import { isSectionHeading, isServiceAgreement } from "@/server/documents/templates/letter";
import { serviceAgreementText } from "@/lib/letter-templates";

const ctx = { orgId: "default", userId: "user-1" };
let db: Db;
let cleanup: () => void;

function must<T>(result: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

const input = { recipientName: "Fake Recipient", subject: "Hello", body: "First paragraph.\n\nSecond paragraph." };

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await db.insert(schema.orgSettings).values({
    orgId: "default",
    legalName: "Test Studio",
    address: "1 Example Road",
    stateCode: "22",
    gstin: "22AAAAA0000A1Z5",
  });
});

afterAll(() => cleanup());

describe("letters", () => {
  it("validates input", async () => {
    const res = await createLetter(db, ctx, { recipientName: "", subject: "", body: "" });
    expect(res.ok).toBe(false);
  });

  it("issues with a number, is idempotent per key, and then freezes", async () => {
    const draft = must(await createLetter(db, ctx, input));
    expect(draft.number).toBeNull();

    const first = must(await issueLetter(db, ctx, draft.id, { idempotencyKey: "letter-key-1", issueDate: "2026-06-10" }));
    expect(first.number).toMatch(/^LT\/26-27\/\d{3}$/);

    const retry = must(await issueLetter(db, ctx, draft.id, { idempotencyKey: "letter-key-1" }));
    expect(retry.number).toBe(first.number);

    const other = await issueLetter(db, ctx, draft.id, { idempotencyKey: "letter-key-2" });
    expect(other.ok).toBe(false);
    expect((await updateLetter(db, ctx, draft.id, { subject: "Changed" })).ok).toBe(false);
    expect((await deleteDraftLetter(db, ctx, draft.id)).ok).toBe(false);
  });

  it("numbers letters consecutively", async () => {
    const a = must(await createLetter(db, ctx, input));
    const b = must(await createLetter(db, ctx, input));
    const na = must(await issueLetter(db, ctx, a.id, { idempotencyKey: "seq-key-aaa", issueDate: "2026-06-11" })).number!;
    const nb = must(await issueLetter(db, ctx, b.id, { idempotencyKey: "seq-key-bbb", issueDate: "2026-06-11" })).number!;
    expect(Number(nb.split("/")[2])).toBe(Number(na.split("/")[2]) + 1);
  });

  it("edits and deletes drafts, and lists them", async () => {
    const draft = must(await createLetter(db, ctx, input));
    const edited = must(await updateLetter(db, ctx, draft.id, { subject: "Changed" }));
    expect(edited.subject).toBe("Changed");
    expect(must(await listLetters(db, ctx, { status: "DRAFT" })).some((l) => l.id === draft.id)).toBe(true);
    expect((await deleteDraftLetter(db, ctx, draft.id)).ok).toBe(true);
  });

  it("renders a PDF for an issued letter and refuses drafts", async () => {
    const draft = must(await createLetter(db, ctx, input));
    expect((await renderLetterPdf(db, ctx, draft.id)).ok).toBe(false);
    must(await issueLetter(db, ctx, draft.id, { idempotencyKey: "pdf-key-letter", issueDate: "2026-06-12" }));
    const pdf = must(await renderLetterPdf(db, ctx, draft.id));
    expect(pdf.buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders a service agreement, which runs past one page, with headings picked out", async () => {
    const text = serviceAgreementText({
      providerName: "Test Studio",
      clientName: "Fake Recipient",
      projectTitle: "Sample Build",
      description: "Design and build a sample system. ".repeat(30),
      deliverables: Array.from({ length: 25 }, (_, n) => `Deliverable ${n + 1}`).join("\n"),
      exclusions: "Hosting costs",
      startDate: "2026-12-01",
      endDate: "2027-02-01",
      totalFeeRupees: 250000,
      gstExtra: true,
      instalments: [{ label: "Advance", percent: 50 }, { label: "Completion", percent: 50 }],
      revisionRounds: 2,
      ip: "full",
      lateFeePercent: 2,
      cancellationFeePercent: 10,
      jurisdiction: "Raipur, Chhattisgarh",
      extraClauses: "",
    });
    expect(isServiceAgreement(text.subject)).toBe(true);
    expect(isSectionHeading("2. Scope of Work")).toBe(true);
    expect(isSectionHeading("5.1  Revisions. The Client is entitled to 2 round(s).")).toBe(false);

    const draft = must(await createLetter(db, ctx, { recipientName: "Fake Recipient", ...text }));
    must(await issueLetter(db, ctx, draft.id, { idempotencyKey: "pdf-key-agreement", issueDate: "2026-12-01" }));
    const pdf = must(await renderLetterPdf(db, ctx, draft.id));
    expect(pdf.buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect((pdf.buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length).toBeGreaterThan(1);
  });
});
