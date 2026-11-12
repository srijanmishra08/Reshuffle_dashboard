# ReShuffle OS — System Plan

**Goal:** make this dashboard the single operating system for Reshuffle OPC. The Notion workspace and the separate invoice app (`reshuffle-invoice`) get retired. Every lead, scope, work order, invoice, offer letter, project, freelancer, payment, event and SOP is created and tracked here.

**Status:** plan, not yet built. Execution order and tasks are in `development-plan.md`; state of the code and how to pick it up are in `handoff.md`.

**Last updated:** 2026-11-12

> This repo is public on GitHub. Nothing in these docs (or in seed data, fixtures or commits) may contain client names, phone numbers, emails, amounts, GSTIN, PAN or bank details. Real data lives only in the database.

---

## 1. What we are replacing

| Today | Lives in | Moves to |
|---|---|---|
| Clients board (process status, payment status, next meeting, WhatsApp role/onboarded/approved flags) | Notion → Reshuffle OS → Clients | **Companies + Contacts + Client lifecycle** |
| Reference Client list (lead source, product type, quotation status, reason for not converting, current block) | Notion → Clients → Sales | **Deals (sales pipeline)** |
| Sales "Essentials" pitch, sales outbound deck link | Notion → Sales → Essentials | **Docs / Playbooks** |
| Products list (8 verticals: fertiliser, dairy, FMCG, law, interior, real estate, travel, rice mill) | Notion → Client CRM → Products | **Verticals + Module library** |
| Monthly goals (April Goals DB) | Notion | **Goals** |
| Marketing calendar + per-vertical social accounts | Notion → Marketing; dashboard `/social` | **Marketing** |
| Transactions, Invoices, Yearly breakdown, Proposal Tracker | Notion → Finance tracker | **Finance ledger + Invoices + Proposals** |
| Event management + event team, workshop sheet, events doc | Notion → Events; Google Sheets/Docs | **Events** |
| Projects & Tasks, Meetings, Resources & Notes, Freelancers Collaborations | Notion → Reshuffle OS | **Projects, Tasks, Meetings, Freelancers, Docs** |
| GST tax invoice generator (CGST/SGST 9%, advance/balance, PDF) | `reshuffle-invoice/invoice-generator.html` | **Invoices** |
| Work order generator | `reshuffle-invoice/work-order.html` | **Work Orders** |
| Offer letter generator | `reshuffle-invoice/offer-letter.html` | **People → Offer letters** |
| Salary slip generator | `reshuffle-invoice/salary-slip.html` | **People → Salary slips** (admin only) |
| Letterhead | `reshuffle-invoice/letterhead.html` | **Document engine → Letterhead template** |
| Scope / proposal writing | Docs, Canva, by hand | **Scope Maker** (new) |
| Decision log DL-001…, SOPs | Google Doc "Vision & Narrative" | **Docs → Decision log, SOPs** |

Out of scope for this plan: the iOS networking app, the public website (reshxffle.com) and the free website tools. They stay separate. The dashboard can link to them.

---

## 2. Requirements

### Functional
1. **CRM:** companies, contacts, client lifecycle, timeline of every touch (call, meeting, WhatsApp, email, note), next-meeting and follow-up dates, attachments.
2. **Sales pipeline:** deals from lead to won/lost, with source/referrer, vertical, deal value, quotation status, current block, lost reason, and the 8-level discovery / 5-bucket diagnosis captured on the deal.
3. **Scope Maker:** build a scope from a module library (plug-and-play modules + custom), with phases, deliverables, timeline, pricing, engagement model (Problem Diagnosis / Done For You / Dedicated Team / AI + Human Ops), terms and payment schedule. Versioned. Exported as PDF and shareable as a read-only link the client can accept.
4. **Work orders:** generated from an accepted scope (or by hand), numbered, with line items and tax, signed off with a completed date.
5. **Invoices:** GST tax invoices with consecutive numbering per financial year, CGST+SGST for intra-state and IGST for inter-state, advance/balance schedule, partial payments, overdue tracking, credit notes for cancellations. Amount in words (Indian lakh/crore format). PDF.
6. **People documents:** offer letters, salary slips, letterhead, service agreements and NDAs for team and freelancers, all generated from templates and numbered.
7. **Projects:** a project is created from a won deal. It has milestones, tasks, an assigned freelancer team, linked documents and linked invoices.
8. **Freelancers:** profile, skills, rate, availability, assignments, payouts, ratings, and their own limited view.
9. **Finance:** ledger (income/expense/payout), expense categories, receivables and aging, a monthly breakdown, a GST summary export for filing, and the existing finance plan sheet persisted.
10. **Marketing, Events, Goals, Docs:** social content calendar, per-vertical accounts, events with team and registrations, monthly goals, SOPs, decision log, asset library.
11. **Overview:** real KPIs (pipeline value, won this month, receivables, overdue, active projects, freelancer load) replacing the hardcoded numbers in `src/lib/module-data.ts`.
12. **Import:** one-time import of Notion data so nothing has to be retyped.

### Non-functional
- **Users:** 3–15 internal users plus freelancers. Hundreds of companies, low thousands of documents per year. This is a small internal tool; no scale engineering needed.
- **Cost:** stay on free tiers (Vercel Hobby/Pro, Turso free, no always-on worker).
- **Security:** nothing readable or writable without login. Role-based access. Salary slips, PAN and bank data visible to ADMIN only.
- **Correctness of money:** integer paise everywhere. Issued invoices are immutable. Numbering is gap-free per series.
- **Speed of delivery:** one developer (founder) plus Claude. Each phase ships something usable on its own.

### Constraints
- Next.js 16.2 / React 19.2. `AGENTS.md` warns that this Next version has breaking changes, so read `node_modules/next/dist/docs/` before writing routing, proxy/middleware or caching code.
- Already deployed on Vercel with Turso env vars set.

---

## 3. Current state (audit, 2026-11-12, commit `323cab5`)

| Area | Reality |
|---|---|
| Data layer | **Two layers, only one used.** `prisma/schema.prisma` (Postgres) defines 14 models but nothing in `src/` imports `@/lib/db`. Runtime uses raw SQL on Turso via `src/lib/turso.ts`, which creates 8 tables with `CREATE TABLE IF NOT EXISTS` on every cold start. There are no migrations. |
| Auth | **None.** Every `/api/*` route accepts anonymous reads and writes on the public Vercel URL. tRPC procedures are all `publicProcedure`. |
| Pipelines | Generic `pipeline_items` table + config in `src/server/models/pipeline.ts` (allowed transitions per module). Transition is validated, persisted and logged (`src/server/services/pipeline.ts`). This is the best part of the codebase. Keep the idea, move it onto real tables. |
| Realtime | In-memory pub/sub (`src/server/services/realtime.ts`) + SSE. Does not work across Vercel serverless instances: a change made on one instance is not pushed to clients connected to another. |
| Automation | BullMQ queue + worker (`src/workers/automation-worker.ts`). The worker only logs. Vercel cannot host it; it needs an always-on Redis box. |
| Finance page | `src/app/finance/page.tsx` is local React state only. Edits are lost on reload. |
| Overview | KPIs and activity feed are hardcoded (`src/lib/module-data.ts`). |
| Events page | `src/app/events/page.tsx` is titled "Social Calendar" and renders the social pipeline (copy-paste bug). |
| Tests / CI | None. |
| Invoice app | Separate static site. Five HTML pages with client-side `html2pdf.js`. No persistence, numbering typed by hand, CGST/SGST only (no IGST), signature and logo PNGs committed in the repo. |

---

## 4. Architecture

```
                         ┌─────────────────────────────────────────────┐
  Browser (team) ───────►│ Next.js 16 on Vercel                         │
  Browser (freelancer) ─►│                                              │
  Client (public link) ─►│  proxy.ts  → auth session + role check       │
                         │                                              │
                         │  app/(app)/*        UI pages (React 19)      │
                         │     └─ TanStack Query → REST route handlers  │
                         │  app/api/*          REST route handlers      │
                         │  app/p/[token]      public scope/invoice view│
                         │  app/api/cron/*     daily jobs (Vercel Cron) │
                         │  app/api/pdf/*      PDF render (react-pdf)   │
                         │                                              │
                         │  src/server/services/*   business logic      │
                         │     ├─ numbering, gst, money, documents      │
                         │     ├─ crm, deals, scopes, invoices, ...     │
                         │     └─ activity (audit), automations         │
                         │  src/server/db/*  Drizzle schema + queries   │
                         └───────────────┬──────────────────────────────┘
                                         │ libSQL
                              ┌──────────▼──────────┐     ┌──────────────────┐
                              │ Turso (SQLite)       │     │ Vercel Blob       │
                              │ all business data    │     │ uploads, signed   │
                              └──────────────────────┘     │ PDFs, logos       │
                                                           └──────────────────┘
   Later (Phase 9): Gmail API (send docs), WhatsApp Cloud API (bot + reminders), Google Calendar.
```

### Key decisions

| # | Decision | Why | Trade-off / alternative |
|---|---|---|---|
| D1 | **One database: Turso (libSQL).** Delete Prisma/Postgres. | It is already the runtime store and already configured on Vercel. Free tier covers this load many times over. | SQLite has fewer types (no native decimal/array/JSON column types). Handled with integer paise and JSON text. Postgres (Neon/Supabase) would be the move only if we needed heavy reporting SQL. |
| D2 | **Drizzle ORM** for schema, typed queries and migrations (`drizzle-kit`). | The raw-SQL + `CREATE TABLE IF NOT EXISTS` pattern will not survive ~30 tables and schema changes. Drizzle is thin, works with libSQL, and keeps SQL visible. | A new dependency to learn. Prisma has a libSQL adapter too, but its migrations are awkward on Turso and its client is heavier on serverless. |
| D3 | **Auth: Better Auth** with Google sign-in, an email allowlist and roles (ADMIN, MANAGER, MEMBER, FREELANCER). | Free, self-hosted, ships a Drizzle adapter and a role plugin. No per-seat cost. | Clerk is faster to wire but costs money past the free tier and holds user data off-site. Auth.js is the other free option. |
| D4 | **REST route handlers + service layer + TanStack Query.** Remove the unused tRPC scaffold. | This is what the UI already does (`pipeline-board.tsx` uses `fetch` against REST). One pattern is easier for one developer. | tRPC gives end-to-end types. We get most of that by sharing Zod schemas between route and client. |
| D5 | **Document engine: one system for every generated document.** Issued documents are stored as an immutable JSON snapshot plus template version. PDFs are rendered server-side with `@react-pdf/renderer`. | Invoices, work orders, scopes, offer letters, salary slips, letterheads and agreements share the same needs: template, data, numbering, versions, status, PDF, share link. Build it once. Server-side PDFs can be emailed or WhatsApped later. | The react-pdf layout model is not HTML, so each template is written once in its primitives. `html2pdf` in the browser is quicker but cannot attach to emails and renders differently per browser. |
| D6 | **No always-on worker.** Replace BullMQ/Redis with Vercel Cron → `/api/cron/*` for scheduled jobs. Side effects run inline in services. | Vercel cannot host a BullMQ worker. Daily jobs are enough here: overdue invoices, follow-ups due, meeting reminders. | If we ever need retries/fan-out, add Upstash QStash (HTTP-based, free tier). |
| D7 | **Polling instead of in-memory realtime.** TanStack Query `refetchInterval` (15–30 s on boards) + refetch on focus. Delete `realtime.ts` and the SSE routes. | The in-memory bus is broken on serverless. For under 15 users, polling is invisible. | Use Supabase Realtime, Ably or Pusher if live collaboration becomes important. |
| D8 | **Money = integer paise (INR).** One `money.ts` util for maths, formatting (`en-IN`) and amount-in-words. | Floats break GST rounding. | Every boundary must convert, enforced with a branded `Paise` type. |
| D9 | **Notion import via CSV export, not the Notion API.** | The Notion API query allowance runs out fast on the current plan (we hit it on 2026-11-12). A full workspace export is free and complete. | Requires a manual export step; the import script must tolerate messy columns. |
| D10 | **Files in Vercel Blob.** Signature, logo, attachments, archived PDFs. Signature/logo PNGs are removed from public repos. | Signature images should not sit in a public GitHub repo. | Supabase Storage is the alternative if we ever move DBs. |

---

## 5. Data model

All tables have `id` (text, cuid2), `created_at`, `updated_at`, `created_by`. Soft delete via `archived_at` for business records. Money columns end in `_paise` (integer).

### Identity & settings
- **users**: name, email, image, role (`ADMIN | MANAGER | MEMBER | FREELANCER`), `freelancer_id` (nullable link), active. Plus Better Auth's session/account tables.
- **org_settings** (one row): legal name, address, state code, GSTIN, PAN, bank details, default terms, logo/signature blob keys, signatory name/title, financial-year start month.
- **number_series**: `doc_type`, `fy` (e.g. `2026-27`), `prefix`, `next_value`, `padding`. Atomic increment inside a transaction.

### CRM & sales
- **companies**: name, legal name, GSTIN, state code, address, vertical_id, website, `lifecycle` (`PROSPECT | ONBOARDING | ACTIVE | MAINTENANCE | CLOSED`), owner_id, source, referrer, notes.
- **contacts**: company_id, name, role, phone, email, whatsapp, `whatsapp_role` (`CLIENT | CLIENT_TEAM`), `onboarded`, `approved` (these carry over the Notion bot fields).
- **verticals**: name (fertiliser, dairy, FMCG, law, interior, real estate, travel, rice mill…), description, product links.
- **deals**: company_id, title, stage, value_paise, vertical_id, engagement_model, source, referrer, quotation_status, current_block, lost_reason, expected_close, next_follow_up, owner_id.
- **deal_stage_history**: deal_id, from, to, at, by (feeds conversion metrics).
- **diagnoses**: deal_id, level (1–8), bucket (`REVENUE | MARKETING | OPERATIONS | CUSTOMER_EXPERIENCE | MANAGEMENT`), question, answer, pain_score. Captures the discovery call.
- **interactions**: company_id, contact_id, deal_id, type (`CALL | MEETING | WHATSAPP | EMAIL | NOTE | SITE_VISIT`), summary, at, next_action, next_action_at.
- **meetings**: company_id, deal_id, project_id, title, at, location/link, attendees (JSON), notes.

### Scopes & documents
- **modules_library**: name, description, category (inventory, subscription, billing, CRM, landing page, …), default deliverables (JSON), default estimate_days, default_price_paise, vertical_ids (JSON).
- **scopes**: deal_id, company_id, title, version, status (`DRAFT | SENT | ACCEPTED | REJECTED | SUPERSEDED`), engagement_model, problem_statement, buckets (JSON), timeline_weeks, total_paise, payment_schedule (JSON: `[{label, percent, due_on}]`), terms, public_token, accepted_at, accepted_by_name.
- **scope_items**: scope_id, module_id (nullable for custom), phase, title, description, deliverables (JSON), estimate_days, price_paise, sort.
- **documents** (the engine's issued record): doc_type (`INVOICE | CREDIT_NOTE | WORK_ORDER | SCOPE | OFFER_LETTER | SALARY_SLIP | AGREEMENT | NDA | LETTER`), number, template_key, template_version, status, `snapshot_json` (all rendered data, frozen at issue), company_id, contact_id, project_id, person_id, pdf_blob_key, issued_at, issued_by, public_token.
- **document_templates**: key, version, doc_type, name, body (for text-heavy templates like offer letters: Markdown with `{{placeholders}}`), active.

### Billing
- **invoices**: document_id, company_id, project_id, scope_id, invoice_date, due_date, place_of_supply_state, `tax_mode` (`INTRA | INTER`), subtotal_paise, cgst_paise, sgst_paise, igst_paise, total_paise, advance_paise, balance_paise, status (`DRAFT | ISSUED | PARTIALLY_PAID | PAID | OVERDUE | CANCELLED`), payment_terms, notes.
- **invoice_items**: invoice_id, description, sac_code, qty, rate_paise, amount_paise, taxable (bool).
- **payments**: invoice_id, amount_paise, received_on, method (`BANK | UPI | CASH | CARD | OTHER`), reference, ledger_entry_id.
- **credit_notes**: invoice_id, document_id, reason, amount_paise.
- **work_orders**: document_id, company_id, project_id, scope_id, wo_date, requested_by, department, job_details, completed_on, status (`DRAFT | ISSUED | IN_PROGRESS | COMPLETED | CANCELLED`), items via **work_order_items** (qty, description, unit_paise, taxed).

### Delivery
- **projects**: company_id, deal_id, scope_id, name, status (`BACKLOG | IN_PROGRESS | BLOCKED | DONE | MAINTENANCE`), start, deadline, owner_id, budget_paise.
- **milestones**: project_id, title, due, status, linked invoice schedule line.
- **tasks**: project_id, milestone_id, title, details, status, priority, assignee_user_id / assignee_freelancer_id, due.
- **freelancers**: name, email, phone, skills (JSON), rate_type/rate_paise, availability_hours, status (`AVAILABLE | ASSIGNED | AT_RISK | OFFBOARDED`), rating, agency (nullable, for the 15 partner agencies), PAN/bank fields restricted.
- **assignments**: freelancer_id, project_id, role, allocation_pct, start, end, status.
- **payouts**: freelancer_id, project_id, amount_paise, due_on, paid_on, status, ledger_entry_id.

### People
- **people**: name, email, phone, role/title, type (`EMPLOYEE | INTERN | FREELANCER`), start_date, salary fields (ADMIN only), PAN/bank (ADMIN only, encrypted at rest with an app key).
- **salary_slips**: person_id, period, earnings (JSON), deductions (JSON), gross_paise, net_paise, document_id.

### Finance
- **ledger_entries**: date, type (`INCOME | EXPENSE | PAYOUT | TRANSFER`), category, amount_paise, company_id, project_id, invoice_id, payout_id, method, reference, note. Payments and payouts write here automatically.
- **expense_categories**: name (software subscription, stock assets, travel, events, legal, marketing, …).
- **finance_plans**: the existing quarter projection sheets (`src/app/finance/page.tsx`), persisted as rows.

### Marketing, events, knowledge
- **social_accounts**: vertical_id, platform, handle, url, owner.
- **content_items**: account_id, title, script, platform, publish_on, status (`IDEA | DRAFT | SCHEDULED | POSTED`). Migrates the current `social_entries` table.
- **events**: name, type (`SPRINT | WORKSHOP | IDEATHON | BOOTCAMP | MEETUP`), date, venue, status, capacity, ticket_price_paise, partner, notes. Plus **event_team** (person/role) and **event_registrations** (name, contact, paid, attended).
- **goals**: period (month), title, team, priority, status, owner, due.
- **docs**: title, type (`SOP | PLAYBOOK | DECISION | NOTE | RESOURCE`), body (Markdown), status (`DRAFT | IN_REVIEW | PUBLISHED | DEPRECATED`), linked entity. Decision log entries keep their `DL-xxx` code.
- **assets**: name, type (photo/icon/illustration/video), url/blob_key, status, project_id.

### Cross-cutting
- **activity_log**: actor, action, module, entity_type, entity_id, metadata (JSON). Keeps the existing `logActivity` contract.
- **attachments**: entity_type, entity_id, blob_key, filename, mime, size.
- **automation_rules**: trigger, condition (JSON), action (JSON), enabled. Evaluated inline by services and by cron.

---

## 6. Core flow: lead to cash

```
Lead captured ──► Deal(LEAD) ──► CONTACTED ──► DIAGNOSED ──► PROPOSAL_SENT ──► NEGOTIATION ──► WON ──► (Company → ONBOARDING)
   │ source, referrer      discovery call:      Scope v1 built      client opens            │
   │                       8 levels × 5         from module         /p/<token>, accepts     │
   │                       buckets saved        library → PDF                               ▼
   └─ interactions + follow-ups on every stage                                  Project created from scope
                                                                               (milestones = payment schedule)
                                                                                         │
                     ┌───────────────────────────────────────────────────────────────────┤
                     ▼                                    ▼                              ▼
               Work Order issued              Advance Invoice issued            Freelancers assigned
               (WO/26-27/001)                 (RS/26-27/001, GST engine)        (assignments, payouts)
                                                     │
                                         Payment recorded → ledger entry
                                         Milestone done → Balance invoice
                                         Overdue → daily cron flags + reminder
                                                     │
                                         Project DONE → Company → MAINTENANCE / CLOSED
```

Stage rules stay as config, extending the existing `pipelineModels` pattern in `src/server/models/pipeline.ts`:

```
deal:    LEAD → CONTACTED → DIAGNOSED → PROPOSAL_SENT → NEGOTIATION → WON
         any open stage → LOST (lost_reason required);  LOST → LEAD (reopen)
invoice: DRAFT → ISSUED → PARTIALLY_PAID → PAID;  ISSUED/PARTIALLY_PAID → OVERDUE (cron);  ISSUED → CANCELLED (credit note required)
scope:   DRAFT → SENT → ACCEPTED | REJECTED;  any → SUPERSEDED when v+1 is sent
```

Side effects (run inline in the service, all logged to `activity_log`):
- Deal → WON: create Project from the accepted scope, set Company lifecycle to ONBOARDING, create milestones from the payment schedule.
- Scope → ACCEPTED: lock the scope version; offer to draft a Work Order and the advance Invoice.
- Payment recorded: write a ledger entry and recompute invoice status.
- Invoice issued: freeze the snapshot, render the PDF, store it in Blob.

---

## 7. Document engine

```
template (React-PDF component + version) + data (from DB) ─► preview (HTML route, live)
                                                          └─► issue ─► number from series (transaction)
                                                                    ─► snapshot_json frozen
                                                                    ─► PDF rendered, stored in Blob
                                                                    ─► status ISSUED, activity logged
```

- **Templates** live in `src/server/documents/templates/<doc-type>/v<n>.tsx`. A new version never changes already issued documents, because they render from their own `template_version` + `snapshot_json`.
- **Shared parts:** letterhead header/footer, party block, items table, tax summary, amount in words, bank block, signature block, terms. These are ported from the five HTML pages in `reshuffle-invoice`.
- **Fonts:** register Noto Sans (or Inter) with react-pdf. The built-in Helvetica has no ₹ glyph.
- **Numbering:** `number_series` per doc type and financial year (India FY runs April–March). Formats (editable in settings):
  - Invoice `RS/26-27/001` (GST rules: unique, consecutive, max 16 characters, per FY)
  - Credit note `RS-CN/26-27/001`
  - Work order `WO/26-27/001`
  - Scope `SC/26-27/001-v2`
  - Offer letter `OL/26-27/001`
  The number is assigned only at issue, inside a DB transaction, so drafts never burn numbers.
- **GST engine** (`src/server/services/gst.ts`):
  - Place of supply = client's state (B2B services). Same state as org (Chhattisgarh) → CGST 9% + SGST 9%. Different state → IGST 18%. Missing GSTIN → B2C, tax on org state.
  - The current invoice app only does CGST/SGST, which is wrong for out-of-state clients (e.g. Mumbai-based ones).
  - Round per line to paise, total to the rupee with a visible round-off line.
  - **Have the CA confirm** rates, SAC codes and round-off rules before the first real invoice goes out.
- **Public link:** `/p/<token>` shows a read-only scope or invoice. For scopes, an Accept button records name, timestamp and IP. Tokens are random 32 bytes and revocable.
- **Editing issued documents:** not allowed. Cancel the invoice with a credit note, or supersede the scope with v+1.

---

## 8. Roles and access

| Area | ADMIN | MANAGER | MEMBER | FREELANCER |
|---|---|---|---|---|
| CRM, deals, scopes | full | full | read + edit own | — |
| Invoices, credit notes, payments | full | create/issue | read | — |
| Work orders | full | full | read | own (read) |
| Projects, tasks | full | full | assigned | assigned tasks only |
| Freelancers | full | full | read | own profile |
| Payouts | full | read | — | own (read) |
| People, offer letters | full | create | — | own letter |
| Salary slips, PAN, bank | full | — | — | own slip |
| Finance ledger, GST export | full | read | — | — |
| Settings, number series, users | full | — | — | — |
| Marketing, events, goals, docs | full | full | full | read published docs |

Enforced in three layers: `proxy.ts` (must be signed in), a `requireRole()` helper at the top of every route handler, and row-level filtering in services for FREELANCER/MEMBER.

---

## 9. Migration from Notion and the invoice app

1. **Export:** Notion → Settings → Export → Markdown & CSV, including subpages. Put the zip outside the repo (it contains client data).
2. **Import script:** `scripts/import-notion.ts <export-dir>` maps the CSVs to tables:
   - Clients → companies + contacts
   - Reference Client → deals
   - Products → verticals
   - April Goals → goals
   - Transactions → ledger_entries
   - Invoices → invoices (status only; historic PDFs attached as files, not re-rendered)
   - Proposal Tracker → scopes (status only)
   - Event management → events
   - Team → people
   - Meetings → meetings
   - Projects & Tasks → projects + tasks

   The script is idempotent (keyed on Notion page id stored in `external_id`). Dry-run mode prints a diff first.
3. **Invoice history:** historic invoices made with the static app are not in any DB. Re-enter only the open ones (unpaid), or attach their PDFs to the company. Set the invoice number series to continue after the last number used.
4. **Parallel run:** two weeks where new work goes into the dashboard only and Notion is read-only.
5. **Cutover:**
   - Notion pages get a banner "moved to dashboard".
   - `invoice-eight-neon.vercel.app` redirects to `/invoices`.
   - Remove the signature/logo PNGs from the public `reshuffle-invoice` repo, since git history still holds them. Consider making that repo private.

---

## 10. Reliability, backups, monitoring

- **Backups:** Turso point-in-time restore on the paid tier; on free, a nightly cron `/api/cron/backup` dumps the DB to Vercel Blob (keep 30 days). Test a restore once.
- **Errors:** Vercel logs plus Sentry free tier when we have real users.
- **Audit:** every mutation writes `activity_log` (existing `logActivity`), including the actor once auth lands.
- **Idempotency:** issuing documents and recording payments take an idempotency key from the client to avoid double numbers on double-clicks.
- **Data protection:** PAN/bank fields are encrypted with `APP_ENCRYPTION_KEY` (AES-GCM) and never sent to non-admin clients. No client data in logs.

---

## 11. What to revisit as it grows

- **More than ~20 internal users, or live co-editing:** add a realtime provider (D7).
- **Heavy reporting/BI:** replicate to Postgres or DuckDB, or move to Postgres (D1).
- **Retries/fan-out for WhatsApp/email at volume:** QStash or a small worker (D6).
- **Client portal** (clients log in to see projects, invoices, approvals): the public token pages are the seed for this.
- **Accounting sync** (Tally/Zoho Books) once invoice volume justifies it; the ledger is shaped to export cleanly.
- **Multi-entity** (if the incubator or co-working becomes its own company): add `org_id` to every table. It is cheap to add now (one column, default org) and expensive later. **Recommendation: add `org_id` from day one.**
