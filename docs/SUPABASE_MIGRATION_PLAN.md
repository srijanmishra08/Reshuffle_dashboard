# Plan: move the database from Turso (SQLite) to Supabase (Postgres)

**Status:** plan only, nothing built. Written 2026-11-12 against `main` at `cf8651a` (Phase 0 and Phase 1 done).

**Supersedes:** decision D1 in `plan.md` ("one database: Turso"). Everything else in `plan.md` still stands.

> This repo is public. Never commit the Supabase project URL, keys, database password or any connection string. Use env vars only. The "publishable" key is designed to be public, but it is not needed by this plan and stays out of the repo too.

---

## 1. What we are moving

| Item | Where it is today |
|---|---|
| Schema (Drizzle, SQLite dialect) | `src/server/db/schema/{auth,core,crm}.ts`, migrations in `drizzle/` |
| Client | `src/lib/turso.ts` (`@libsql/client`), `src/server/db/client.ts` (`drizzle-orm/libsql`) |
| Raw-SQL legacy code that bypasses Drizzle | `src/server/services/pipeline-items.ts`, `freelancers.ts`, `src/app/api/{tasks,projects}/route.ts`, `src/app/api/social/entries/**` |
| Tests | `src/test/db.ts` builds a temp SQLite file and runs the migrations |
| Scripts | `scripts/migrate.ts`, `scripts/import-notion.ts`, `drizzle.config.ts` (`dialect: "turso"`) |
| Data | Production Turso DB: legacy rows (clients, projects, tasks, pipeline_items, social_entries, freelancers, activity_logs, automation_rules) plus new tables, which are still empty because Phase 1 is not deployed yet |

The data set is tiny (hundreds of rows at most), so this is a code and schema migration, not a big-data one.

## 2. Decisions

| # | Decision | Why | Trade-off |
|---|---|---|---|
| S1 | **Use Supabase as plain managed Postgres.** Server code talks to it through Drizzle over a Postgres connection string. | The app already has a service layer and authz; going through Postgres keeps one data path and keeps Drizzle migrations. | We do not use Supabase's REST API, client SDK or Row Level Security as the access model. |
| S2 | **Keep Better Auth**, switch its adapter to `provider: "pg"`. Do not adopt Supabase Auth. | Roles, the email allowlist and org scoping already work with Better Auth. Swapping auth too doubles the risk and has no payoff now. | Supabase Auth would give its dashboard and more providers, at the cost of a rewrite of `auth.ts`, `authz.ts` and the proxy. Revisit only if we want it later. |
| S3 | **Drizzle `pg-core` with `postgres` (postgres.js)** as the driver. Runtime uses the **pooler** (transaction mode, `prepare: false`); migrations use the **direct or session** connection. | Vercel functions open many short connections; the transaction pooler is built for that. Prepared statements are not supported in transaction mode. | Two connection strings to manage. |
| S4 | **Turn on Row Level Security for every table, with no policies.** | Supabase exposes the `public` schema through its REST API. Without RLS, anyone holding the publishable key could read or write our tables. The server connects as the database owner role, which bypasses RLS, so the app is unaffected. | Anything that later uses the REST API or client SDK needs explicit policies. |
| S5 | **Fix the data types while we are here.** | The Phase 1 review found mixed timestamp formats and JSON stored as text. | Slightly more mapping work in the data copy. |
| S6 | **Port the raw-SQL legacy code to Drizzle first, on SQLite, before changing dialect.** | Then the dialect switch is a schema and driver swap, and every step is testable. The raw SQL uses SQLite `?` placeholders and `CURRENT_TIMESTAMP` text, which would all break at once otherwise. | One extra step up front. |
| S7 | **Tests move to PGlite** (`@electric-sql/pglite`, in-memory Postgres in Node) with `drizzle-orm/pglite`. | Runs the same migrations, needs no Docker and no network, and CI stays simple. | Tiny behaviour differences from real Postgres, so also run the suite once against a Supabase branch or scratch project before cutover. |
| S8 | **Files:** optional follow-up to use Supabase Storage instead of Vercel Blob (D10). Not part of this migration. | One less vendor. | Decide when Phase 2 needs uploads. |

## 3. Type mapping (SQLite to Postgres)

| Today | Postgres | Notes |
|---|---|---|
| `text` ids (cuid2, legacy uuid/`fr-…` strings) | `text` | Keep as text. No id changes, so foreign keys and external ids stay valid. |
| Business timestamps as ISO text (`created_at`, `updated_at`, `at`, `next_action_at`, `archived_at`…) | `timestamptz` | Convert with `USING value::timestamptz`. This removes the ordering bug from mixed formats. |
| Legacy `CURRENT_TIMESTAMP` text (`YYYY-MM-DD HH:MM:SS`) | `timestamptz` | Those values are UTC. Cast as `value || '+00'`. |
| Better Auth timestamps (integer ms) | `timestamptz` | Better Auth's drizzle adapter works with `timestamp` columns on Postgres. |
| `integer` booleans (`onboarded`, `approved`, `enabled`, `active`) | `boolean` | `value <> 0`. |
| JSON stored as text (`attendees`, `bank_details`, `metadata`, `condition_json`, `action_json`) | `jsonb` | Parse in the copy script, fail loudly on bad rows. |
| Money (future `*_paise`) | `bigint` with `mode: "number"` | Safe up to 9e15 paise. Still guard per line. |
| `INSERT … ON CONFLICT DO NOTHING`, `UPDATE … RETURNING` | same | Numbering (`nextNumber`) works unchanged, and real transactions now behave properly under concurrency. |
| Partial indexes | supported | Add the ones from the review (next-action queries). |

## 4. Steps

Each step ends with `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` green. Steps 1 to 3 do not touch production.

### Step 0: prerequisites (needs you)
- [ ] Postgres **connection strings** from the Supabase dashboard (Project settings → Database): the pooler URI (transaction mode, port 6543) and the direct or session URI. The publishable key and project URL cannot run migrations or DDL, so they are not enough.
- [ ] Decide the **plan tier**. Free projects pause after a period of inactivity and have no point-in-time recovery. Check current limits in the dashboard. For an internal tool people rely on daily, Pro is the safer default.
- [ ] Note the project **region** and set the Vercel function region to match, otherwise each query pays a cross-region round trip.
- [ ] Confirm the Supabase MCP connector is authorised for this project if you want me to inspect tables, run advisors or apply migrations from here. It returned a permission error in this session.

### Step 1: port legacy raw SQL to Drizzle (SQLite, no behaviour change)
- Rewrite `pipeline-items.ts`, `freelancers.ts`, `tasks`, `projects` and `social/entries` routes to use `getDb()` and the existing schema tables.
- Remove `src/lib/turso.ts` usage from services (`getTursoClient` only remains inside `db/client.ts`).
- Fix review findings that live in these files: demo-seed on read path in `pipeline-items.ts` (seed once, never on GET), explicit ISO timestamps on every write.
- Add tests for the ported services using the existing temp-SQLite helper.

### Step 2: Postgres schema and migrations
- Add `drizzle-orm/pg-core` versions of `auth.ts`, `core.ts`, `crm.ts` under `src/server/db/schema/` (swap imports; apply the type mapping above).
- New `drizzle.config.ts` with `dialect: "postgresql"`, `out: "./drizzle"`; archive the SQLite migrations to `drizzle-sqlite-archive/`.
- Generate a fresh **baseline** migration for Postgres (no `IF NOT EXISTS` hack needed: Supabase starts empty).
- Hand-add to the migration: `ALTER TABLE … ENABLE ROW LEVEL SECURITY` for every table (S4), the 8 vertical seed rows, and the partial indexes from the review (`companies`/`interactions` next-action, company list sort, `interactions.contact_id`).
- Add a migration guard test: a script that fails CI if any `public` table lacks RLS.
- `scripts/migrate.ts` uses the direct connection (`DIRECT_URL`).

### Step 3: driver, auth adapter, tests
- `src/server/db/client.ts`: `drizzle-orm/postgres-js` over `postgres(DATABASE_URL, { prepare: false, max: 1 })` (one connection per function instance, pooler handles fan-in). Keep a `getDb()` singleton and the `Db` type.
- `src/server/auth.ts`: `drizzleAdapter(getDb(), { provider: "pg", … })`.
- `src/test/db.ts`: PGlite instance + `drizzle-orm/pglite`, run migrations, return `{ db, cleanup }`. Update the migration-adoption test (it exists to protect Turso production; replace it with a "fresh DB migrates and RLS is on everywhere" test).
- The numbering concurrency test can now use real parallel transactions again.
- Remove `@libsql/client` from the app (keep it as a dev dependency only for the data-copy script).
- Update `.env.example`: `DATABASE_URL` (pooler), `DIRECT_URL` (direct), drop `TURSO_*` after cutover.

### Step 4: data copy script
`scripts/turso-to-supabase.ts` (run locally, secrets from env, never logs row contents):
1. Connect to Turso (read) and Supabase (write via `DIRECT_URL`).
2. For each table in foreign-key order (`verticals`, `companies`, `contacts`, `interactions`, `meetings`, `attachments`, `user`, `session`, `account`, `verification`, `allowed_emails`, `org_settings`, `number_series`, then legacy tables), read rows, convert types per section 3, insert in batches inside **one transaction**.
3. `--dry-run` prints per-table counts and any conversion failures without writing.
4. Idempotent: refuses to run if target tables are non-empty unless `--truncate` is passed.
5. Verification report: row counts equal per table, plus a per-table checksum (count + sum of lengths of key text columns) on both sides, and a spot check that every foreign key resolves.
6. Sessions: do not copy `session` rows. Everyone signs in again after cutover, which is simpler and safer.

### Step 5: rehearsal on a Supabase branch or scratch project
- Run migrations, run the copy against a **snapshot** of Turso, run the full test suite against that Postgres, click through `/crm`, `/settings`, boards.
- Run Supabase's security and performance advisors (via the MCP connector if authorised) and fix anything flagged, especially RLS and missing indexes.
- Time the copy so we know the freeze window.

### Step 6: cutover (about 30 minutes)
1. Announce a short freeze. Put the app behind a maintenance flag or simply stop editing.
2. Take a final Turso snapshot (export). Keep it.
3. Run `npm run db:migrate` against Supabase, then the copy script for real, then the verification report.
4. Set `DATABASE_URL` and `DIRECT_URL` on Vercel (Production and Preview), deploy the Postgres build.
5. Smoke test: sign in, list companies, create and edit a company and a contact, log an interaction, move a card on a board, open `/settings` as admin.
6. Lift the freeze.

### Step 7: after cutover
- Keep the Turso database **read-only and untouched for two weeks** as the rollback target.
- Replace the planned nightly `/api/cron/backup` (plan.md section 10) with Supabase backups (enable PITR on a paid plan) plus a periodic `pg_dump` to storage for an off-platform copy.
- Delete Turso, remove `TURSO_*` from Vercel, remove `@libsql/client`, update `plan.md` D1, `handoff.md` and the run instructions.

## 5. Rollback
- Before step 6.4: nothing in production changed. Abort and fix.
- After step 6.4 but within the freeze: redeploy the previous build (still on Turso, data unchanged) and lift the freeze.
- After writes have happened on Supabase: rolling back means losing those writes unless they are re-entered, so decide at the smoke test, before reopening to the team. After that point, fix forward.

## 6. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Data copy converts a timestamp or JSON value wrongly | Medium | Medium | Dry run, per-table checksums, failure on any bad row, rehearsal on a snapshot |
| Tables exposed through Supabase's public REST API | Certain if RLS is forgotten | **High** | S4: RLS on every table, CI check that fails when one lacks it, advisors run before cutover |
| Connection exhaustion on Vercel | Medium | Medium | Transaction pooler, `max: 1`, `prepare: false`; never use the direct URL at runtime |
| Free-tier project pauses from inactivity | Medium on free tier | High (app down) | Choose a paid tier, or add a keep-alive cron; check current limits |
| Cross-region latency | Medium | Low | Match Vercel region to Supabase region |
| Behaviour differences between PGlite tests and real Postgres | Low | Medium | One full test run against a real Supabase project before cutover |
| Everyone signed out at cutover | Certain | Low | Announce it; sessions are deliberately not copied |
| Secrets committed to the public repo | Low | High | Env vars only; nothing from this plan's credentials goes in git |
| Scope creep into Supabase Auth, Storage, Realtime | Medium | Medium | Out of scope here; listed as follow-ups |

## 7. Effort

About 3 to 4 focused days: step 1 (1 day), steps 2 and 3 (1 to 1.5 days), step 4 (half a day), steps 5 and 6 (half a day plus the rehearsal), step 7 (a couple of hours spread over the following weeks).

## 8. Out of scope (possible follow-ups)

- Supabase Auth or social providers beyond Google.
- Supabase Storage replacing Vercel Blob for logos, signatures and PDFs.
- Supabase Realtime replacing polling on boards.
- Using RLS policies plus the client SDK so the browser talks to Postgres directly.

## 9. Open questions for Srijan

1. Can you share the **database connection strings** (pooler and direct) through Vercel and your local `.env`, not in chat or git?
2. Which Supabase **plan tier**, and what **region** is the project in?
3. Keep **Better Auth** (recommended) or move to Supabase Auth?
4. Is it acceptable that everyone has to **sign in again** at cutover?
5. Should I authorise the **Supabase MCP connector** for this project so I can run advisors and apply migrations from here?
