import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGmailProvider } from "@/server/lib/mail/gmail";
import { buildRawMessage, encodeSubject, headerValue } from "@/server/lib/mail/mime";
import { createState, verifyState } from "@/server/lib/mail/oauth";
import { MailError } from "@/server/lib/mail/provider";

const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

describe("mime", () => {
  it("strips line breaks so a subject cannot add headers", () => {
    expect(headerValue("Hi\r\nBcc: attacker@example.test")).toBe("Hi Bcc: attacker@example.test");
    expect(decode(buildRawMessage("a@example.test", { to: "b@example.test\r\nBcc: x@example.test", subject: "S", body: "B" }))).not.toMatch(/\r\nBcc:/);
  });

  it("encodes non-ASCII subjects and leaves plain ones alone", () => {
    expect(encodeSubject("Plain subject")).toBe("Plain subject");
    expect(encodeSubject("Scope ₹50,000")).toMatch(/^=\?UTF-8\?B\?.+\?=$/);
  });

  it("builds a base64 UTF-8 body with CRLF line breaks", () => {
    const raw = decode(buildRawMessage("From <a@example.test>", { to: "b@example.test", subject: "S", body: "line one\nline two ₹" }));
    expect(raw).toContain("To: b@example.test");
    expect(raw).toContain("Content-Transfer-Encoding: base64");
    const body = raw.split("\r\n\r\n")[1].replace(/\r\n/g, "");
    expect(Buffer.from(body, "base64").toString("utf8")).toBe("line one\r\nline two ₹");
  });
});

describe("oauth state", () => {
  beforeEach(() => vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret"));
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a fresh state for the same admin only", () => {
    const state = createState("admin-1", 1_000);
    expect(verifyState(state, "admin-1", 2_000)).toBe(true);
    expect(verifyState(state, "admin-2", 2_000)).toBe(false);
  });

  it("rejects expired, tampered and missing states", () => {
    const state = createState("admin-1", 1_000);
    expect(verifyState(state, "admin-1", 1_000 + 11 * 60 * 1000)).toBe(false);
    expect(verifyState(`${state}x`, "admin-1", 2_000)).toBe(false);
    expect(verifyState(null, "admin-1")).toBe(false);
  });
});

describe("gmail provider", () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const make = (responses: Response[]) => {
    const fetchImpl = vi.fn(async () => responses.shift() ?? json(500, {}));
    return { fetchImpl, provider: createGmailProvider({ refreshToken: "r", fromEmail: "me@example.test", clientId: "c", clientSecret: "s", fetchImpl: fetchImpl as unknown as typeof fetch }) };
  };

  it("refreshes the token, then sends and returns the Gmail ids", async () => {
    const { provider, fetchImpl } = make([json(200, { access_token: "tok", expires_in: 3600 }), json(200, { id: "m1", threadId: "t1" })]);
    await expect(provider.send({ to: "b@example.test", subject: "S", body: "B" })).resolves.toEqual({ id: "m1", threadId: "t1" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("treats invalid_grant as a revoked, permanent failure", async () => {
    const { provider } = make([json(400, { error: "invalid_grant" })]);
    const error = await provider.send({ to: "b@example.test", subject: "S", body: "B" }).catch((e) => e);
    expect(error).toBeInstanceOf(MailError);
    expect(error).toMatchObject({ permanent: true, revoked: true });
  });

  it("retries 5xx and 429 but not other 4xx", async () => {
    for (const [status, permanent] of [[503, false], [429, false], [400, true]] as const) {
      const { provider } = make([json(200, { access_token: "t" }), json(status, { error: { message: "nope" } })]);
      expect(await provider.send({ to: "b@example.test", subject: "S", body: "B" }).catch((e) => e)).toMatchObject({ permanent });
    }
  });
});
