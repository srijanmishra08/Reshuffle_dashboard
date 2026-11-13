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

describe("marketing content", () => {
  it("validates input", async () => {
    expect((await createContent(db, ctx, { title: "", platform: "Instagram", publishDate: "2026-04-01" })).ok).toBe(false);
    expect((await createContent(db, ctx, { title: "x", platform: "MySpace", publishDate: "2026-04-01" })).ok).toBe(false);
    expect((await createContent(db, ctx, { title: "x", platform: "X", publishDate: "04/01/2026" })).ok).toBe(false);
    expect((await createContent(db, ctx, { title: "x", platform: "X", publishDate: "2026-04-01", postUrl: "javascript:1" })).ok).toBe(false);
  });

  it("creates, moves status and filters by month", async () => {
    const a = must(await createContent(db, ctx, { title: "Fake post A", platform: "LinkedIn", publishDate: "2026-04-10" }));
    expect(a.status).toBe("IDEA");
    must(await createContent(db, ctx, { title: "Fake post B", platform: "X", publishDate: "2026-05-02" }));
    expect(must(await updateContent(db, ctx, a.id, { status: "POSTED" })).status).toBe("POSTED");
    expect(must(await listContent(db, ctx, { month: "2026-04" })).length).toBe(1);
    expect(must(await listContent(db, ctx, { status: "POSTED" })).length).toBe(1);
    expect(must(await listContent(db, ctx, { platform: "X" })).length).toBe(1);
  });

  it("isolates organisations", async () => {
    const c = must(await createContent(db, ctx, { title: "Private", platform: "Other", publishDate: "2026-06-01" }));
    expect((await updateContent(db, other, c.id, { status: "DRAFT" })).ok).toBe(false);
    expect((await deleteContent(db, other, c.id)).ok).toBe(false);
    expect(must(await listContent(db, other, {})).length).toBe(0);
    expect((await deleteContent(db, ctx, c.id)).ok).toBe(true);
  });
});

describe("social accounts", () => {
  it("rejects duplicate handles and foreign references", async () => {
    must(await createAccount(db, ctx, { platform: "Instagram", handle: "@fake_handle" }));
    const dup = await createAccount(db, ctx, { platform: "Instagram", handle: "@fake_handle" });
    expect(dup.ok).toBe(false);
    expect((await createAccount(db, ctx, { platform: "X", handle: "@a", verticalId: "nope" })).ok).toBe(false);
    expect((await createContent(db, ctx, { title: "t", platform: "X", publishDate: "2026-04-01", accountId: "nope" })).ok).toBe(false);
  });

  it("keeps posts when an account is deleted", async () => {
    const acc = must(await createAccount(db, ctx, { platform: "YouTube", handle: "@fake_channel" }));
    const post = must(await createContent(db, ctx, { title: "Linked", platform: "YouTube", publishDate: "2026-07-01", accountId: acc.id }));
    expect((await deleteAccount(db, other, acc.id)).ok).toBe(false);
    expect((await deleteAccount(db, ctx, acc.id)).ok).toBe(true);
    const after = must(await listContent(db, ctx, { month: "2026-07" }));
    expect(after.find((p) => p.id === post.id)?.accountId).toBeNull();
    expect(must(await listAccounts(db, other)).length).toBe(0);
  });
});
