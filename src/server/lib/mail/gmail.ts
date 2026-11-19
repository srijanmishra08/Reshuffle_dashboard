import { buildRawMessage } from "./mime";
import { MailError, type MailDraft, type MailProvider, type SentMail } from "./provider";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

type FetchLike = typeof fetch;

type GmailOptions = {
  refreshToken: string;
  fromEmail: string;
  clientId?: string;
  clientSecret?: string;
  fetchImpl?: FetchLike;
};

/** Refresh tokens that Google reports as dead: the mailbox owner revoked access or the token expired. */
function isRevoked(body: { error?: string }): boolean {
  return body.error === "invalid_grant" || body.error === "unauthorized_client";
}

/** Sends through the Gmail REST API with plain `fetch`, so there is no Google SDK to ship. */
export function createGmailProvider(options: GmailOptions): MailProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const clientId = options.clientId ?? process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = options.clientSecret ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
  let cached: { token: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: options.refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const json = (await response.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!response.ok || !json.access_token) {
      if (isRevoked(json)) throw new MailError("Gmail access was revoked. Connect the mailbox again.", true, true);
      throw new MailError(`Could not refresh the Gmail token (${json.error ?? response.status})`, response.status >= 400 && response.status < 500 && response.status !== 429);
    }
    cached = { token: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
    return json.access_token;
  }

  return {
    fromEmail: options.fromEmail,
    async send(draft: MailDraft): Promise<SentMail> {
      const token = await accessToken();
      let response: Response;
      try {
        response = await fetchImpl(SEND_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw: buildRawMessage(options.fromEmail, draft) }),
        });
      } catch (error) {
        throw new MailError(error instanceof Error ? error.message : "Network error sending mail", false);
      }
      const json = (await response.json().catch(() => ({}))) as { id?: string; threadId?: string; error?: { message?: string } };
      if (response.ok && json.id) return { id: json.id, threadId: json.threadId ?? null };

      const message = json.error?.message ?? `Gmail returned ${response.status}`;
      if (response.status === 401) {
        cached = null;
        throw new MailError(message, false);
      }
      // 429 and 5xx are worth retrying; other 4xx (invalid address, forbidden scope) will not improve.
      const transient = response.status === 429 || response.status >= 500;
      throw new MailError(message, !transient, response.status === 403 && /insufficient/i.test(message));
    },
  };
}
