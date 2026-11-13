import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createLetter, deleteDraftLetter, issueLetter, listLetters, updateLetter } from "../letters";
import { renderLetterPdf } from "@/server/documents/engine";

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
});
