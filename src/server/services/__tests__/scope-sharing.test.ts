import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "@/test/db";
import { schema, type Db } from "@/server/db/client";
import { createCompany } from "../companies";
import { createDeal } from "../deals";
import { createScope, deleteDraftScope, getScope, reviseScope, sendScope } from "../scopes";
import { acceptScope, createShareLink, getPublicScope, revokeShareLinks } from "../scope-sharing";
import { allowRequest } from "@/server/lib/rate-limit";

const ctx = { orgId: "default", userId: "user-1" };
let db: Db;
let cleanup: () => void;
let dealId: string;

function must<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

async function sentScope(key: string) {
  const created = must(
    await createScope(db, ctx, {
      dealId,
      title: "Fake scope",
      paymentSchedule: [
        { label: "Advance", percent: 50 },
        { label: "Delivery", percent: 50 },
      ],
      items: [{ phase: "Phase 1", title: "Module", days: 5, pricePaise: 100_000 }],
    })
  );
  must(await sendScope(db, ctx, created.id, { idempotencyKey: key }));
  return created.id;
}

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await db.insert(schema.orgSettings).values({
    orgId: "default",
    legalName: "Test Studio",
    address: "1 Example Road",
    stateCode: "22",
    gstin: "22AAAAA0000A1Z5",
  });
  const companyId = must(await createCompany(db, ctx, { name: "Fake Dairy Co" })).id;
  dealId = must(await createDeal(db, ctx, { companyId, title: "Fake deal" })).id;
});
afterAll(() => cleanup());

describe("scope sharing", () => {
  it("rejects sharing a draft scope", async () => {
    const draft = must(
      await createScope(db, ctx, {
        dealId,
        title: "Draft",
        paymentSchedule: [{ label: "All", percent: 100 }],
        items: [{ phase: "Phase 1", title: "x", days: 1, pricePaise: 100 }],
      })
    );
    const res = await createShareLink(db, ctx, draft.id);
    expect(res.ok).toBe(false);
    must(await deleteDraftScope(db, ctx, draft.id));
  });

  it("serves the frozen snapshot, accepts once, and stores only a token hash", async () => {
    const id = await sentScope("key-accept-1");
    const link = must(await createShareLink(db, ctx, id));
    const stored = await db.select().from(schema.scopeShares);
    expect(stored.some((s) => s.tokenHash === link.token)).toBe(false);

    const view = must(await getPublicScope(db, link.token));
    expect(view.status).toBe("SENT");
    expect(JSON.stringify(view)).not.toContain("user-1");

    expect((await acceptScope(db, link.token, { typedName: "A" }, { ip: "1.1.1.1", userAgent: null })).ok).toBe(false);
    const accepted = must(await acceptScope(db, link.token, { typedName: "Asha Rao" }, { ip: "1.1.1.1", userAgent: "ua" }));
    expect(accepted.acceptedBy).toBe("Asha Rao");

    const second = await acceptScope(db, link.token, { typedName: "Asha Rao" }, { ip: "1.1.1.1", userAgent: null });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("CONFLICT");

    expect(must(await getScope(db, ctx, id)).status).toBe("ACCEPTED");
    const rows = await db.select().from(schema.scopeAcceptances);
    expect(rows).toHaveLength(1);
    expect(rows[0].ip).toBe("1.1.1.1");
  });

  it("treats unknown, revoked and expired tokens as not found", async () => {
    const id = await sentScope("key-revoke-1");
    const link = must(await createShareLink(db, ctx, id));
    expect((await getPublicScope(db, "nope")).ok).toBe(false);

    const later = new Date(Date.now() + 31 * 24 * 3600 * 1000);
    expect((await getPublicScope(db, link.token, later)).ok).toBe(false);

    must(await revokeShareLinks(db, ctx, id));
    expect((await getPublicScope(db, link.token)).ok).toBe(false);
    const res = await acceptScope(db, link.token, { typedName: "Asha Rao" }, { ip: "2.2.2.2", userAgent: null });
    expect(res.ok).toBe(false);
  });

  it("a new link replaces the old one", async () => {
    const id = await sentScope("key-replace-1");
    const first = must(await createShareLink(db, ctx, id));
    const second = must(await createShareLink(db, ctx, id));
    expect((await getPublicScope(db, first.token)).ok).toBe(false);
    expect((await getPublicScope(db, second.token)).ok).toBe(true);
  });

  it("a superseded scope cannot be accepted", async () => {
    const id = await sentScope("key-super-0001");
    const link = must(await createShareLink(db, ctx, id));
    const draft = must(await reviseScope(db, ctx, id));
    must(await sendScope(db, ctx, draft.id, { idempotencyKey: "key-super-0002" }));
    const view = must(await getPublicScope(db, link.token));
    expect(view.status).toBe("SUPERSEDED");
    const res = await acceptScope(db, link.token, { typedName: "Asha Rao" }, { ip: "3.3.3.3", userAgent: null });
    expect(res.ok).toBe(false);
  });

  it("rate limits accept attempts per IP", async () => {
    const id = await sentScope("key-rate-limit");
    const link = must(await createShareLink(db, ctx, id));
    let blocked = false;
    for (let i = 0; i < 12; i++) {
      const res = await acceptScope(db, link.token, { typedName: "x" }, { ip: "9.9.9.9", userAgent: null });
      if (!res.ok && res.code === "FORBIDDEN") blocked = true;
    }
    expect(blocked).toBe(true);
  });
});

describe("allowRequest", () => {
  it("resets in the next window", async () => {
    const t = 1_000_000_000_000;
    expect(await allowRequest(db, "k", { limit: 1, windowSeconds: 60, now: t })).toBe(true);
    expect(await allowRequest(db, "k", { limit: 1, windowSeconds: 60, now: t + 1000 })).toBe(false);
    expect(await allowRequest(db, "k", { limit: 1, windowSeconds: 60, now: t + 61_000 })).toBe(true);
  });
});
