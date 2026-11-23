# Runbook

Routine jobs for whoever runs the dashboard. Never paste secrets, client details or backup contents into a chat, an issue or a commit: the repo is public.

## Add or remove a person

- **Staff:** an admin opens `/access`, adds the email with a role (ADMIN, MANAGER or MEMBER). Revoking is immediate: the allowlist is checked on every request.
- **Client, freelancer or agency:** on `/access`, add the email with the role and pick the one record it is linked to. They then see only that record in their portal. **Send invite** emails the sign-in link once Gmail is connected (`docs/INTEGRATIONS.md`).
- **First admin:** put the email in `BOOTSTRAP_ADMIN_EMAILS` on Vercel. An admin cannot change their own access or that of a bootstrap admin.

## Rotate keys

Change values in Vercel (Production), then redeploy. Do not commit `.env` files.

| Key | Effect of changing it |
|---|---|
| `BETTER_AUTH_SECRET` | Everyone is signed out. |
| `CRON_SECRET` | Vercel Cron picks up the new value on redeploy. |
| Database password / `SUPABASE_SECRET_KEY` | Reset in Supabase, then update `DATABASE_URL`, `DIRECT_URL` and `SUPABASE_SECRET_KEY` together. |
| `APP_ENCRYPTION_KEY` | **Do not change it without a plan.** PAN and bank fields on People are encrypted with it; with a new key they cannot be read. Keep the old key safe, and re-enter those fields first. |
| Invoice software upload key | On `/invoices`, tab PDFs from invoice software: make a new key, paste it in the invoice software, revoke the old one. |

## Backups

- **What:** `/api/cron/backup` runs daily at 20:30 UTC (02:00 IST). It saves every table (except login sessions, verification codes and rate limits) as one gzipped JSON file, `daily/YYYY-MM-DD.json.gz`, in the private Supabase Storage bucket `db-backups`, and deletes files older than 30 days.
- **One-time setup:** create the bucket `db-backups` in Supabase Storage (private, not public). `CRON_SECRET`, `SUPABASE_URL` and `SUPABASE_SECRET_KEY` must be set on Vercel. After the first scheduled run, check that Vercel's cron log shows `file`, `rows` and `tables`, and that the file is in the bucket.
- **Contents are sensitive.** The file holds client contacts, amounts and encrypted PAN and bank fields. Keep downloaded copies off shared drives and remove them after use.
- **Not covered:** Supabase Storage files (invoice PDFs, uploaded documents). `scripts/copy-database.ts` copies them when moving projects.
- **Also keep an off-platform copy:** once a month, download the latest file and store it somewhere private outside Supabase.

## Restore from a backup

Always rehearse on a **separate Supabase project**, never on production first.

1. Download the file from the `db-backups` bucket.
2. Point `.env` at the target project (`DIRECT_URL`, the session pooler or direct connection) and apply the schema: `npm run db:migrate`. The schema must match the version that made the backup.
3. Dry run: `npx tsx --env-file=.env scripts/restore-backup.ts <file>`. It prints the backup date and row counts and changes nothing.
4. Restore: add `--yes`. Every table in the file is emptied and refilled in one transaction; if anything fails, nothing changes.
5. Everyone is signed out (sessions are not backed up). Sign in again and check the Overview, one client and one invoice.
6. Restoring into production: stop the team using the app first, take a fresh backup so the current state can be recovered, then restore.

The restore code is tested on in-memory Postgres (`src/server/services/__tests__/backup.test.ts`). A rehearsal on a real scratch project has not been recorded yet; do one and note the date in `handoff.md`.

## Financial year and invoice numbers

Numbers are consecutive per financial year (April to March) and are assigned only when an invoice is issued. Before the first issue of a new year, check that one number on the Invoices page looks right. The invoice software asks `GET /api/ingest/next-number` for its next number, so it follows the dashboard.

## Fix a wrong invoice

Issued invoices are never edited. Issue a **credit note** against it, then raise a corrected invoice. A cancelled invoice keeps its number. Admins can permanently delete an invoice only when it has no payments or credit notes (for example one recorded from a test PDF); the number is not reused.

## When something is wrong

- **Pages hang or time out:** check Vercel logs for `statement timeout`. The database client is shared per instance (`src/server/db/client.ts`); never create clients per call.
- **A deploy failed at migrations:** the old deployment stays live. Read the build log, fix the SQL in `drizzle/`, push again. `DIRECT_URL` must stay set for Production.
- **Nightly jobs silent:** `/api/cron/daily` (overdue marking), `/api/cron/mail` (retries and digests) and `/api/cron/backup` return 401 when `CRON_SECRET` is missing or wrong.
