# Runbook

Short, practical steps for the jobs that come up after go-live. Never paste secrets into chat, commits or screenshots.

## Add or remove a person
1. Sign in as an ADMIN and open `/access`.
2. Staff: add the email with a role (ADMIN, MANAGER, MEMBER). Outside people: pick CLIENT, FREELANCER or AGENCY and link the record they should see.
3. Send the sign-in link from `/access` (needs Gmail connected in Settings) or share `<app URL>/login` yourself.
4. To remove access, revoke the row. The allowlist is checked on every request, so it ends at once. Emails in `BOOTSTRAP_ADMIN_EMAILS` cannot be changed from the screen.

## Backups
- The daily cron (`/api/cron/daily`, 02:30 UTC) also writes `daily/YYYY-MM-DD.json.gz` to the private Supabase Storage bucket `db-backups` and deletes dumps older than 30 days. The bucket is created on first run. `GET /api/cron/backup` with `Authorization: Bearer $CRON_SECRET` takes one on demand.
- `CRON_SECRET` must be set on Vercel, or both routes refuse to run.
- A dump holds every table as JSON. It leaves out `session`, `verification` and `account` (people sign in again after a restore). It reads the whole database into memory, so move to a streaming dump if the database grows past a few hundred MB. Uploaded PDFs live in storage buckets, not in the dump; Supabase keeps those, and `scripts/copy-database.ts` copies them when moving projects.
- Supabase's own daily backups (project settings) are a second layer. Check the plan includes them.

## Restore from a backup
Practise this once on a scratch Supabase project, never on production first.
1. Download the file from Storage > `db-backups` > `daily/`, and `gunzip` it. Keep it outside the repo.
2. Create an empty project, set its `DIRECT_URL`, and run `npm run db:migrate` so the schema exists.
3. For each table in `tables` (parents before children; `orderTablesByForeignKeys` in `src/server/ops/copy-database.ts` gives the order), insert the rows with `insert into "<table>" select * from jsonb_populate_recordset(null::"<table>", $1)`, passing that table's rows as JSON.
4. Check row counts per table against the file. Sign in with a bootstrap admin email, then re-grant others if `allowed_emails` was not current.
5. Point Vercel's database variables at the restored project only if production is truly lost.

## Rotate keys
- `BETTER_AUTH_SECRET`: change it on Vercel and redeploy. Everyone is signed out once.
- Invoice software key: `/invoices` > PDFs tab, revoke the old key, make a new one, paste it once in the invoice software.
- `APP_ENCRYPTION_KEY`: do not change it without re-encrypting People PAN/bank fields and Gmail tokens first; old values become unreadable.
- Database password or Supabase secret key: reset in Supabase, update `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_SECRET_KEY` on Vercel, redeploy.

## Start a new financial year's numbers
Invoice numbers are consecutive per financial year (April to March) and assigned only at issue, so the series restarts by itself on 1 April. Check the first invoice of the year after issuing it. The invoice software's `PREFIX/YEAR/MONTH/NN` numbers come from `GET /api/ingest/next-number` and restart each month.

## Fix a wrong invoice
Issued invoices are never edited. Open the invoice, create a credit note for the wrong amount, then issue a corrected invoice. An invoice with no payment or credit note that should not exist at all can be permanently deleted by an admin; its number is not reused.
