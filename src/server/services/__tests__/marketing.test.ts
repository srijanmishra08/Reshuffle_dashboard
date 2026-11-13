import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";
import {
  createAccount,
  createContent,
  deleteAccount,
  deleteContent,
  listAccounts,
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
  it("validates account and content input", async () => {
    expect((await createAccount(db, ctx, { platform: "Myspace", handle: "x" })).ok).toBe(false);
    expect((await createAccount(db, ctx, { platform: "Instagram", handle: "" })).ok).toBe(false);
    expect((await createContent(db, ctx, { title: "x", publishDate: "13-11-2026" })).ok).toBe(false);
    expect((await createContent(db, ctx, { title: "x", accountId: "nope" })).ok).toBe(false);
    expect((await createAccount(db, ctx, { platform: "X", handle: "h", verticalId: "nope" })).ok).toBe(false);
  });

  it("creates content, filters by month and status, moves status", async () => {
    const acc = must(await createAccount(db, ctx, { platform: "LinkedIn", handle: "@fake_co" }));
    const a = must(await createContent(db, ctx, { title: "Post A", accountId: acc.id, publishDate: "2026-11-20" }));
    must(await createContent(db, ctx, { title: "Post B", publishDate: "2026-12-02" }));
    expect(a.status).toBe("IDEA");
    expect(must(await listContent(db, ctx, { month: "2026-11" })).length).toBe(1);
    expect(must(await listContent(db, ctx, { accountId: acc.id })).length).toBe(1);
    must(await updateContent(db, ctx, a.id, { status: "POSTED" }));
    expect(must(await listContent(db, ctx, { status: "POSTED" })).length).toBe(1);
    expect(must(await updateContent(db, ctx, a.id, { publishDate: null })).publishDate).toBeNull();
  });

  it("blocks deleting an account that has content", async () => {
    const acc = must(await createAccount(db, ctx, { platform: "YouTube", handle: "chan" }));
    const c = must(await createContent(db, ctx, { title: "Video", accountId: acc.id }));
    const blocked = await deleteAccount(db, ctx, acc.id);
    expect(blocked.ok).toBe(false);
    must(await deleteContent(db, ctx, c.id));
    expect((await deleteAccount(db, ctx, acc.id)).ok).toBe(true);
  });

  it("isolates organisations", async () => {
    const acc = must(await createAccount(db, ctx, { platform: "Facebook", handle: "iso" }));
    expect((await createContent(db, other, { title: "x", accountId: acc.id })).ok).toBe(false);
    expect(must(await listAccounts(db, other)).length).toBe(0);
    expect((await deleteAccount(db, other, acc.id)).ok).toBe(false);
  });
});
