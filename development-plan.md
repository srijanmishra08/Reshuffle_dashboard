# ReShuffle OS: Development Plan

This is the build order for `plan.md`. Each phase ships something usable and can be deployed on its own. Do the phases in order, because later phases depend on earlier tables and services.

**Complexity:** Large overall, split into 11 phases.

**Rough effort:** 8–10 focused weeks for one developer working with Claude. The estimates are per phase and assume no scope creep.

**Validation used throughout:**

```bash
npm run lint
npx tsc --noEmit
npm test            # Vitest, added in Phase 0
npm run build
npm run db:migrate  # drizzle-kit migrate, added in Phase 0
```

---

## Patterns to mirror (from the current code)

| Category | Source | Pattern |
|---|---|---|
| Naming | `src/server/services/*.ts`, `src/app/api/<resource>/route.ts`, `[id]/route.ts` | kebab-case files, one service per domain, REST resource folders |
| Validation + errors (routes) | `src/app/api/clients/route.ts` | Zod `safeParse` → `400 { error: parsed.error.flatten() }`; failures → `NextResponse.json({ error }, { status })` |
| Errors (services) | `src/server/services/pipeline.ts` → `processPipelineTransition` | Return a discriminated union `{ ok: true, data } \| { ok: false, error }`; the route maps it to a status code |
| Audit | `src/server/services/activity.ts` → `logActivity` | Every mutation logs `{ action, module, entityType, entityId, metadata }`. Logging failure never breaks the request (`console.warn` with a structured object) |
| State machines | `src/server/models/pipeline.ts` | Stages + `allowedTransitions` as config; `canTransition()` guard before persisting |
| Row mapping | `src/server/services/freelancers.ts` → `toFreelancerRow` | Map DB rows to typed objects in one function. Drizzle's typed selects replace these mappers |
| UI shell | `src/components/dashboard-shell.tsx`, `src/lib/navigation.ts` | Every page is wrapped in `DashboardShell`; nav entries live in `moduleNav` |
| Boards | `src/components/pipeline-board.tsx` | Kanban driven by the pipeline config. Reuse it for deals, projects and content |
| Styling | Tailwind, slate palette, `rounded-2xl border-slate-200` cards, lucide icons | Keep it. Add shadcn/ui primitives only where forms need them |
| Tests | none exist | Start the pattern in Phase 0: `src/**/__tests__/*.test.ts` with Vitest |

---

## Phase 0: Foundations and lockdown (4–5 days)

**Goal:** the live app is no longer writable by anyone with the URL, there is one typed data layer with migrations, and the money, GST and numbering utilities exist and are tested.

**Tasks**

1. **Read the Next 16 docs** in `node_modules/next/dist/docs/` before starting: routing, proxy (the replacement for `middleware.ts`), caching, route handlers. Note anything that differs from the plan in `handoff.md`.
2. **Remove dead layers:**
   - Delete `prisma/`, `src/lib/db.ts`, the tRPC scaffold (`src/server/trpc.ts`, `src/server/routers/*`, `src/app/api/trpc/`), BullMQ (`src/lib/queue.ts`, `src/workers/`), and the in-memory realtime (`src/server/services/realtime.ts`, `src/app/api/realtime/*`).
   - Remove the `prisma`, `@prisma/client`, `@trpc/*`, `bullmq`, `ioredis`, `@upstash/redis` and `@supabase/supabase-js` packages and their scripts.
3. **Add Drizzle on Postgres (Supabase):**
   - Install `drizzle-orm`, `drizzle-kit` and `postgres`. Add `drizzle.config.ts` and `src/server/db/client.ts` (postgres-js over the transaction pooler, `prepare: false`).
   - Add `src/server/db/schema/*.ts` with one file per domain.
   - Add scripts `db:generate` and `db:migrate`, plus `db:studio`.
   - The baseline migration creates every table with row level security enabled, and seeds the 8 verticals.
4. **Add auth** with Better Auth, a Google provider and the Drizzle adapter:
   - Files: `src/server/auth.ts`, `src/app/api/auth/[...all]/route.ts`, and `proxy.ts`, which redirects to `/login` when there is no session.
   - Add an `allowed_emails` table or env allowlist, and `users.role`.
   - Add a `src/server/authz.ts` helper `requireUser(req)` / `requireRole(req, ...roles)`.
   - Apply the helper to **every existing route** under `src/app/api/` (health stays public).
5. **Add `org_settings` and a Settings page** (`/settings`, ADMIN only): legal name, address, state, GSTIN, PAN, bank, signatory, logo and signature uploads (Vercel Blob, `@vercel/blob`), and the FY start month.
6. **Add core utilities, with tests:**
   - `src/server/lib/money.ts`: a `Paise` branded type, `toPaise`, `formatINR` (`en-IN`), `amountInWords` (Indian lakh/crore, "Rupees … and … Paise Only").
   - `src/server/services/gst.ts`: `computeTax({ items, orgState, placeOfSupply, hasGstin })` → `{ mode, subtotal, cgst, sgst, igst, roundOff, total }`.
   - `src/server/services/numbering.ts`: `nextNumber(tx, docType, date)` with FY detection (April–March) and a transactional increment on `number_series`.
   - `src/lib/ids.ts`: cuid2 ids.
7. **Set up tests and CI:**
   - Add `vitest` and `vitest.config.ts`.
   - Add `.github/workflows/ci.yml` running lint, `tsc --noEmit`, test and build on every push and PR.
8. **Fix the small bugs:**
   - `src/app/events/page.tsx` is mislabelled ("Social Calendar").
   - The Overview KPIs are hardcoded. Hide the numbers behind a "sample data" badge until Phase 8.
9. **Env:** update `.env.example` with `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BLOB_READ_WRITE_TOKEN`, `APP_ENCRYPTION_KEY` and `CRON_SECRET`. Remove the Redis, Postgres, Supabase and OpenAI vars that are no longer used.

**Done when**
- [ ] Opening the Vercel URL logged out shows `/login`, and `curl -X POST /api/clients` returns 401.
- [ ] `npm run db:migrate` runs against a fresh Postgres database and against production without data loss.
- [ ] Tests cover:
  - `gst.ts`: intra-state, inter-state, no GSTIN, round-off.
  - `money.ts`: words for 0, 1, 99, 1,00,000, 12,34,56,789.50.
  - `numbering.ts`: FY rollover on 1 April, concurrent issue gives distinct numbers.
- [ ] CI is green.

---

## Phase 1: CRM core (3–4 days)

**Goal:** companies and contacts replace the Notion Clients board.

**Tasks**

1. **Schema:** `companies`, `contacts`, `verticals`, `interactions`, `meetings` and `attachments`, all with `org_id` and `external_id` (see `plan.md` §5).
2. **Services:** `src/server/services/companies.ts`, `contacts.ts` and `interactions.ts`. Each mutation calls `logActivity`.
3. **API:**
   - `/api/companies` (GET list with search/filter by lifecycle, vertical and owner; POST)
   - `/api/companies/[id]` (GET, PATCH, archive)
   - `/api/companies/[id]/contacts`, `/api/companies/[id]/interactions`
   - `/api/verticals`
4. **UI:**
   - `/crm`: a table view and a lifecycle board (reuse `PipelineBoard` with a `companyLifecycle` model).
   - `/crm/[id]`: company page with a header (lifecycle, owner, vertical, GSTIN, state), contacts, a timeline of interactions and meetings, a next-action panel, attachments, and placeholders for deals, documents and invoices.
5. **Seed the verticals:** fertiliser, dairy, FMCG, law, interior, real estate, travel agency, rice mill.
6. **Notion import, part 1:** `scripts/import-notion.ts --only=clients,products,meetings` from a local CSV export, with `--dry-run`.
7. **Drop the old generic tables:** retire the `crm` entry of `pipeline_items` and the old `clients` table after the import has been verified.

**Done when**
- [ ] All clients from the Notion Clients DB exist as companies with contacts and the WhatsApp role/onboarded/approved flags.
- [ ] Adding an interaction with a next action shows it on the company page and in a "Due follow-ups" list.

---

## Phase 2: Document engine, invoices, work orders (6–7 days)

**Goal:** `reshuffle-invoice` can be switched off. This is the highest-value phase because invoices are in daily use.

**Tasks**

1. **Engine:**
   - Add `@react-pdf/renderer`.
   - `src/server/documents/engine.ts`:
     - `renderPreview(docType, data)`
     - `issue(docType, draftId, idempotencyKey)`, which in one transaction gets the number, freezes `snapshot_json`, sets the status and logs activity, then renders the PDF and stores it in Blob.
     - `renderIssued(documentId)`
   - Schema: `documents`, `document_templates` and `number_series`.
2. **Shared PDF parts** in `src/server/documents/parts/`: `Letterhead`, `PartyBlock`, `ItemsTable`, `TaxSummary`, `AmountInWords`, `BankBlock`, `SignatureBlock`, `Terms`. Register the Noto Sans font so the ₹ glyph renders. Port the layout and wording from `reshuffle-invoice/invoice-generator.html`, `work-order.html` and `letterhead.html`.
3. **Invoices:**
   - Schema: `invoices`, `invoice_items`, `payments`, `credit_notes`.
   - Service `src/server/services/invoices.ts`: create draft, edit draft, issue, record payment (writes a ledger entry once Phase 6 lands; until then store on the payment), cancel via credit note, and `markOverdue()`.
   - API: `/api/invoices`, `/api/invoices/[id]`, `/api/invoices/[id]/issue`, `/api/invoices/[id]/payments`, `/api/invoices/[id]/cancel`, `/api/pdf/documents/[id]`.
   - UI:
     - `/invoices`: list with status filters, receivables total and an overdue badge.
     - `/invoices/new` and `/invoices/[id]`: company picker auto-fills GSTIN and state, then tax mode is computed, then a live preview pane shows line items, advance/balance and payment terms.
   - Template `invoice/v1.tsx`: tax invoice with SAC column, CGST/SGST or IGST, round-off and amount in words.
4. **Credit notes:** template `credit-note/v1.tsx`, numbered in their own series.
5. **Work orders:**
   - Schema: `work_orders`, `work_order_items`.
   - Service, API (`/api/work-orders…`), UI (`/work-orders`, `/work-orders/[id]`).
   - Template `work-order/v1.tsx`: customer id, requested by, department, job details, taxed/untaxed items, completed date, comments.
6. **Letterhead:** template `letter/v1.tsx` plus a "New letter" page that takes free text and outputs a numbered PDF on letterhead.
7. **Cron:** `/api/cron/daily` (protected by `CRON_SECRET`, configured in `vercel.json`) runs `markOverdue()`.
8. **Navigation:** add a "Billing" group (Invoices, Work Orders, Letters) to `src/lib/navigation.ts`.
9. **Cutover for billing:**
   - Set the invoice series `next_value` to continue from the last number used in the static app.
   - Re-enter the unpaid historic invoices.
   - Redirect `invoice-eight-neon.vercel.app` to `/invoices` (edit `vercel.json` in that repo).
   - Remove the signature/logo PNGs from the public repo.

**Done when**
- [ ] An intra-state invoice and an inter-state invoice both issue with consecutive numbers, correct tax lines, amount in words, and a PDF that downloads and matches the old layout.
- [ ] Recording a partial and then a full payment moves the invoice ISSUED → PARTIALLY_PAID → PAID.
- [ ] An issued invoice cannot be edited (API returns 409). Cancelling requires a credit note.
- [ ] Double-clicking Issue does not burn two numbers (idempotency key test).
- [ ] The CA has seen one sample invoice PDF and signed off on format and tax.

---

## Phase 3: Sales pipeline and Scope Maker (6–7 days)

**Goal:** the Reference Client list and proposal writing move into the dashboard, and a won deal flows into delivery and billing.

**Tasks**

1. **Deals:**
   - Schema: `deals`, `deal_stage_history`, `diagnoses`.
   - Add a `deal` model to `src/server/models/pipeline.ts` with the stages from `plan.md` §6. LOST requires `lost_reason`.
   - Service `deals.ts`: transition (mirror `processPipelineTransition`), plus the side effects on WON.
2. **Deals UI:**
   - `/sales`: a board by stage, a list with filters (vertical, source, owner, temperature), and pipeline value per stage.
   - `/sales/[id]`: deal page with company link, source/referrer, quotation status, current block, next follow-up, timeline, scopes and a diagnosis tab.
3. **Diagnosis form:** the 8 discovery levels × 5 buckets from the sales playbook, stored as `diagnoses` rows. The deal summary shows the top pain buckets. Seed the question bank from the playbook (business overview, sales, marketing, operations, customer experience, finance, management, growth).
4. **Module library:**
   - Schema: `modules_library`.
   - Page `/settings/modules` to manage modules (inventory, subscription management, billing, CRM, dashboards, landing page, AI automation…) with default deliverables, days and price.
5. **Scope Maker:**
   - Schema: `scopes`, `scope_items`.
   - UI `/sales/[id]/scopes/[scopeId]`:
     - Left: problem statement (pre-filled from the diagnosis), engagement model picker, and phases with module or custom items, using drag to order.
     - Right: live preview, timeline weeks, total, payment schedule editor (for example 50/30/20 tied to milestones), and terms from a template.
   - Versioning: "Send" freezes the version; editing after that creates v+1 and supersedes the old one.
   - Template `scope/v1.tsx`: cover, problem, approach, scope table by phase, timeline, commercials, terms, acceptance.
6. **Public accept page:**
   - `/p/[token]`: read-only, no login. Accept captures typed name, timestamp and IP, sets the scope to ACCEPTED and logs activity.
   - Add a `proxy.ts` exception for `/p/*`.
   - Rate-limit with a simple per-IP counter in the DB.
7. **WON flow:** one button "Convert to project". It creates the project and milestones from the payment schedule and offers to "Draft work order" and "Draft advance invoice", pre-filled from the scope.
8. **Notion import, part 2:** `--only=reference-clients,proposals` → deals and scopes (status only).
9. **Retire the old pipelines:** move the `outreach` pipeline items into deals and remove the `outreach` module from config and nav.

**Done when**
- [ ] A deal can go LEAD → WON with a scope accepted through the public link.
- [ ] Converting a won deal creates a project, milestones, a draft work order and a draft advance invoice with the correct amounts.
- [ ] Sales board numbers (count and value per stage) match the list view.

---

## Phase 4: People documents (3 days)

**Goal:** offer letters, salary slips and agreements come out of the dashboard.

**Tasks**

1. **Schema:** `people`, `salary_slips`. PAN/bank are encrypted with `APP_ENCRYPTION_KEY` via `src/server/lib/crypto.ts` (AES-256-GCM), and the API returns them only to ADMIN.
2. **Text templates:** `document_templates.body` holds Markdown with `{{placeholders}}`, editable in `/settings/templates` with a version bump on save. Rendered by a `RichText` PDF part.
3. **Offer letter:** port `reshuffle-invoice/offer-letter.html` to `offer-letter/v1` (fields: salutation, name, role, start date, duties, signatory). UI `/people/[id]/offer-letter`.
4. **Salary slip:** port `salary-slip.html` to `salary-slip/v1` (earnings, deductions, gross, net, pay period, pay date). ADMIN only. UI `/people/[id]/salary-slips`.
5. **Freelancer agreement, service agreement and NDA:** text templates. The service agreement can be attached to a scope.
6. **UI:** `/people` list and `/people/[id]` with documents issued to that person.
7. **Notion import, part 3:** `--only=team`.

**Done when**
- [ ] An offer letter and a salary slip issue with numbers and PDFs.
- [ ] A MANAGER cannot see salary or PAN (API test).

---

## Phase 5: Projects and freelancers (4–5 days)

**Goal:** delivery is tracked on real tables, and freelancers have their own view.

**Tasks**

1. **Schema:** `projects`, `milestones`, `tasks`, `freelancers`, `assignments`, `payouts`. Migrate the current `projects`, `tasks` and `freelancers` rows.
2. **Projects:**
   - `/projects`: board by status, reusing `PipelineBoard` on the `projects` model.
   - `/projects/[id]`: milestones (each one can trigger "Draft invoice for this milestone"), tasks board, team (assignments with allocation %), linked documents and invoices, and budget versus invoiced versus paid.
3. **Freelancers:**
   - `/freelancers`: replaces the current page. It reads the new table and adds skills filter, availability, utilization (computed from assignments) and rating.
   - `/freelancers/[id]`: assignments, payouts, documents.
   - Partner agencies are freelancers with `agency` set.
4. **Payouts:** create from an assignment or milestone. Marking one paid writes a ledger entry in Phase 6 and is linked until then.
5. **Freelancer portal:** users with role FREELANCER see only `/me`, which shows assigned tasks (status updates allowed), their own work orders and payouts, and published docs. Enforce row-level checks in services.
6. **Notion import, part 4:** `--only=projects,tasks,freelancer-collaborations`.

**Done when**
- [ ] A FREELANCER login sees only their own tasks and payouts (API tests for leakage).
- [ ] A project page shows invoiced and paid figures that match the invoices module.

---

## Phase 6: Finance (3–4 days)

**Goal:** the Notion finance tracker and the local-state finance page are replaced.

**Tasks**

1. **Schema:** `ledger_entries`, `expense_categories`, `finance_plans`.
2. **Automatic entries:** invoice payments and paid payouts write ledger entries. Add a backfill for anything recorded in Phases 2 and 5.
3. **`/finance` tabs:**
   - **Ledger:** add income or expense, categories, attachment for the bill.
   - **Receivables:** aging buckets 0–30, 31–60, 61–90 and 90+ days.
   - **Monthly:** income, expense and net by month for the FY.
   - **GST:** output tax by month, split CGST/SGST/IGST, B2B list with GSTINs. CSV export shaped for the CA (GSTR-1 style columns).
   - **Plan:** the existing quarter projection tables from `src/app/finance/page.tsx`, now persisted.
4. **Notion import, part 5:** `--only=transactions,invoices-history,months`.

**Done when**
- [ ] The ledger's monthly totals equal the sum of payments minus expenses and payouts for the month (test).
- [ ] The GST CSV for a month matches the issued invoices.

---

## Phase 7: Marketing, events, goals, docs (4 days)

**Tasks**

1. **Marketing:**
   - `social_accounts` (one per vertical/platform) and `content_items`. Migrate `social_entries`.
   - `/marketing`: calendar view (month), board by status, accounts list.
   - Keep the existing `src/app/social/page.tsx` UI pieces where they fit, then delete the route.
2. **Events:**
   - `events`, `event_team`, `event_registrations`.
   - `/events`: board (PLANNED → CONFIRMED → EXECUTED → ARCHIVED), detail with team, registrations (CSV import), revenue and costs (ledger link), and links to the workshop sheet and doc.
   - Template: event certificate (optional).
3. **Goals:** `goals` by month and team, with a `/goals` board. Import the April Goals DB.
4. **Docs:**
   - `docs` with Markdown editor and preview. Types: SOP, PLAYBOOK, DECISION, NOTE, RESOURCE.
   - `/docs` with search.
   - Seed DECISION entries DL-001…DL-005 and the Sales Essentials playbook (typed in by hand from the source docs, not committed as seed data).
5. **Asset library:** `assets` on Vercel Blob, linked to projects and verticals.
6. **Notion import, part 6:** `--only=marketing,events,goals,resources`.

---

## Phase 8: Overview, search, notifications (3 days)

**Tasks**

1. **`/` Overview with real KPIs:**
   - pipeline value by stage, won this month, conversion rate (from `deal_stage_history`)
   - receivables and overdue
   - active projects, projects at risk (overdue milestones)
   - freelancer utilization
   - this week's follow-ups and meetings
   - recent activity

   Delete `src/lib/module-data.ts`.
2. **Global search** (⌘K): companies, contacts, deals, invoices by number, projects, docs. A Postgres `ILIKE` query is enough at this size.
3. **In-app notifications:** a `notifications` table plus a bell. Written by services and by the daily cron:
   - follow-up due
   - invoice overdue
   - scope accepted
   - task assigned
4. **Daily digest:** the cron builds a "today" list per user, shown on the Overview page and emailed in Phase 9.

---

## Phase 9: Integrations (optional, 4–6 days)

Do these only after the cutover in Phase 10 has stuck.

1. **Email send:**
   - Send an invoice, scope link or offer letter from the dashboard (Gmail API with the org Google account, or Resend).
   - Log it as an interaction.
2. **WhatsApp Cloud API:**
   - Send document links and payment reminders.
   - The contact `whatsapp_role`/`onboarded`/`approved` fields drive the bot flow that already exists in the Notion design.
   - Incoming webhook at `/api/webhooks/whatsapp`.
3. **Google Calendar:** create meetings with an invite, and two-way sync of `meetings`.

---

## Phase 10: Cutover (2–3 days, plus 2 weeks parallel run)

1. Run the full Notion import against production with `--dry-run`, review the diff, then run it for real.
2. Make Notion read-only for the team and add a "moved to dashboard" banner on each top-level page.
3. Run in parallel for two weeks: all new work goes in the dashboard. Keep a running list of gaps and fix them.
4. Archive: export Notion again as a final backup and store it outside the repo.
5. Set up the backup cron (`/api/cron/backup` → Blob, keep 30 days) and test one restore.
6. Write `docs/RUNBOOK.md`: how to add a user, rotate keys, restore a backup, start a new FY number series, and fix a wrong invoice (credit note).

**Done when**
- [ ] Two weeks pass with no one opening Notion or the old invoice app for daily work.
- [ ] A restore from backup has been tested.

---

## Dependencies between phases

```
P0 ─► P1 ─► P2 ─► P3 ─► P5 ─► P6 ─► P8 ─► P10
            │      │                 ▲
            │      └─► P4 ───────────┤
            └──────────────► P7 ─────┘          P9 after P10
```

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Live app is writable by anyone with the URL today | Certain | High | Phase 0 auth goes first, before any new feature |
| GST mistakes on real invoices (IGST vs CGST/SGST, SAC, rounding) | Medium | High | Unit tests on `gst.ts`; CA sign-off on a sample before the first real invoice; credit-note path for corrections |
| Invoice number gaps or duplicates | Low | High | Number assigned only at issue, in a transaction, with an idempotency key; test concurrent issue |
| Next 16 API differences break assumptions (proxy, caching, route handlers) | Medium | Medium | Read the bundled docs first (`AGENTS.md`); keep route handlers dynamic; note findings in `handoff.md` |
| react-pdf output differs from the old HTML layout | Medium | Low | Port the parts one at a time and compare side by side with old PDFs |
| Notion export columns are messy or renamed | High | Low | Import script with explicit column maps, dry-run diff, idempotent on `external_id` |
| Scope creep (every phase grows) | High | Medium | Each phase has a "done when" list; anything extra goes to a backlog section in `handoff.md` |
| Client or personal data committed to the public repo | Medium | High | No real data in seeds or tests; add `.gitignore` entries for exports; consider making the repo private |
| Team keeps using Notion out of habit | Medium | Medium | Read-only Notion plus banner at cutover; the dashboard must be faster for the top 5 daily actions |
| Supabase free-tier limits (projects pause when idle, no point-in-time recovery) | Medium | High | Use a paid tier or a keep-alive cron; periodic `pg_dump` off-platform |

---

## Open decisions (Srijan to confirm; defaults are used if there is no answer)

1. **Auth provider:** Better Auth (default) or Clerk.
2. **Invoice number format:** `RS/26-27/001` (default). It must continue the existing series.
3. **Payment schedule default** on scopes: 50% advance, 30% mid, 20% on delivery (default).
4. **Repo visibility:** make `Reshuffle_dashboard` and `reshuffle-invoice` private (recommended).
5. **Email channel for Phase 9:** Gmail API on the company account (default) or Resend.
