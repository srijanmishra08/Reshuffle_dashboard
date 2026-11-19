import type { MailDraft } from "./provider";

/** Header values must be one line; CR/LF would let a subject or address add headers of its own. */
export function headerValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 encoded word, so non-ASCII subjects (names, rupee signs) survive. */
export function encodeSubject(subject: string): string {
  const clean = headerValue(subject);
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

/** Base64 body wrapped at 76 characters, as RFC 2045 asks. */
function wrap(base64: string): string {
  return base64.replace(/(.{76})/g, "$1\r\n");
}

/** The raw RFC 2822 message Gmail's `messages.send` expects, base64url encoded. */
export function buildRawMessage(from: string, draft: MailDraft): string {
  const lines = [
    `From: ${headerValue(from)}`,
    `To: ${headerValue(draft.to)}`,
    `Subject: ${encodeSubject(draft.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrap(Buffer.from(draft.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64")),
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}
