# Handoff: ReShuffle Dashboard

This is for whoever picks up the build next, whether a developer, Srijan, or a coding agent. Read it first, then `plan.md` (what we are building and why) and `development-plan.md` (the order to build it in).

**As of:** 2026-11-12. Branch `phase-0-1-foundations-crm` (Phase 0 and Phase 1 built, not yet merged or deployed). Last commit on `main`: `72cc7c6`.

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
| Database layer | **Done (Phase 0)** | Drizzle on Turso. Schema in `src/server/db/schema/*`, migrations in `drizzle/`. `src/lib/turso.ts` no longer creates tables. |
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
cp .env.example .env      # defaults to a local SQLite file; Google keys needed to sign in
npm run db:migrate        # creates/updates the schema (also seeds the 8 verticals)
npm run dev               # http://localhost:3000
```

- Sign-in is Google only. In the Google Cloud console add the redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google`. Put your email in `BOOTSTRAP_ADMIN_EMAILS` to become ADMIN on first sign-in; add others as rows in `allowed_emails` (email, role).
- **Production:** run `npm run db:migrate` against the production Turso DB before deploying this branch. The baseline migration uses `IF NOT EXISTS`, so existing tables and rows are untouched. Set the new env vars on Vercel (see `.env.example`).
- Use a **separate Turso database for local development**. Never point local dev at production.
- Checks: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.
- Schema change flow: edit `src/server/db/schema/*`, run `npm run db:generate`, review the SQL, commit it.
- Notion import: `npx tsx scripts/import-notion.ts <export-dir outside repo> --dry-run`, then without `--dry-run`.

---

## 4. Things that will bite you

1. **Next.js 16.2 is not the Next.js you know.** `AGENTS.md` says to read `node_modules/next/dist/docs/` before writing routing, proxy/middleware, caching or route-handler code.
   - `middleware.ts` is replaced by `proxy.ts` in this generation. Confirm in the bundled docs.
   - Route handlers here set `export const dynamic = "force-dynamic"`. Keep doing that for data routes.
2. **Two data layers.** Ignore Prisma. All live data is in Turso through `src/lib/turso.ts`, which runs `CREATE TABLE IF NOT EXISTS` on cold start. Phase 0 replaces this with Drizzle migrations. The first migration must keep the existing tables and rows.
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
11. **Concurrency tests on SQLite files:** the embedded libsql client throws `SQLITE_BUSY` for parallel interactive transactions, so `numbering.test.ts` tests parallel callers on the single atomic `UPDATE ... RETURNING` plus a rollback test. Real Turso is not affected the same way, but still allocate numbers inside the issuing transaction.
12. **Run `npm run db:migrate` again for the new `0002` migration** (normalises legacy timestamps to ISO; safe to re-run). Boards that were never opened in production now start empty because demo seeding on read was removed.
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

1. Turso is the only database today; Prisma is dropped. **Being revisited:** `docs/SUPABASE_MIGRATION_PLAN.md` plans a move to Supabase Postgres (plan only, nothing built, needs connection strings from Srijan).
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

`docs/ROLL_OUT_PLAN.md` and `docs/ARCHITECTURE.md` describe the original scaffold and are superseded by `plan.md` and `development-plan.md`. Update or delete them in Phase 0.

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

1. Read `AGENTS.md`, then this file.
2. Get the branch merged: set up Google OAuth, add env vars on Vercel, run `npm run db:migrate` on production, deploy, sign in once as admin, and add the other team emails to `allowed_emails`.
3. Run the Notion import with `--dry-run` against the real CSV export and fix the column alias lists in `src/server/import/notion.ts`. Then import for real and click through `/crm`.
4. Start **Phase 2** (document engine, invoices, work orders). Answer the open questions in section 8 first, especially the last invoice number.
5. Update this file at the end of every session.

---

## 10. Session log

| Date | Who | What |
|---|---|---|
| 2026-11-12 | Claude (scheduled run) | Phase 2 started, as stacked PRs. **#2 (2a)** invoices backend: tables, service (idempotent issue, payments, credit-note cancel, overdue), `/api/invoices/*`, `/api/cron/daily` + `vercel.json`. **#3 (2b, base 2a)** work orders backend + `/api/work-orders/*`. Both ADMIN/MANAGER only (`requireBilling`). 72 tests pass. **Next (2c):** PDF engine + templates (`@react-pdf/renderer`, Noto Sans for ₹), Billing nav group and `/invoices`, `/work-orders` UI, letters, then cutover once the last invoice number and CA sign-off are known. Needs `CRON_SECRET` and `npm run db:migrate` (0003, 0004) before deploy. |
| 2026-11-12 | Claude with Srijan | Audited both repos and the Notion workspace. Wrote `plan.md`, `development-plan.md` and `handoff.md`. No code changed. |
| 2026-11-12 | Claude with Srijan | Supabase migration Step 1 done (see `docs/SUPABASE_MIGRATION_PLAN.md`): all raw SQL ported to Drizzle services, timestamps normalised (migration 0002), demo seeding removed, 46 tests. Committed locally on `main`, not pushed. Next: Step 2 (Postgres schema), which needs the pooler connection string from Srijan. |
| 2026-11-12 | Claude with Srijan | Merged Phase 0 and 1 straight to `main` (`cf8651a`, as asked, no PR) and wrote `docs/SUPABASE_MIGRATION_PLAN.md`. Pushing to `main` may auto-deploy to Vercel: production needs the new env vars and `npm run db:migrate` or the deployed app will not work. Five Sonnet reviewers' findings (security, database, TypeScript, plan audit) are not yet fixed; main ones: allowlist removal does not revoke existing users, polling overwrites unsaved edits, demo-seed on board read path, timestamp format mixing, missing route-level tests. |
| 2026-11-12 | Claude (scheduled) | Phase 2d: Billing UI on branch `claude/phase-2d-billing-ui` (stacked on #4): nav entries, `/invoices` list with receivables and filters, `/invoices/new` and `/invoices/[id]` editor (draft, issue with idempotency key, payments, cancel via credit note, PDF links), `/work-orders` list. Work-order create/issue UI and letters are still open. |
| 2026-11-12 | Claude with Srijan | Built Phase 0 (auth, Drizzle, dead-layer removal, money/GST/numbering, Vitest, CI, Settings) and Phase 1 (CRM schema, services, APIs, UI, Notion import for clients/products/meetings). 37 tests pass; lint, tsc and build clean; API verified end to end with a signed test session. **Not done:** logo/signature uploads, AES crypto helper (Phase 4), dropping legacy `clients` table, real Notion import run, browser click-through (Google-only login), deploy. `PipelineBoard` was not reused for the lifecycle board; `lifecycle-board.tsx` is a small dedicated board because companies are real rows, not `pipeline_items`. |
| 2026-11-12 | Claude (scheduled run) | Phase 2c: PDF engine (`src/server/documents/`: Noto Sans fonts with a latin-ext run for the rupee sign, shared parts, invoice / work-order / credit-note templates). PDFs are rendered on demand from the frozen `snapshot_json` (no Blob storage needed, since snapshots are immutable): `GET /api/invoices/[id]/pdf`, `/api/invoices/[id]/credit-note/pdf`, `/api/work-orders/[id]/pdf`. Layout checked by eye from a rendered page. **Still open in Phase 2:** Billing UI and nav group, letters template and page, cutover tasks (need the last invoice number and CA sign-off). |

## 11. Backlog (ideas parked outside the current phases)

- Client portal (clients log in for projects, invoices and approvals)
- Tally / Zoho Books sync
- AI helpers: draft a scope from diagnosis answers, summarise a call into an interaction, suggest modules by vertical
- Event ticketing and payment links (Razorpay)
- Mobile-friendly freelancer view as a PWA
