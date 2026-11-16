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

describe("marketing accounts", () => {
  it("creates, rejects duplicates, and toggles active", async () => {
    const a = must(await createAccount(db, ctx, { platform: "INSTAGRAM", handle: "fake_handle" }));
    expect(a.active).toBe(true);
    const dup = await createAccount(db, ctx, { platform: "INSTAGRAM", handle: "fake_handle" });
    expect(dup.ok).toBe(false);
    expect(must(await updateAccount(db, ctx, a.id, { active: false })).active).toBe(false);
    expect(must(await listAccounts(db, ctx)).length).toBe(1);
  });

  it("rejects unknown platform and unknown vertical", async () => {
    expect((await createAccount(db, ctx, { platform: "MYSPACE", handle: "x" })).ok).toBe(false);
    expect((await createAccount(db, ctx, { platform: "X", handle: "y", verticalId: "nope" })).ok).toBe(false);
  });

  it("refuses to delete an account that has content", async () => {
    const a = must(await createAccount(db, ctx, { platform: "LINKEDIN", handle: "fake_company" }));
    const c = must(await createContent(db, ctx, { title: "Post", accountId: a.id }));
    expect((await deleteAccount(db, ctx, a.id)).ok).toBe(false);
    must(await deleteContent(db, ctx, c.id));
    expect((await deleteAccount(db, ctx, a.id)).ok).toBe(true);
  });
});

describe("content items", () => {
  it("requires a date to schedule, including on patch", async () => {
    expect((await createContent(db, ctx, { title: "A", status: "SCHEDULED" })).ok).toBe(false);
    const c = must(await createContent(db, ctx, { title: "B" }));
    expect(c.status).toBe("IDEA");
    expect((await updateContent(db, ctx, c.id, { status: "SCHEDULED" })).ok).toBe(false);
    const ok = must(await updateContent(db, ctx, c.id, { status: "SCHEDULED", scheduledDate: "2026-04-10" }));
    expect(ok.scheduledDate).toBe("2026-04-10");
  });

  it("filters by month and status", async () => {
    must(await createContent(db, ctx, { title: "May", scheduledDate: "2026-05-02", status: "DRAFT" }));
    expect(must(await listContent(db, ctx, { month: "2026-05" })).length).toBe(1);
    expect(must(await listContent(db, ctx, { month: "2026-05", status: "PUBLISHED" })).length).toBe(0);
    expect((await listContent(db, ctx, { month: "May" })).ok).toBe(false);
  });

  it("isolates organisations and rejects foreign accounts", async () => {
    const a = must(await createAccount(db, ctx, { platform: "YOUTUBE", handle: "fake_channel" }));
    expect((await createContent(db, other, { title: "Z", accountId: a.id })).ok).toBe(false);
    const c = must(await createContent(db, ctx, { title: "Mine", accountId: a.id }));
    expect((await updateContent(db, other, c.id, { title: "Hijack" })).ok).toBe(false);
    expect((await deleteContent(db, other, c.id)).ok).toBe(false);
    expect(must(await listContent(db, other, {})).length).toBe(0);
  });
});
