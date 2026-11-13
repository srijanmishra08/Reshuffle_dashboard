# Handoff: ReShuffle Dashboard

This is for whoever picks up the build next, whether a developer, Srijan, or a coding agent. Read it first, then `plan.md` (what we are building and why) and `development-plan.md` (the order to build it in).

**As of:** 2026-11-12. Phase 0 and Phase 1 are on `main` and deployed; the database is Supabase Postgres.

**Owner:** Srijan (founder, Reshuffle OPC, Raipur).

---

## 1. The mission in one paragraph

Reshuffle runs on scattered tools today:
- A Notion workspace ("Reshuffle OS") for clients, sales leads, goals, marketing, finance and events.
- A static invoice site (`reshuffle-invoice`, live at invoice-eight-neon.vercel.app) for GST invoices, work orders, offer letters, salary slips and letterhead.
- Google Docs and Canva for scopes and playbooks.

This dashboard replaces all of them with one logged-in app. The spine of it is lead → diagnosis → scope → accepted → project + work order + invoices → payments → maintenance. That spine must work end to end before anything decorative.

---

## 2. What exists today

| Piece | State | Notes |
|---|---|---|
| Auth | **Done (Phase 0)** | Better Auth, Google sign-in, allowlist, roles. `src/server/auth.ts`, `src/server/authz.ts`, `src/proxy.ts`. Every `/api/*` route calls `requireStaff()` or `requireRole()`. |
| Database layer | **Done** | Drizzle on Supabase Postgres (`postgres-js`, transaction pooler). Schema in `src/server/db/schema/*`, migrations in `drizzle/`. Row level security is enabled on every table. |
| Money, GST, numbering | **Done, tested** | `src/server/lib/money.ts`, `src/server/services/gst.ts`, `src/server/services/numbering.ts`. Not yet used by any UI (invoices are Phase 2). |
| Settings (org, GSTIN, bank, signatory) | **Done, no uploads** | `/settings`, ADMIN only. Logo and signature uploads wait for Phase 2 (Vercel Blob). |
| CRM (Phase 1) | **Built** | Companies, contacts, interactions, meetings, follow-ups, verticals. `/crm` (table + lifecycle board), `/crm/[id]`. APIs under `/api/companies`, `/api/followups`, `/api/verticals`. |
| Notion import (clients, products, meetings) | **Built, untested on real export** | `scripts/import-notion.ts`, logic in `src/server/import/notion.ts`. Column names are guessed from the handoff, so run `--dry-run` on the real export and adjust the alias lists. |
| UI shell, nav | Works | `src/components/dashboard-shell.tsx`, `src/lib/navigation.ts` |
| Generic kanban boards | Works | `PipelineBoard` now polls every 20 s instead of SSE. Still backed by `pipeline_items` for social, projects, outreach, app-dev, events, etc. |
| Pipeline transitions + activity log | Works | `src/server/services/pipeline.ts`, `activity.ts` (activity now uses Drizzle) |
| Social, freelancers, projects, tasks, pipeline items | Work, legacy tables | Now Drizzle-backed services (`src/server/services/{social,freelancers,projects,tasks,pipeline-items}.ts`). Demo cards and demo freelancers are no longer seeded. Replaced by real domain tables in Phases 5 and 7. |
| Overview KPIs + feed | **Fake** | Marked "Sample data". Real KPIs in Phase 8. |
| Finance page | **Not persisted** | Phase 6 |
| Events page | Fixed | Now shows the `events` pipeline board |
| Removed | Gone | Prisma, tRPC, BullMQ worker, in-memory SSE realtime, automation trigger route, `/api/clients` |
| Tests / CI | **Done** | Vitest (`npm test`), 37 tests. `.github/workflows/ci.yml` runs lint, tsc, test, build. |

### Sibling repo: `reshuffle-invoice`
- Static HTML: `invoice-generator.html`, `work-order.html`, `offer-letter.html`, `salary-slip.html`, `letterhead.html`.
- PDFs are made with `html2pdf.js` 0.10.2 in the browser.
- No storage and no auto numbering.
- The GST maths is CGST 9% + SGST 9% only. It is **wrong for out-of-state clients**, who need IGST 18%.
- Signature and logo PNGs are committed to a **public** repo. Remove them and consider making the repo private.
- Last commit `38aa4e1` (2026-08-12).

---

## 3. How to run it

```bash
npm install
cp .env.example .env      # fill DATABASE_URL, DIRECT_URL, BETTER_AUTH_*, GOOGLE_*
npm run db:migrate        # creates/updates the schema (also seeds the 8 verticals)
npm run dev               # http://localhost:3000
```

- Sign-in is Google only. In the Google Cloud console add the redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google`. Put your email in `BOOTSTRAP_ADMIN_EMAILS` to become ADMIN on first sign-in; add others as rows in `allowed_emails` (email, role).
- **Production:** new files under `drizzle/` must be applied (`npm run db:migrate` with `DIRECT_URL`) before the deploy that needs them. Set env vars on Vercel (see `.env.example`).
- Use a **separate Supabase project (or branch) for local development** and for experiments. Never point experiments at production. Tests do not need a database: they run on in-memory Postgres (PGlite).
- Checks: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.
- Schema change flow: edit `src/server/db/schema/*`, run `npm run db:generate`, review the SQL, commit it.
- Notion import: `npx tsx scripts/import-notion.ts <export-dir outside repo> --dry-run`, then without `--dry-run`.

---

## 4. Things that will bite you

1. **Next.js 16.2 is not the Next.js you know.** `AGENTS.md` says to read `node_modules/next/dist/docs/` before writing routing, proxy/middleware, caching or route-handler code.
   - `middleware.ts` is replaced by `proxy.ts` in this generation. Confirm in the bundled docs.
   - Route handlers here set `export const dynamic = "force-dynamic"`. Keep doing that for data routes.
2. **One data layer.** Everything goes through Drizzle (`getDb()` in `src/server/db/client.ts`). Do not add raw SQL strings or a second client. Timestamps are `timestamptz` read and written as JS `Date`; JSON columns are `jsonb`.
3. **The repo is public.**
   - No client names, phone numbers, emails, amounts, GSTIN, PAN, bank details or Notion exports in commits, seeds, fixtures, tests or screenshots.
   - Seed data must be obviously fake.
   - Keep Notion exports in a folder outside the repo, and add `*.zip` and `notion-export*/` to `.gitignore`.
4. **Money is integer paise.** Never use floats for amounts. Format with `en-IN`. Amount-in-words uses lakh and crore.
5. **Invoices are legal documents.**
   - Numbers are consecutive per financial year (April–March), at most 16 characters, assigned only at issue, in a transaction.
   - Issued invoices are never edited; fix them with a credit note.
   - Have the CA approve the first PDF.
6. **react-pdf and ₹.** The default PDF fonts have no ₹ glyph. Register Noto Sans or Inter.
7. **Vercel has no long-running processes.** Use Vercel Cron → `/api/cron/*` (protected by `CRON_SECRET`), not workers.
8. **Notion API limits.** The workspace's query allowance ran out after about 15 queries on 2026-11-12. Migrate from a **CSV export**, not the API.
9. **Next 16 facts verified from the bundled docs:** the file is `src/proxy.ts` exporting `proxy` (not `middleware`); route handler `params` is a `Promise`; the proxy only does an optimistic cookie check, so real authorisation lives in the route handlers (`requireRole`). Public paths are listed at the top of `src/proxy.ts` (add `/p/` pages there in Phase 3; `/api/cron` and `/p/` are already allowed through).
10. **React compiler lint** forbids calling a state-setting function synchronously inside `useEffect`. Wrap the call in `setTimeout(..., 0)` (see `company-detail.tsx`).
11. **Numbering and concurrency:** `nextNumber` must run inside the issuing transaction (`db.transaction`). The tests run on PGlite, which serialises connections, so a real-Postgres concurrency run is still worth doing once before first invoice.
12. **Applying migrations is a human step.** The deployed app only has `DATABASE_URL` (transaction pooler). Migrations need `DIRECT_URL`, which automated runs do not have. A PR that adds a file under `drizzle/` must not be merged until Srijan (or an interactive session) has run `npm run db:migrate` against production.
13. **Legacy leftovers:** the `clients` table and the `crm`/`outreach` entries in `pipelineModels` still exist. Delete them after the Notion import is verified and deals land (Phase 3).
14. **Disk:** this repo lives in iCloud Drive. `node_modules` and `.next` sync slowly and can fill the disk. Prefer a non-iCloud folder for development.

---

## 5. Source systems to migrate (what to look at)

| Source | Where | Contents |
|---|---|---|
| Notion "Reshuffle OS" → **Clients** page | Notion (ask Srijan for access) | Clients board, with process status (Lead, Proposal Sent, Negotiation, In progress, Completed, Maintenance, Closed), payment status, amount, next meeting and last contact. Also the WhatsApp bot fields: Role (Client/ClientTeam), Onboarded, Approved. Relations to Projects, Meetings and Incomes. |
| → Client CRM | Notion | Account cards and the **Products** list of 8 verticals |
| → Sales → Reference Client | Notion | Lead list with lead name, business, product type, referred by, status (lead/follow-up/proposal sent/client), quotation status, current block, reason for not converting, files |
| → Sales → Essentials | Notion | The sales pitch: freelancer backend, modular plug-and-play systems, "why systems not ERPs", Raipur mission, CTO-as-a-service, outcome-first. It becomes a Playbook doc. |
| → April Goals | Notion | Monthly goals with team, priority, status, dates |
| → Marketing | Notion | Content calendar, plus an Instagram account and social plan per vertical |
| → Finance tracker | Notion | Transactions (income/expense, category, project, month), Invoices (number, due, method, paid), Yearly breakdown, Proposal Tracker |
| → Events | Notion | Event management DB, Team DB, plus links to the workshop sheet and the events doc |
| → Team hub | Notion | Empty |
| Reshuffle HQ page | Notion | Called the "final working system", but it was not shared with the integration, so its contents are unverified. Ask Srijan whether anything there is missing from the list above. |
| Invoice app pages | `reshuffle-invoice/*.html` | Exact layouts, field lists and wording for the invoice, work order, offer letter, salary slip and letterhead templates |
| "Vision & Narrative" doc | Google Docs (ask Srijan) | Decision log DL-001–DL-005, sales cheat sheet (5 buckets, 8 levels, 4 engagement models), DairyFlow playbook |
| Sales outbound deck | Canva (ask Srijan) | Module categories (marketing, sales, finance, operations), useful for seeding the module library |

---

## 6. Conventions

- **Layering:** route handler (`src/app/api/**/route.ts`) → service (`src/server/services/*.ts`) → DB (`src/server/db/*`). Routes do auth, parse and status codes only. Business rules live in services.
- **Validation:** a Zod schema per input, shared between route and client form.
- **Errors:**
  - Services return `{ ok: true, data } | { ok: false, error, code }`.
  - Routes map that to 400 (validation), 401, 403, 404, 409 (state conflict, e.g. editing an issued invoice) or 500.
- **Audit:** call `logActivity` on every mutation, with the actor.
- **State machines:** declared as config next to `pipelineModels`; check `canTransition()` before writing.
- **UI:** wrap pages in `DashboardShell`, use TanStack Query for fetching (polling on boards), Tailwind slate palette, lucide icons.
- **Commits:** small, one concern each. A phase is finished when its "done when" boxes in `development-plan.md` are ticked.

---

## 7. Decisions already made

These are summarised here; the full reasoning is in `plan.md` §4.

1. Supabase Postgres is the only database, accessed server-side through Drizzle. Prisma is dropped. Migrated from the previous database on 2026-11-12.
2. Drizzle is used for schema and migrations.
3. Better Auth with Google sign-in, an email allowlist and four roles (ADMIN, MANAGER, MEMBER, FREELANCER).
4. REST route handlers + TanStack Query. tRPC is dropped.
5. One document engine for every generated document. Issued documents are immutable snapshots, with server-side PDFs via `@react-pdf/renderer`.
6. No worker. Scheduled jobs run on Vercel Cron.
7. Polling replaces realtime.
8. All money is stored as integer paise.
9. Notion is migrated from a CSV export.
10. Files go in Vercel Blob.
11. `org_id` is on every table from day one.

## 8. Open questions for Srijan

These are also listed in `development-plan.md`. Defaults are used if there is no answer.

1. **Invoice numbering:** what was the last invoice number issued from the static app, and what format should continue? Default: `RS/26-27/NNN`.
2. **CA review:** who is the CA, so they can review one sample invoice and the SAC codes before go-live?
3. **Repo visibility:** make both repos private? (Recommended.)
4. **Roles:** who needs access at launch, and in which role?
5. **Reshuffle HQ:** is anything in that Notion page missing from §5?
6. **Payment schedule default:** for scopes, 50/30/20 is the default. Is that right?

---

## 9. Start here (next session)

1. Read `AGENTS.md`, then this file, then section 12 (work queue).
2. If you are an automated run, follow section 12 exactly. If you are an interactive session, ask Srijan what to prioritise; the queue in section 12 is the default.
3. Sign-in: Google with an allowlist. `BOOTSTRAP_ADMIN_EMAILS` holds the two admin emails; add team members as rows in `allowed_emails`.
4. Run the Notion import with `--dry-run` against the real CSV export (human step: the export must stay outside the repo) and fix the column alias lists in `src/server/import/notion.ts`.
5. Update this file at the end of every session.

---

## 10. Session log

| Date | Who | What |
|---|---|---|
| 2026-11-12 | Claude with Srijan | Audited both repos and the Notion workspace. Wrote `plan.md`, `development-plan.md` and `handoff.md`. |
| 2026-11-12 | Claude with Srijan | Built Phase 0 (auth, Drizzle, dead-layer removal, money/GST/numbering, Vitest, CI, Settings) and Phase 1 (CRM schema, services, APIs, UI, Notion import for clients, products, meetings). Merged straight to `main` as asked. |
| 2026-11-12 | Claude with Srijan | Ported all raw SQL to Drizzle services, removed demo seeding, then moved the whole database to Supabase Postgres: new pg schema (timestamptz, jsonb, RLS on every table), postgres-js client on the transaction pooler, PGlite tests (49 pass), baseline + seed migrations applied to Supabase, existing data copied and verified id by id (289 rows, 8 tables), previous database references removed from code and docs. |
| 2026-11-12 | Claude with Srijan | Auth set up on Vercel (Better Auth secret and URL, Google OAuth client, admin emails). Four Sonnet reviewers audited Phase 0 and 1; their open findings are queued in section 12. |
| 2026-11-12 | Claude (scheduled run, merged by Srijan) | Phase 2a/2b (invoices and work orders backend) landed on `main` as commit `2104cdf`, written for the previous SQLite schema. When the database moved to Postgres those files were removed from the tree so `main` builds; they stay in git history (`git show 2104cdf:<path>`). Task B0 in section 12 ports them. The scheduled runs also pushed unmerged SQLite-era branches `claude/phase-2c…2f`, `3`, `3b`, `3c`, `4`, `4b`, `4c`, `5a`, `5b`, `6a` (PDF engine, billing UI, letters, deals, scopes, people, projects, finance). They all need the same pg port; do them in branch order, and tell the scheduler to branch from current `main` (Postgres) from now on. |
| 2026-11-13 | automated run | Ported Phase 4b salary slips to Postgres on branch `auto/salary-slips-pg` (stacked on `auto/people-pg`, #35): `salary_slips` table (jsonb earnings, deductions, snapshot; timestamptz; RLS; migration `0009`), ADMIN-only service, `/api/salary-slips*`, PDF template and engine entry. 113 tests pass; lint, tsc, build clean. Next ports in order: `claude/phase-4c-people-ui`, `5a`, `5b`, `6a`. Review backlog is large (PRs #7-#35 plus this one); merging the stacks bottom-up is now the bottleneck, not more ports. |
| 2026-11-13 | automated run | Ported Phase 4c `/people` list and detail UI (with salary slip create, issue, PDF) to `auto/people-ui-pg`, stacked on `auto/salary-slips-pg`. No schema change. Scope sharing from the old 4c branch was already ported in #34. Next ports: `claude/phase-5a-projects`, `5b`, `6a`. |
| 2026-11-12 | Claude (automated run) | B0 part 1: invoices backend ported to Postgres on `auto/port-invoices-pg` (schema `billing.ts`, migration `0002_billing_invoices`, service, `/api/invoices*`, `/api/cron/daily`, cron in `vercel.json`, 17 PGlite tests). Date-only columns stay `YYYY-MM-DD` text, instants are timestamptz, `snapshot_json` is jsonb. Service defines its own `DbOrTx` so it survives A6 (`nextNumber` takes `Tx` only). Work orders (B0 part 2) are next and need this branch merged first. |
| 2026-11-12 | Claude (automated run) | B0 part 2: work orders backend ported to Postgres on `auto/port-work-orders-pg` (stacked on #25): tables `work_orders`, `work_order_items`, migration `0003_work_orders`, service, `/api/work-orders*`, 9 PGlite tests. Next: B1 PDF engine port (`claude/phase-2c-pdf-engine`), then the UI branches in order. |
| 2026-11-13 | Claude (automated run) | Phase 3a deals ported to Postgres on `auto/deals-pg` (stacked on `auto/letters-pg`): tables `deals`, `deal_stage_history`, `diagnoses` (migration `0005_deals`, RLS on), services, `/api/deals*`, `/sales` board, nav. Next: Phase 3b scopes port (`git show origin/claude/phase-3b-scopes:<path>`), then 3c public accept page. Migration number may need renumbering if another branch lands one first. |
| 2026-11-13 | Claude (automated run) | Phase 3b scopes ported to Postgres on `auto/scopes-pg` (stacked on `auto/deals-pg`): `modules_library`, `scopes`, `scope_items` (migration `0006_scopes`, RLS on; payment schedule and snapshot are jsonb), `services/scopes.ts`, `/api/modules*`, `/api/scopes*`, `/api/deals/[id]/scopes`. 6 PGlite tests. Next: 3c public accept page (`origin/claude/phase-3c-scope-accept`, needs `scope_shares`, `scope_acceptances`, `rate_limits`), then Phase 4 people. |
| 2026-11-13 | Claude (scheduled run) | B1: ported the PDF engine (Noto Sans with rupee glyph, invoice, work order and credit note templates, `/api/*/pdf` routes) from `claude/phase-2c-pdf-engine` onto the Postgres stack, stacked on #26. No schema change. Next: port billing UI (`claude/phase-2d-billing-ui`, 2e), then 2f letters, in branch order. |
| 2026-11-13 | Claude (scheduled run) | B6: ported billing UI (`/invoices`, `/invoices/new`, `/invoices/[id]`, `/work-orders` list, nav) from `claude/phase-2d-billing-ui`, stacked on B1. No schema change. Next: 2e work order editor, 2f letters. |
| 2026-11-13 | Claude (scheduled run) | B7 (UI part): ported the work order editor (`/work-orders/new`, `/work-orders/[id]`: draft, issue, complete, cancel) from `claude/phase-2e-work-order-ui`, stacked on B6 (#29). No schema change. Next: 2f letters port. |
| 2026-11-13 | Claude (scheduled run) | B8: ported letters (table `letters`, migration `0004_letters`, service, `/api/letters*`, PDF template, `/letters` UI, nav) from `claude/phase-2f-letters` to Postgres, stacked on B7 (#30). 5 PGlite tests. Migration number `0004` may need renumbering if another branch lands a migration first. Next: remaining A4/A5 items, then Phase 3 port (`claude/phase-3-deals`). |
| 2026-11-13 | automated run | Phase 3c port: public scope accept page and share links on Postgres (`scope_shares`, `scope_acceptances`, `rate_limits` with bigint `window_start`, migration `0007_scope_sharing`), stacked on `auto/scopes-pg`. Next ports in order: `claude/phase-4-people`, `4b-salary-slips`, `4c-people-ui`, `5a`, `5b`, `6a`. |
| 2026-11-13 | automated run | Phase 4a port: `people` table with AES-256-GCM PAN and bank fields (migration `0008_people`), service and `/api/people*`, stacked on `auto/scope-accept-pg`. Fixed a bug from the SQLite branch: the patch schema inherited create defaults, so a partial update reset `role` and `kind`. Needs `APP_ENCRYPTION_KEY` (`openssl rand -base64 32`) set on Vercel before use. Next ports: `4b-salary-slips`, `4c-people-ui`, `5a`, `5b`, `6a`. |
| 2026-11-13 | automated run | Phase 6b: finance reports (`auto/finance-reports-pg`, #42: receivables aging, GST summary, B2B CSV, no schema change) and the `/finance` UI (`auto/finance-ui-pg`, stacked on it: Ledger, Receivables, Monthly, GST tabs; the old sample projections are kept as a Plan tab, still unsaved because `finance_plans` is not built). Heads-up: money columns are int4, so one amount tops out near ₹2.14 crore; a bigint migration is worth doing before large invoices. Next: persisted `finance_plans`, attach-a-bill on ledger entries (needs Blob token), then Phase 5 payouts and the `/me` freelancer view. The merge backlog (#7-#43) is still the bottleneck. |

## 11. Backlog (ideas parked outside the current phases)

- Client portal (clients log in for projects, invoices and approvals)
- Tally / Zoho Books sync
- AI helpers: draft a scope from diagnosis answers, summarise a call into an interaction, suggest modules by vertical
- Event ticketing and payment links (Razorpay)
- Mobile-friendly freelancer view as a PWA

---

## 12. Automated runs (hourly scheduler)

An hourly scheduled task continues development. **Each run does exactly one task from the queue below, then stops.** Interactive sessions can use the same queue.

### Run protocol

1. `git pull --ff-only` on `main`. Read `AGENTS.md`, this file, `plan.md` and the relevant section of `development-plan.md`.
2. Pick the **first unchecked task** in the queue that is not marked `BLOCKED`. If every remaining task is blocked, append a line to the session log saying so and stop.
3. Work on a branch named `auto/<task-slug>`. Keep the change small and in the existing style (services return `{ ok, data } | { ok: false, error, code }`, Zod per input, `logActivity` on mutations, integer paise, `.enableRLS()` on new tables, tests with PGlite).
4. Before committing: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` must all pass. If a check fails and you cannot fix it in the same run, do not commit; write what failed in the session log and stop.
5. Commit, push the branch and open a pull request into `main`. **Do not merge and do not push to `main`.** Every merge deploys to production. Srijan reviews and merges (he can change this rule by editing this line).
6. Tick the task in the queue, add a one-row entry to the session log (date, "automated run", what changed, anything the next run must know), commit that to the same branch.

### Hard rules

- The repo is public. No real client names, phones, emails, amounts, GSTIN, PAN or bank details anywhere. Fake data only.
- Never print, log or commit secrets. Never edit `.env` files or Vercel settings.
- Never run migrations against production and never connect to the production database. Tests run on in-memory Postgres.
- A task that adds a file under `drizzle/` must say so at the top of the PR description: "Needs `npm run db:migrate` on production before merge."
- Do not start a task that is marked `BLOCKED`. Do not guess answers to the open questions in section 8.
- If something looks unsafe (money maths, auth, data loss), stop and write it in the session log instead of improvising.

### Queue

**A. Review findings (do these first)**

- [ ] A1. Allowlist revocation: in `src/server/auth.ts` and `src/server/authz.ts`, re-check `resolveRoleForEmail` when a session is created and in `getSessionUser`; if the email is no longer allowed treat the user as inactive, otherwise sync the role. Add tests.
- [ ] A2. `src/proxy.ts`: match public prefixes on path boundaries (`p === path || path.startsWith(p + "/")`); reject `\` in the login `next` param; fail fast at startup if `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_SECRET` are missing in production.
- [ ] A3. Role-gate pages: `/settings` must check the session role on the server (not only the API).
- [ ] A4. Route-level tests with a mocked session for every API group: 401 logged out, 403 wrong role (including FREELANCER), 400 invalid input, 404 unknown id, org isolation.
- [ ] A5. UI robustness: `crm-workspace.tsx` and `company-detail.tsx` ignore out-of-order responses (AbortController or request counter); polling must not overwrite an in-flight optimistic move or an unsaved edit (`freelancers/page.tsx`); `pipeline-board.tsx` resets state when `module` changes and must not clear the create form when the request failed.
- [ ] A6. `numbering.ts`: accept a transaction only (type `Tx`); carry prefix and padding forward at financial-year rollover; validate `rateBps` is an even integer in `gst.ts` and bound per-line amounts; make `toPaise` accept strings only.
- [ ] A7. Small service fixes: reject archived contacts in `createInteraction`; wrap create-interaction (insert, touch company, log) in one transaction; guard `settings.ts` bank parsing; replace `.catch(() => undefined)` swallowing in the CRM UI with a visible message.
- [ ] A8. Add `.enableRLS()` check as a CI step (a test already asserts it; make sure new tables are covered) and add Supabase advisors notes to the PR description when a migration is included.

**B. Phase 2: document engine, invoices, work orders** (`development-plan.md` Phase 2, one slice per run)

- [x] B0. **Port the Phase 2a/2b backend to Postgres.** (Invoices + cron in PR #25 `auto/port-invoices-pg`; work orders in `auto/port-work-orders-pg`, stacked on it. Merge in that order.) It exists in history at commit `2104cdf` (`git show 2104cdf:src/server/services/invoices.ts` etc.): schema `billing.ts` and `work-orders.ts`, services `invoices.ts` and `work-orders.ts`, schemas `billing.ts` and `work-orders.ts`, routes `/api/invoices*`, `/api/work-orders*`, `/api/cron/daily`, tests, `requireBilling` (already in `authz.ts`). Rewrite with `pg-core`, `ts()` columns, jsonb, `.enableRLS()`, Dates, PGlite tests, `db:generate` for one migration, and restore the cron entry in `vercel.json`. **Needs migration on production before merge.** B2 and B3 below are covered by this task.
- [x] B1. (ported to Postgres, PR stacked on B0 part 2) Register Noto Sans with `@react-pdf/renderer`, add the shared PDF parts in `src/server/documents/parts/` (letterhead, party block, items table, tax summary, amount in words, bank block, signature block, terms) with a render test that checks the ₹ glyph. No schema change.
- [ ] B2. Schema for `documents`, `document_templates`, `invoices`, `invoice_items`, `payments`, `credit_notes` (with `org_id`, RLS) and the migration. **Needs migration on production before merge.**
- [ ] B3. Invoice service: create draft, edit draft, issue (transaction: number via `nextNumber`, freeze `snapshot_json`, status, audit log, idempotency key), record payment, cancel via credit note, `markOverdue`. Tests for tax modes, numbering, immutability (409), partial then full payment.
- [ ] B4. Invoice API routes (`/api/invoices*`) with role checks (ADMIN full, MANAGER create/issue, MEMBER read).
- [ ] B5. PDF template `invoice/v1` and `/api/pdf/documents/[id]`; credit note template.
- [x] B6. (ported, PR stacked on B1) Invoice UI: `/invoices` list with status filters and receivables total, `/invoices/new` and `/invoices/[id]` with live preview.
- [ ] B7. Work orders: schema (migration), service, API, UI, template.
- [x] B8. Letterhead letters: template and "New letter" page.
- [ ] B9. `/api/cron/daily` (protected by `CRON_SECRET`) running `markOverdue`, plus `vercel.json` cron entry.
- [ ] B10. BLOCKED until a human provides `BLOB_READ_WRITE_TOKEN`: logo and signature uploads in Settings.

**C. Later phases:** continue in the order of `development-plan.md`: Phase 3 (deals, scopes, public accept page), Phase 4 (people documents), Phase 5 (projects and freelancers), Phase 6 (finance), Phase 7 (marketing, events, goals, docs), Phase 8 (overview, search, notifications). Break each into slices like section B and add them here before starting.

### Blocked on a human (do not attempt)

- Vercel Blob token, CA sign-off on the invoice PDF and tax rules, the last invoice number used, the real Notion export, GST/SAC confirmation, any change to Vercel or Google settings, applying migrations to production.
| 2026-11-13 | automated run | Ported Phase 5a delivery projects backend to Postgres (`auto/projects-pg`, stacked on `auto/people-ui-pg`): `delivery_projects` and `project_milestones` (migration `0010`, RLS on, one project per deal), `services/delivery.ts`, routes `/api/delivery-projects*` and `/api/deals/[id]/convert`, 7 PGlite tests. Milestone invoice amount is treated as **pre-GST** (confirm with the CA). Next ports: `claude/phase-5b-projects-ui` (UI), then `claude/phase-6a-finance-ledger`. |
| 2026-11-13 | automated run | Ported Phase 5b projects UI (`auto/projects-ui-pg`, stacked on `auto/projects-pg`): `/projects` delivery project list above the legacy board, `/projects/[id]` with milestones, mark done, draft invoice and billed/paid figures. No schema change. Next port: `claude/phase-6a-finance-ledger`. |
| 2026-11-13 | automated run | Ported Phase 6a finance ledger backend to Postgres (`auto/finance-pg`, stacked on `auto/projects-ui-pg`): `expense_categories` and `ledger_entries` (migration `0011`, RLS on, unique per payment source), `services/finance.ts`, routes `/api/ledger*` and `/api/finance/*`, and `recordPayment` now books an INCOME entry in the same transaction. Not built: finance UI (6b), payouts, backfill route trigger. Remaining unported SQLite-era branches: none of 2c to 6a. Next: Phase 6b finance UI, then Phase 7 slices (add them to section 12 first), plus queue items A4/A5/A8 leftovers once the stack is merged. |
