# Integrations

Last checked against the code on 2026-11-18.

## Built: the invoice software

The standalone invoice site (`reshuffle-invoice`, static HTML) talks to the dashboard through two public, key-protected endpoints (`/api/ingest` is a public path; the key is the credential):

- `POST /api/ingest/documents`: the site uploads each invoice or work order PDF after the normal download. The dashboard stores the file privately, records its details, and for an invoice also records it as a dashboard invoice (creating the client if it is new). Only `INVOICE` and `WORK_ORDER` PDFs up to 8 MB that start with `%PDF-` are accepted.
- `GET /api/ingest/next-number?prefix=RESHUFFLE&year=2026&month=5`: returns the next invoice number in the pattern `PREFIX/YEAR/MONTH/NN`, one more than the highest number among invoices the dashboard accepted that month.

Security rules: upload-only bearer keys stored as SHA-256 hashes, made and revoked by admins on Invoices > PDFs from invoice software; browsers allowed only from `INGEST_ALLOWED_ORIGINS` (default the invoice site); rate limits per address and per key. Code: `src/app/api/ingest/*`, `services/ingest.ts`, `lib/public-paths.ts`.

## Built: scheduled work

Vercel Cron calls `/api/cron/daily` (protected by `CRON_SECRET`) every day at 02:30 UTC. It flags open invoices past their due date.

## Built: file storage

Private files go to Supabase Storage through `src/server/lib/storage.ts` (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`). Nothing is public; files are served only through authenticated routes.

## Not built (candidates, in priority order)

1. Email provider (portal invitations, follow-up and overdue reminders). Today an admin sends the sign-in link by hand.
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
