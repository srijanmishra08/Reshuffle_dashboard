# Runbook

Last checked against the code on 2026-11-24. Phase 10, step 6 of `development-plan.md`.

Hard rule for everything below: never paste secrets, client details or database contents into the repo, a chat or a ticket.

## Add or remove a user

1. Sign in as an ADMIN and open `/access`.
2. Add the person's email with a role. Staff roles are ADMIN, MANAGER and MEMBER. Outside people are CLIENT, FREELANCER or AGENCY, and each is linked to one client, freelancer or agency record.
3. Send the sign-in link from `/access` (needs Gmail connected under Settings), or send it yourself. Sign-in is Google only.
4. To remove access, revoke or deactivate the row on `/access`. The allowlist is re-checked on every request, so it takes effect at once.
5. You cannot change your own access, or the access of an email in `BOOTSTRAP_ADMIN_EMAILS`. To change those, edit the Vercel variable.

## Rotate keys and secrets

Set new values in the Vercel Production environment, then redeploy. Do not commit `.env` files.

| Secret | Notes |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Reset the password in Supabase first, percent-encode special characters. `DIRECT_URL` must stay set: production migrations use it. |
| `SUPABASE_SECRET_KEY` | Used for private file storage. |
| `BETTER_AUTH_SECRET` | Changing it signs everyone out. |
| `CRON_SECRET` | Protects `/api/cron/*`. |
| `APP_ENCRYPTION_KEY` | **Do not rotate casually.** It encrypts PAN and bank fields in People and the Gmail refresh token. A new key cannot read old values. Re-enter those fields, and reconnect Gmail, after changing it. |
| Invoice software key | On Invoices > PDFs from invoice software, revoke the old key and make a new one. Paste it once into the invoice software in each browser. |
| Gmail | Settings > Email: Disconnect, then Connect Gmail again. |

## Back up and restore

The database is Supabase Postgres in Mumbai (`ap-south-1`); files are in Supabase Storage.

- Automatic backup to Blob (`/api/cron/backup`) is **not built yet**. Until it is, take a copy of the database from the Supabase dashboard before any risky change, and keep it outside the repo.
- To copy everything (tables and files) into another Supabase project, use `scripts/copy-database.ts`. `--check` changes nothing, `--copy` copies and then verifies each table by row count and checksum, `--verify` only verifies. Full steps and the switch order are in section 13 of `handoff.md`.
- A restore has **not been tested yet**. Test one on a spare Supabase project before relying on this section, and record the date in the handoff session log.

## Start a new financial year

Invoice numbers are consecutive per financial year (April to March, India time), at most 16 characters, and are assigned only when an invoice is issued, inside the issuing transaction. The financial year changes by itself on 1 April (IST); no manual step is needed. Check the first invoice of the new year on its PDF. Numbers from the old year are never reused.

The invoice software uses its own pattern, `PREFIX/YEAR/MONTH/NN`. The dashboard supplies the next one through `GET /api/ingest/next-number`.

## Fix a wrong invoice

Issued invoices are never edited.

1. Open the invoice and use "Cancel with a credit note" (`POST /api/invoices/[id]/cancel`). It raises a credit note in its own series, and the cancelled invoice keeps its number. The credit note PDF is at `/api/invoices/[id]/credit-note/pdf`.
2. Issue a corrected invoice.
3. Admins can permanently delete an invoice only when it has no payment and no credit note. The number is not reused. Use this for test or mistaken uploads, not for real invoices that went to a client.
4. An invoice created from an uploaded PDF that was held back shows a reason on Invoices > PDFs from invoice software. Fix the cause (for example fill Settings, or the client details) and press Record as invoice.

## Deploy, migrations and rollback

- Pushing to `main` deploys to production (`npm run vercel-build` applies new files under `drizzle/` first, then builds). A failed migration fails the build and the old deployment stays live.
- Run `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build` before pushing. The GitHub `check` job is currently broken, so do not rely on it.
- To roll back code, promote the previous deployment in Vercel. Migrations are not rolled back; destructive ones (for example `0025`) need a database copy to undo.
- Never run migrations by hand against production and never point experiments at it. Use a separate Supabase project.

## Daily jobs

| Path | Time (UTC) | What it does |
|---|---|---|
| `/api/cron/daily` | 02:30 | Marks open invoices past their due date as overdue. |
| `/api/cron/mail` | 03:00 | Retries failed outbound mail, sends each person a digest of follow-ups due. |

If a job stops, check that `CRON_SECRET` is set on Vercel and look at the function logs for the path.

## Loading the real data (Notion import)

This needs a person: the real Notion CSV export and access to production, which automated runs must not touch.

1. Export Notion as CSV to a folder **outside the repo**.
2. Against a spare Supabase project first: `npx tsx scripts/import-notion.ts <export-dir> --only=clients,meetings --dry-run`, review, fix the alias lists, then run without `--dry-run`.
3. Only then repeat against production, with a database copy taken first.
4. Record the run in the handoff session log (counts only, no names).
