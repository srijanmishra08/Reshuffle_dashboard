# Handoff: ReShuffle Dashboard

This is for whoever picks up the build next, whether a developer, Srijan, or a coding agent. Read it first, then `plan.md` (what we are building and why) and `development-plan.md` (the order to build it in).

**As of:** 2026-11-12, commit `323cab5` on `main`.

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
| UI shell, nav | Works | `src/components/dashboard-shell.tsx`, `src/lib/navigation.ts` |
| Generic kanban boards | Works | `src/components/pipeline-board.tsx`, driven by `src/server/models/pipeline.ts`; data in Turso `pipeline_items` |
| Pipeline transitions + activity log | Works | `src/server/services/pipeline.ts`, `src/server/services/activity.ts` |
| Social content entries | Works (CRUD) | `src/app/social/page.tsx`, `/api/social/entries` |
| Freelancers table | Works (CRUD) | `src/app/freelancers/page.tsx`, `src/server/services/freelancers.ts`; seeds 3 fake rows when the table is empty |
| Clients/projects/tasks APIs | Basic | Turso raw SQL; no detail pages |
| Overview KPIs + feed | **Fake** | Hardcoded in `src/lib/module-data.ts` |
| Finance page | **Not persisted** | React state only; lost on reload |
| Events page | **Wrong** | Shows the social board under the title "Social Calendar" |
| Auth | **Missing** | All APIs are open on the public URL. Fix first. |
| Prisma schema | **Unused** | `prisma/schema.prisma` is never imported. Runtime is Turso. Planned for deletion. |
| tRPC | **Unused scaffold** | One router, public procedures. Planned for deletion. |
| BullMQ worker | **Non-functional** | Only logs; cannot run on Vercel. Planned for deletion. |
| Realtime (SSE) | **Broken on Vercel** | In-memory bus, so events don't cross serverless instances. Replace with polling. |
| Tests / CI | None | Set up in Phase 0 |

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
cp .env.example .env      # fill TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (ask Srijan; never commit)
npm run dev               # http://localhost:3000
```

- Production deploys go to Vercel from `main`. The Turso env vars are already set there.
- Use a **separate Turso database for local development** (`turso db create reshuffle-dev`). Never point local dev at the production DB.
- After Phase 0 the commands become `npm run db:migrate`, `npm test`, `npm run lint` and `npx tsc --noEmit`.

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
9. **Freelancer seed rows.** `listFreelancers()` inserts three fake freelancers if the table is empty. Remove that behaviour when the real table lands.

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

1. Turso is the only database. Prisma and Postgres are dropped.
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

## 9. Start here (first session)

1. Read `AGENTS.md` and skim `node_modules/next/dist/docs/` on proxy and route handlers.
2. Create a dev Turso DB, run the app locally, and click through every page so you know what exists.
3. Start **Phase 0, task 4 (auth)**, even before the Drizzle move. Closing the open APIs is the most urgent fix. A minimal version (Google login + allowlist + `requireUser` on every route) can ship in a day.
4. Then do Phase 0 tasks 2, 3 and 6 (cleanup, Drizzle, money/GST/numbering with tests), then CI.
5. Update this file at the end of every session:
   - what changed
   - what's next
   - any new gotcha

---

## 10. Session log

| Date | Who | What |
|---|---|---|
| 2026-11-12 | Claude with Srijan | Audited both repos and the Notion workspace. Wrote `plan.md`, `development-plan.md` and `handoff.md`. No code changed. |

## 11. Backlog (ideas parked outside the current phases)

- Client portal (clients log in for projects, invoices and approvals)
- Tally / Zoho Books sync
- AI helpers: draft a scope from diagnosis answers, summarise a call into an interaction, suggest modules by vertical
- Event ticketing and payment links (Razorpay)
- Mobile-friendly freelancer view as a PWA
