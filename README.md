# ReShuffle OS

The operating system for Reshuffle OPC: CRM, sales, scopes, documents, invoices, projects, freelancers, finance, marketing, events and docs in one logged-in app, with separate portals for clients, partner agencies and freelancers.

Where to read next: `handoff.md` (current state, run steps, conventions, session log), `plan.md` (what and why), `development-plan.md` (build order and what is done), `docs/` (entities, pipelines, integrations, metrics, tests).

## What is in it

The side menu is split into departments (`src/lib/navigation.ts`):

| Department | Pages |
|---|---|
| Sales | Sales board (`/sales`), deal page with diagnosis and scopes (`/sales/[id]`), Scope Maker, Client outreach (every open lead sorted by follow-up date), Module library (`/settings/modules`) |
| CRM | Clients (`/crm`, `/crm/[id]`; each client shows, edits and filters by the modules it is in), Client projects, Questionnaires |
| Finance | Finance (ledger, receivables, monthly, GST, plan), Invoices (with the PDFs from the invoice software), Work orders |
| Marketing | Marketing, Social media, Events |
| Delivery | Projects (milestones and task boards), App development, Freelancers (assignments, payouts) |
| People & Admin | People and salary slips, Letters, Goals, Documentation, Access, Settings |

Outside people sign in to their own portal: clients at `/portal`, freelancers at `/me`, partner agencies at `/agency`. Clients can also open a shared scope or questionnaire through a public link (`/p/[token]`, `/p/form/[token]`).

### The sales process on the board

Stored stage keys are unchanged; the labels follow how Reshuffle sells:

| Step | Board column | Key |
|---|---|---|
| Lead found by a sales node (sales staff, freelancer, agency or individual referral) | New lead | `LEAD` |
| 1st meeting with the founder or consultant | 1st meeting | `CONTACTED` |
| 2nd meeting: understand the business, discuss budget (optional) | 2nd meeting · budget | `DIAGNOSED` |
| Initial research, strategy, budget and research summary sent | Strategy sent | `PROPOSAL_SENT` |
| Waiting for the client's confirmation mail | Awaiting confirmation | `NEGOTIATION` |
| Client accepts; project starts ("Convert to project") | Accepted | `WON` |
| Dropped (reason required) | Lost | `LOST` |

Anyone on staff can add a lead by typing a new name; the company is created as a prospect, or reused when the name already exists. The lead records which sales node found it, who referred it, and which library modules the client needs. Modules are SKUs: a lead's value fills in from the sum of the chosen modules' library prices (you can still type a different value, for example after negotiating), and the modules show on the board card and the deal page. The client page shows the modules the client is in; they can be edited there, and a lead's modules are added to its client.

## Stack

- Next.js 16 (App Router, `src/proxy.ts`), React 19, Tailwind
- Supabase Postgres through Drizzle ORM (server-side only; row level security is on for every table with no policies)
- Supabase Storage for private files (uploaded PDFs, signature), server-side only
- Better Auth (Google sign-in, email allowlist). Roles: ADMIN, MANAGER, MEMBER (staff); FREELANCER, CLIENT, AGENCY (portals)
- Zod validation, service layer returning `{ ok, data } | { ok: false, error, code }`
- `@react-pdf/renderer` for every generated PDF (Noto Sans, so the rupee sign prints)
- Vitest (tests run on in-memory Postgres via PGlite)

## Run locally

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL, DIRECT_URL, BETTER_AUTH_*, GOOGLE_*
npm run db:migrate        # applies ./drizzle migrations using DIRECT_URL
npm run dev               # http://localhost:3000
```

Use a separate Supabase project for local work, never production. Checks: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`. Tests need no database.

## Database and migrations

- `DATABASE_URL`: Supabase transaction pooler (port 6543). Used at runtime. Prepared statements are off.
- `DIRECT_URL`: Supabase session pooler (port 5432). Used for migrations only.
- Schema lives in `src/server/db/schema/*`. Change it, run `npm run db:generate`, review the SQL in `drizzle/`, commit. New tables must call `.enableRLS()`.
- **Production migrates itself.** Vercel runs `npm run vercel-build` (`tsx scripts/migrate.ts --on-deploy && next build`). On a production deploy it applies any new files in `drizzle/` using `DIRECT_URL`, then builds. Branch previews skip it, so they never touch the real database. If a migration fails the build fails and the previous deployment stays live. `DIRECT_URL` must be set in the Vercel project's Production environment, or production deploys fail with "DIRECT_URL is required".
- Locally, `npm run db:migrate` does the same thing by hand.

## Deployment

Vercel deploys from `main` (region `bom1`; the database is in Mumbai, `ap-south-1`). Production environment variables:

| Variable | Used for |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | runtime queries; migrations on deploy |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | sign-in (the app refuses to start in production without them) |
| `BOOTSTRAP_ADMIN_EMAILS` | emails that become ADMIN on first sign-in |
| `APP_ENCRYPTION_KEY` | encrypts PAN and bank fields at rest |
| `CRON_SECRET` | protects `/api/cron/*` (daily overdue-invoice job in `vercel.json`) |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | private file storage |
| `INGEST_ALLOWED_ORIGINS` | optional; sites allowed to upload PDFs from a browser (defaults to the invoice software) |

CI (`.github/workflows/ci.yml`) runs lint, `tsc`, tests and build on every pull request and on `main`.
