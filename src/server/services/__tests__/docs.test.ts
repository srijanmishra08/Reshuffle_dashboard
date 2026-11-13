import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import type { Db } from "@/server/db/client";
import { createDoc, deleteDoc, getDoc, listDocs, updateDoc } from "../docs";

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

describe("docs", () => {
  it("rejects invalid input", async () => {
    expect((await createDoc(db, ctx, { title: "" })).ok).toBe(false);
    expect((await createDoc(db, ctx, { title: "x", type: "BOGUS" })).ok).toBe(false);
  });

  it("creates, updates, and deletes", async () => {
    const d = must(await createDoc(db, ctx, { title: "Fake SOP", type: "SOP", body: "# Steps" }));
    expect(d.type).toBe("SOP");
    const u = must(await updateDoc(db, ctx, d.id, { body: "# Steps\n1. one" }));
    expect(u.body).toContain("1. one");
    expect((await deleteDoc(db, ctx, d.id)).ok).toBe(true);
    expect((await getDoc(db, ctx, d.id)).ok).toBe(false);
  });

  it("filters by type and searches title and body literally", async () => {
    must(await createDoc(db, ctx, { title: "Alpha playbook", type: "PLAYBOOK", body: "pitch 100% value" }));
    must(await createDoc(db, ctx, { title: "Beta note", type: "NOTE", body: "other" }));
    expect(must(await listDocs(db, ctx, { type: "PLAYBOOK" })).map((r) => r.title)).toEqual(["Alpha playbook"]);
    expect(must(await listDocs(db, ctx, { q: "alpha" })).length).toBe(1);
    expect(must(await listDocs(db, ctx, { q: "100%" })).length).toBe(1);
    expect(must(await listDocs(db, ctx, { q: "%" })).length).toBe(1);
  });

  it("isolates organisations", async () => {
    const d = must(await createDoc(db, ctx, { title: "Private" }));
    expect((await getDoc(db, other, d.id)).ok).toBe(false);
    expect((await updateDoc(db, other, d.id, { title: "x" })).ok).toBe(false);
    expect((await deleteDoc(db, other, d.id)).ok).toBe(false);
    expect(must(await listDocs(db, other, {})).length).toBe(0);
  });
});
