import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const MAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.send", "openid", "email"];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const STATE_TTL_MS = 10 * 60 * 1000;

export function mailRedirectUri(): string {
  if (process.env.GOOGLE_MAIL_REDIRECT_URI) return process.env.GOOGLE_MAIL_REDIRECT_URI;
  const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}/api/mail/callback`;
}

function stateKey(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", stateKey()).update(payload).digest("base64url");
}

/** Signed, short-lived value that ties the Google redirect back to the admin who started it. */
export function createState(userId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, exp: now + STATE_TTL_MS, n: randomBytes(8).toString("hex") })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyState(state: string | null, userId: string, now = Date.now()): boolean {
  if (!state) return false;
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: string; exp?: number };
    return parsed.u === userId && typeof parsed.exp === "number" && parsed.exp > now;
  } catch {
    return false;
  }
}

/** `access_type=offline` and `prompt=consent` are what make Google return a refresh token. */
export function buildConsentUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: mailRedirectUri(),
    response_type: "code",
    scope: MAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type ExchangedMailbox = { refreshToken: string; email: string; scope: string | null };

/** Trades the one-time code for a refresh token and reads which mailbox was connected. */
export async function exchangeCode(code: string, fetchImpl: typeof fetch = fetch): Promise<ExchangedMailbox> {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: mailRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  const json = (await response.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; scope?: string; error?: string };
  if (!response.ok || !json.access_token) throw new Error(`Google refused the code (${json.error ?? response.status})`);
  if (!json.refresh_token) throw new Error("Google did not return a refresh token. Remove the app's access in your Google account and connect again.");
  if (!json.scope?.includes("gmail.send")) throw new Error("The gmail.send permission was not granted");

  const info = await fetchImpl(USERINFO_URL, { headers: { Authorization: `Bearer ${json.access_token}` } });
  const profile = (await info.json().catch(() => ({}))) as { email?: string };
  if (!info.ok || !profile.email) throw new Error("Could not read the connected mailbox address");
  return { refreshToken: json.refresh_token, email: profile.email.toLowerCase(), scope: json.scope ?? null };
}
