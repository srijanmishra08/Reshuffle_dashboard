import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";
import {
  createAccount,
  createContent,
  deleteAccount,
  deleteContent,
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
  it("validates accounts and content input", async () => {
    expect((await createAccount(db, ctx, { platform: "INSTAGRAM", handle: "" })).ok).toBe(false);
    expect((await createAccount(db, ctx, { platform: "MYSPACE", handle: "x" })).ok).toBe(false);
    expect((await createAccount(db, ctx, { platform: "X", handle: "fake", verticalId: "nope" })).ok).toBe(false);
    expect((await createContent(db, ctx, { title: "x", link: "javascript:alert(1)" })).ok).toBe(false);
    expect((await createContent(db, ctx, { title: "x", accountId: "nope" })).ok).toBe(false);
  });

  it("requires a date for scheduled items, on create and on update", async () => {
    expect((await createContent(db, ctx, { title: "Post", status: "SCHEDULED" })).ok).toBe(false);
    const item = must(await createContent(db, ctx, { title: "Post" }));
    expect(item.status).toBe("IDEA");
    expect((await updateContent(db, ctx, item.id, { status: "SCHEDULED" })).ok).toBe(false);
    const ok = must(await updateContent(db, ctx, item.id, { status: "SCHEDULED", scheduledDate: "2026-04-10" }));
    expect(ok.status).toBe("SCHEDULED");
    expect((await updateContent(db, ctx, item.id, { scheduledDate: null })).ok).toBe(false);
  });

  it("filters by month, status and account", async () => {
    const acc = must(await createAccount(db, ctx, { platform: "LINKEDIN", handle: "fake-handle" }));
    must(await createContent(db, ctx, { title: "April", accountId: acc.id, scheduledDate: "2026-04-02", status: "DRAFT" }));
    must(await createContent(db, ctx, { title: "May", accountId: acc.id, scheduledDate: "2026-05-02" }));
    expect(must(await listContent(db, ctx, { month: "2026-05" })).map((c) => c.title)).toEqual(["May"]);
    expect(must(await listContent(db, ctx, { accountId: acc.id, status: "DRAFT" })).length).toBe(1);
    expect((await listContent(db, ctx, { month: "2026-13" })).ok).toBe(false);
  });

  it("refuses to delete an account that has content, but allows an empty one", async () => {
    const used = must(await createAccount(db, ctx, { platform: "YOUTUBE", handle: "used" }));
    const item = must(await createContent(db, ctx, { title: "Video", accountId: used.id }));
    const blocked = await deleteAccount(db, ctx, used.id);
    expect(blocked.ok).toBe(false);
    must(await deleteContent(db, ctx, item.id));
    expect((await deleteAccount(db, ctx, used.id)).ok).toBe(true);
  });

  it("isolates organisations", async () => {
    const acc = must(await createAccount(db, ctx, { platform: "FACEBOOK", handle: "private" }));
    const item = must(await createContent(db, ctx, { title: "Private", accountId: acc.id }));
    expect((await updateContent(db, other, item.id, { title: "x" })).ok).toBe(false);
    expect((await deleteContent(db, other, item.id)).ok).toBe(false);
    expect((await deleteAccount(db, other, acc.id)).ok).toBe(false);
    expect((await createContent(db, other, { title: "x", accountId: acc.id })).ok).toBe(false);
    expect(must(await listContent(db, other, {})).length).toBe(0);
  });
});
