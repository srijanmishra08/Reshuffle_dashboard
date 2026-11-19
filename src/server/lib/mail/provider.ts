export type MailDraft = { to: string; subject: string; body: string };
export type SentMail = { id: string; threadId: string | null };

/**
 * A send that failed. `permanent` means retrying cannot help (bad address, revoked access), so the message goes
 * straight to the dead-letter state. `revoked` means the mailbox connection itself no longer works.
 */
export class MailError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
    readonly revoked = false
  ) {
    super(message);
    this.name = "MailError";
  }
}

/** What the outbox needs from a mail service. Gmail implements it; tests pass a fake. */
export interface MailProvider {
  readonly fromEmail: string;
  send(draft: MailDraft): Promise<SentMail>;
}
