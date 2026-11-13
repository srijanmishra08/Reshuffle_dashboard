import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";
import {
  createAccount,
  createContent,
  deleteAccount,
  getContent,
  listContent,
  updateContent,
} from "../marketing";

const ctx = { orgId: "default", userId: "user-1" };
const other = { orgId: "other", userId: "user-2" };
let db: Db;
let cleanup: () => void;

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(() => cleanup());

describe("marketing", () => {
  it("validates input", async () => {
    expect((await createAccount(db, ctx, { platform: "Instagram", handle: "" })).ok).toBe(false);
    expect((await createContent(db, ctx, { title: "" })).ok).toBe(false);
    expect((await createContent(db, ctx, { title: "x", scheduledDate: "tomorrow" })).ok).toBe(false);
  });

  it("requires a date to schedule and rejects foreign accounts", async () => {
    expect((await createContent(db, ctx, { title: "Fake post", status: "SCHEDULED" })).ok).toBe(false);
    const acct = must(await createAccount(db, other, { platform: "LinkedIn", handle: "@fake_other" }));
    expect((await createContent(db, ctx, { title: "Fake post", accountId: acct.id })).ok).toBe(false);

    const item = must(await createContent(db, ctx, { title: "Draft idea" }));
    expect((await updateContent(db, ctx, item.id, { status: "SCHEDULED" })).ok).toBe(false);
    const scheduled = must(await updateContent(db, ctx, item.id, { status: "SCHEDULED", scheduledDate: "2026-12-01" }));
    expect(scheduled.status).toBe("SCHEDULED");
  });

  it("filters by date range and status", async () => {
    must(await createContent(db, ctx, { title: "A", scheduledDate: "2027-01-05", platform: "YouTube" }));
    must(await createContent(db, ctx, { title: "B", scheduledDate: "2027-02-05" }));
    expect(must(await listContent(db, ctx, { from: "2027-01-01", to: "2027-01-31" })).length).toBe(1);
    expect(must(await listContent(db, ctx, { platform: "YouTube" })).length).toBe(1);
    expect(must(await listContent(db, ctx, { status: "POSTED" })).length).toBe(0);
  });

  it("keeps content when its account is deleted, and isolates orgs", async () => {
    const acct = must(await createAccount(db, ctx, { platform: "Instagram", handle: "@fake_brand" }));
    const item = must(await createContent(db, ctx, { title: "Linked", accountId: acct.id }));
    expect((await deleteAccount(db, other, acct.id)).ok).toBe(false);
    expect((await getContent(db, other, item.id)).ok).toBe(false);
    must(await deleteAccount(db, ctx, acct.id));
    expect(must(await getContent(db, ctx, item.id)).accountId).toBeNull();
  });
});
