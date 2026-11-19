# Integrations

Last checked against the code on 2026-11-19.

## Built: the invoice software

The standalone invoice site (`reshuffle-invoice`, static HTML) talks to the dashboard through two public, key-protected endpoints (`/api/ingest` is a public path; the key is the credential):

- `POST /api/ingest/documents`: the site uploads each invoice or work order PDF after the normal download. The dashboard stores the file privately, records its details, and for an invoice also records it as a dashboard invoice (creating the client if it is new). Only `INVOICE` and `WORK_ORDER` PDFs up to 8 MB that start with `%PDF-` are accepted.
- `GET /api/ingest/next-number?prefix=RESHUFFLE&year=2026&month=5`: returns the next invoice number in the pattern `PREFIX/YEAR/MONTH/NN`, one more than the highest number among invoices the dashboard accepted that month.

Security rules: upload-only bearer keys stored as SHA-256 hashes, made and revoked by admins on Invoices > PDFs from invoice software; browsers allowed only from `INGEST_ALLOWED_ORIGINS` (default the invoice site); rate limits per address and per key. Code: `src/app/api/ingest/*`, `services/ingest.ts`, `lib/public-paths.ts`.

## Built: scheduled work

Vercel Cron calls `/api/cron/daily` (protected by `CRON_SECRET`) every day at 02:30 UTC. It flags open invoices past their due date.

## Built: email through Gmail

Follow-up emails (Due follow-ups panel, client contacts), lead outreach (Outreach board), portal invitations (Access page, admin only), scope links (scope editor, after creating the share link) and a daily follow-up digest all send from one connected Gmail account.

- **Connect once:** an admin opens Settings > Email (Gmail) > Connect Gmail. This is a separate Google consent from sign-in and asks only for `gmail.send`. The refresh token is encrypted with `APP_ENCRYPTION_KEY` and stored in `mail_connections`. If Google revokes it, the card says so and the outbox stops trying.
- **Outbox:** every message is a row in `outbound_messages` with a per-message `idempotency_key` (repeating a key returns the first message, never a second email), attempts, and the Gmail message and thread ids. A transient failure (5xx, 429, network) retries with backoff and goes `DEAD` after 5 attempts; a permanent one (bad address, revoked access) goes `DEAD` at once. The Settings card lists recent mail and failures.
- **Cron:** `/api/cron/mail` (03:00 UTC, `CRON_SECRET`) retries due messages and sends each team member one digest of their follow-ups due today or overdue. Vercel Cron runs it once a day, so a failed message is retried at the next run unless something else sends it first.
- **Logging:** each send is logged with `logActivity` (`mail.sent`, `mail.failed`, `mail.dead`); follow-ups, outreach and scope links also add an `EMAIL` interaction to the client.
- **Code:** `src/app/api/mail/*`, `src/app/api/cron/mail`, `services/outbound-mail.ts`, `services/mail-connection.ts`, `src/server/lib/mail/` (Gmail provider, MIME, OAuth). Tests inject a fake `MailProvider`, so none of them reach Google.
- **One-time setup outside the code:** in Google Cloud enable the Gmail API, add the `gmail.send` scope to the OAuth consent screen, and add `https://<your-domain>/api/mail/callback` as an authorized redirect URI. A mailbox on a Google Workspace domain avoids the "unverified app" warning that a plain Gmail account sees until the app is verified.

## Built: file storage

Private files go to Supabase Storage through `src/server/lib/storage.ts` (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`). Nothing is public; files are served only through authenticated routes.

## Not built (candidates, in priority order)

1. Overdue-invoice reminders by email (the mail outbox exists; nothing queues them yet).
2. WhatsApp API for outreach notifications.
3. Social publishing and analytics APIs.
4. Accounting sync (Tally or Zoho Books).
5. Calendar sync for meetings, events and follow-ups.
6. Dev lifecycle integrations (issue tracker, deployment events).

## Rules for any new integration

- Idempotent operations keyed by an external id.
- Retry with backoff; dead-letter after repeated failures.
- A `logActivity` entry for each sync action.
- Secrets only in Vercel environment variables, never in the repo (the repo is public).
- Vercel has no long-running process: use Cron routes, not workers.
