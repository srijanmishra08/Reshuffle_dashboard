import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";
import {
  createAccount,
  createContent,
  deleteContent,
  listAccounts,
  listContent,
  updateAccount,
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
  it("validates account and content input", async () => {
    expect((await createAccount(db, ctx, { platform: "TIKTOK", handle: "x" })).ok).toBe(false);
    expect((await createAccount(db, ctx, { platform: "INSTAGRAM", handle: "" })).ok).toBe(false);
    expect((await createContent(db, ctx, { title: "x", platform: "X", publishDate: "13/11/2026" })).ok).toBe(false);
    expect((await createContent(db, ctx, { title: "x", platform: "X", accountId: "missing" })).ok).toBe(false);
    expect((await createAccount(db, ctx, { platform: "X", handle: "h", verticalId: "missing" })).ok).toBe(false);
  });

  it("creates content, moves status, filters by month and status", async () => {
    const acct = must(await createAccount(db, ctx, { platform: "INSTAGRAM", handle: "@fake_brand" }));
    const a = must(await createContent(db, ctx, { title: "Fake reel", platform: "INSTAGRAM", accountId: acct.id, publishDate: "2026-11-20" }));
    must(await createContent(db, ctx, { title: "Later post", platform: "LINKEDIN", publishDate: "2026-12-02" }));
    expect(a.status).toBe("IDEA");

    expect(must(await updateContent(db, ctx, a.id, { status: "SCHEDULED" })).status).toBe("SCHEDULED");
    expect(must(await listContent(db, ctx, { month: "2026-11" })).length).toBe(1);
    expect(must(await listContent(db, ctx, { status: "SCHEDULED" })).length).toBe(1);
    expect(must(await listContent(db, ctx, { accountId: acct.id })).length).toBe(1);
  });

  it("archives accounts out of the default list", async () => {
    const acct = must(await createAccount(db, ctx, { platform: "YOUTUBE", handle: "@fake_channel" }));
    must(await updateAccount(db, ctx, acct.id, { archived: true }));
    expect(must(await listAccounts(db, ctx)).some((a) => a.id === acct.id)).toBe(false);
    expect(must(await listAccounts(db, ctx, { includeArchived: true })).some((a) => a.id === acct.id)).toBe(true);
    must(await updateAccount(db, ctx, acct.id, { archived: false }));
    expect(must(await listAccounts(db, ctx)).some((a) => a.id === acct.id)).toBe(true);
  });

  it("isolates organisations", async () => {
    const item = must(await createContent(db, ctx, { title: "Private", platform: "X" }));
    expect((await updateContent(db, other, item.id, { title: "hack" })).ok).toBe(false);
    expect((await deleteContent(db, other, item.id)).ok).toBe(false);
    expect(must(await listContent(db, other, {})).length).toBe(0);
    expect((await deleteContent(db, ctx, item.id)).ok).toBe(true);
  });
});
