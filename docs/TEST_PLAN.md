# Test Plan

Last checked against the code on 2026-11-26: 48 test files, 1082 tests.

## How tests run

`npm test` (Vitest, `src/**/__tests__/**/*.test.ts`) needs no database. `src/test/db.ts` builds a fresh in-memory Postgres (PGlite) and applies every migration in `drizzle/`, so tests exercise the real schema. Before pushing, run `npm run lint`, `npx tsc --noEmit`, `npm test` and `npm run build`. The GitHub `check` job currently fails within seconds on every run (a setup problem), so these local runs are the real gate.

## What is covered

| Area | Where |
|---|---|
| Services (one test file per area) | `src/server/services/__tests__/`: CRM, deals and modules, scopes and sharing, invoices, work orders, letters, people and salary slips, delivery and project tasks, finance and reports, marketing, events, goals, docs, questionnaires, ingest, portal, access, team, hub and search, overview, demo data, legacy moves |
| Money, GST, numbering | `money.test.ts`, `gst.test.ts`, `numbering.test.ts` (rounding, IGST vs CGST+SGST, financial-year rollover, 16-character limit) |
| Route guards | `src/server/__tests__/api-routes.test.ts` finds every `route.ts` and checks 401 signed out and 403 for the wrong role, for team routes and portal routes; 400, 404 and org isolation for companies and settings; portal ownership; the admin portal preview; the invoice software upload |
| Sessions and pages | `session-user.test.ts` (revoked or inactive users are signed out), `page-guard.test.ts` (role-gated pages), `hardening.test.ts` (public paths, safe login redirect, production env check) |
| Database | `migrations.test.ts` (migrations apply; RLS is on for every public table), `client.test.ts` (one shared pooled client) |
| Documents | `src/server/documents/__tests__/engine.test.ts` (PDFs render, including the rupee sign) |
| Navigation | `src/lib/__tests__/navigation.test.ts` (every page listed once, points at a real route, no top-level page left out of a department) |
| Ops | `copy-database.test.ts`, `notion.test.ts` (import column mapping) |

## Workflow checks worth keeping

- A deal walks from a new lead to Accepted with a history row per move and the company moves to onboarding.
- A lead typed with a new name creates a prospect company; the same name again reuses it.
- A lead's value comes from its modules' prices unless a value is sent.
- A client with open deals cannot be deleted (archived); after the deals are closed it can.
- An issued invoice cannot be edited; cancelling needs a credit note; issuing twice does not burn two numbers.
- A lead can only be owned by an active team member of the organisation; sales nodes are unique by name and hide commission from non-managers; a commission payment needs an accepted deal of that node, never exceeds the commission due on the deal, and books (and on delete removes) its ledger expense in the same transaction; a lead's calls, meetings and forms must belong to its client.
- A follow-up on an open lead shows in the same due list as a logged next action, and disappears when the lead is closed or its date cleared.
- A new scope starts from the lead's modules; an event signup becomes one lead only.
- A FREELANCER, CLIENT or AGENCY sign-in sees only the records linked to it.

## Gaps

- Route-level 400/404/org-isolation tests exist only for companies and settings; other groups are tested at service level.
- No browser-level (end-to-end) tests. UI changes are checked by type checking, lint and by hand.
- The numbering concurrency test runs on PGlite, which serialises connections; a run against real Postgres is still worth doing.
