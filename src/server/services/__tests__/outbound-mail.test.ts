import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { schema, type Db } from "@/server/db/client";
import { MailError, type MailDraft, type MailProvider } from "@/server/lib/mail/provider";
import { createCompany } from "@/server/services/companies";
import { createDeal } from "@/server/services/deals";
import { MAX_ATTEMPTS, listOutbox, processQueue, sendFollowUpDigests, sendInvite, sendMail } from "@/server/services/outbound-mail";
import { createTestDb } from "@/test/db";

const ctx = { orgId: "default", userId: "user-1" };

let db: Db;
let cleanup: () => void;
let companyId: string;
let dealId: string;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  const company = await createCompany(db, ctx, { name: "Example Traders" });
  if (!company.ok) throw new Error(company.error);
  companyId = company.data.id;
  const deal = await createDeal(db, ctx, { companyId, title: "Add inventory" });
  if (!deal.ok) throw new Error(deal.error);
  dealId = deal.data.id;
});
afterAll(() => cleanup());

function fakeProvider(behaviour: (draft: MailDraft, call: number) => Promise<{ id: string; threadId: string | null }> | { id: string; threadId: string | null }) {
  let calls = 0;
  const send = vi.fn(async (draft: MailDraft) => behaviour(draft, ++calls));
  return { fromEmail: "company@example.test", send } satisfies MailProvider;
}
const okProvider = () => fakeProvider((_d, n) => ({ id: `gm-${n}`, threadId: `th-${n}` }));

const followUp = (key: string, extra: Record<string, unknown> = {}) => ({
  kind: "FOLLOWUP" as const,
  to: "Buyer@Example.test",
  subject: "Checking in",
  body: "Hello, any update?",
  companyId,
  dealId,
  idempotencyKey: key,
  ...extra,
});

describe("sendMail", () => {
  it("sends, stores the Gmail ids and logs an EMAIL interaction", async () => {
    const provider = okProvider();
    const result = await sendMail(db, ctx, followUp("key-send-0001"), { provider });
    expect(result).toMatchObject({ ok: true, data: { status: "SENT", to: "buyer@example.test", attempts: 1 } });
    expect(provider.send).toHaveBeenCalledWith({ to: "buyer@example.test", subject: "Checking in", body: "Hello, any update?" });

    const rows = await db.select().from(schema.outboundMessages).where(eq(schema.outboundMessages.idempotencyKey, "key-send-0001"));
    expect(rows[0]).toMatchObject({ gmailMessageId: "gm-1", gmailThreadId: "th-1", status: "SENT" });
    const logged = await db.select().from(schema.interactions).where(eq(schema.interactions.companyId, companyId));
    expect(logged.some((i) => i.type === "EMAIL" && i.summary.includes("Checking in") && i.dealId === dealId)).toBe(true);
  });

  it("does not send twice for the same idempotency key", async () => {
    const provider = okProvider();
    const first = await sendMail(db, ctx, followUp("key-dupe-0001"), { provider });
    const second = await sendMail(db, ctx, followUp("key-dupe-0001"), { provider });
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(first.ok && second.ok && first.data.id === second.data.id).toBe(true);
  });

  it("refuses when Gmail is not connected and queues nothing", async () => {
    const result = await sendMail(db, ctx, followUp("key-none-0001"), { provider: null });
    expect(result).toMatchObject({ ok: false, code: "CONFLICT" });
    const rows = await db.select().from(schema.outboundMessages).where(eq(schema.outboundMessages.idempotencyKey, "key-none-0001"));
    expect(rows).toHaveLength(0);
  });

  it("rejects bad input, other orgs' clients and a lead from another client", async () => {
    const provider = okProvider();
    expect(await sendMail(db, ctx, followUp("key-bad-00001", { to: "not-an-email" }), { provider })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await sendMail(db, { orgId: "other", userId: "u" }, followUp("key-org-00001"), { provider })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    const other = await createCompany(db, ctx, { name: "Other Co" });
    if (!other.ok) throw new Error(other.error);
    expect(await sendMail(db, ctx, followUp("key-deal-0001", { companyId: other.data.id }), { provider })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(provider.send).not.toHaveBeenCalled();
  });

  it("emails a scope link only for a sent scope and rejects odd paths", async () => {
    const provider = okProvider();
    const [scope] = await db.insert(schema.scopes).values({ dealId, title: "Inventory build", status: "DRAFT" }).returning();
    const body = { kind: "SCOPE_LINK" as const, to: "buyer@example.test", scopeId: scope.id, path: "/p/abcdEFGH12345678", idempotencyKey: "key-scope-0001" };
    expect(await sendMail(db, ctx, body, { provider })).toMatchObject({ ok: false, code: "CONFLICT" });
    await db.update(schema.scopes).set({ status: "SENT" }).where(eq(schema.scopes.id, scope.id));
    expect(await sendMail(db, ctx, body, { provider })).toMatchObject({ ok: true, data: { status: "SENT" } });
    expect(provider.send.mock.calls[0][0].body).toContain("/p/abcdEFGH12345678");
    expect(await sendMail(db, ctx, { ...body, path: "https://evil.example/p/abcdEFGH12345678", idempotencyKey: "key-scope-0002" }, { provider })).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});

describe("retry and dead-letter", () => {
  it("marks a transient failure FAILED with a later retry, then sends it on the next pass", async () => {
    const now = new Date("2026-01-10T05:00:00Z");
    const provider = fakeProvider((_d, n) => {
      if (n === 1) throw new MailError("Gmail returned 503", false);
      return { id: "gm-ok", threadId: null };
    });
    const first = await sendMail(db, ctx, followUp("key-retry-001"), { provider, now });
    expect(first).toMatchObject({ ok: true, data: { status: "FAILED", attempts: 1, lastError: "Gmail returned 503" } });

    expect(await processQueue(db, "default", provider, new Date(now.getTime() + 60_000))).toMatchObject({ attempted: 0 });
    const later = await processQueue(db, "default", provider, new Date(now.getTime() + 6 * 60_000));
    expect(later).toMatchObject({ attempted: 1, sent: 1 });
    const row = (await db.select().from(schema.outboundMessages).where(eq(schema.outboundMessages.idempotencyKey, "key-retry-001")))[0];
    expect(row).toMatchObject({ status: "SENT", attempts: 2, gmailMessageId: "gm-ok", lastError: null });
  });

  it("dead-letters a permanent failure at once", async () => {
    const provider = fakeProvider(() => {
      throw new MailError("Invalid To header", true);
    });
    const result = await sendMail(db, ctx, followUp("key-dead-0001"), { provider });
    expect(result).toMatchObject({ ok: true, data: { status: "DEAD", attempts: 1 } });
    expect(await processQueue(db, "default", provider, new Date(Date.now() + 86_400_000))).toMatchObject({ attempted: 0 });
  });

  it("dead-letters after the maximum number of attempts", async () => {
    const provider = fakeProvider(() => {
      throw new MailError("Gmail returned 500", false);
    });
    const start = new Date("2026-02-01T00:00:00Z");
    await sendMail(db, ctx, followUp("key-max-00001"), { provider, now: start });
    for (let i = 1; i < MAX_ATTEMPTS; i += 1) {
      await processQueue(db, "default", provider, new Date(start.getTime() + i * 10 * 86_400_000));
    }
    const row = (await db.select().from(schema.outboundMessages).where(eq(schema.outboundMessages.idempotencyKey, "key-max-00001")))[0];
    expect(row).toMatchObject({ status: "DEAD", attempts: MAX_ATTEMPTS });
  });

  it("marks the connection revoked when Google says access is gone", async () => {
    await db.insert(schema.mailConnections).values({ orgId: "revoke-org", email: "x@example.test", refreshTokenEnc: "v1:a:b:c" });
    const provider = fakeProvider(() => {
      throw new MailError("revoked", true, true);
    });
    const company = await createCompany(db, { orgId: "revoke-org", userId: "u" }, { name: "Revoke Co" });
    if (!company.ok) throw new Error(company.error);
    await sendMail(db, { orgId: "revoke-org", userId: "u" }, followUp("key-rev-00001", { companyId: company.data.id, dealId: undefined }), { provider });
    const conn = (await db.select().from(schema.mailConnections).where(eq(schema.mailConnections.orgId, "revoke-org")))[0];
    expect(conn.status).toBe("REVOKED");
  });
});

describe("invitations", () => {
  it("only invites an email that already has access", async () => {
    const provider = okProvider();
    expect(await sendInvite(db, ctx, { email: "nobody@example.test", idempotencyKey: "key-inv-00001" }, { provider })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    await db.insert(schema.allowedEmails).values({ email: "client@example.test", role: "CLIENT", companyId });
    const sent = await sendInvite(db, ctx, { email: "Client@Example.test", idempotencyKey: "key-inv-00002" }, { provider });
    expect(sent).toMatchObject({ ok: true, data: { kind: "PORTAL_INVITE", status: "SENT", to: "client@example.test" } });
    expect(provider.send.mock.calls[0][0].body).toContain("/login");
  });
});

describe("digests and outbox", () => {
  it("sends one digest per person per day, listing what is due", async () => {
    const now = new Date("2026-03-05T04:00:00Z");
    await db.insert(schema.user).values({ id: "owner-1", name: "Owner", email: "owner@example.test", createdAt: now, updatedAt: now });
    await db.insert(schema.interactions).values({
      companyId,
      type: "CALL",
      summary: "Called",
      at: now,
      nextAction: "Send revised quote",
      nextActionAt: new Date("2026-03-05T06:00:00Z"),
      createdBy: "owner-1",
    });
    const provider = okProvider();
    expect(await sendFollowUpDigests(db, "default", provider, now)).toEqual({ digests: 1 });
    expect(provider.send.mock.calls[0][0]).toMatchObject({ to: "owner@example.test" });
    expect(provider.send.mock.calls[0][0].body).toContain("Send revised quote");
    await sendFollowUpDigests(db, "default", provider, now);
    expect(provider.send).toHaveBeenCalledTimes(1);
  });

  it("lists the outbox newest first and filters by status", async () => {
    const all = await listOutbox(db, ctx, {});
    const dead = await listOutbox(db, ctx, { status: "DEAD" });
    expect(all.ok && dead.ok && all.data.length > dead.data.length && dead.data.every((m) => m.status === "DEAD")).toBe(true);
    expect(all.ok && "body" in all.data[0]).toBe(false);
  });
});
