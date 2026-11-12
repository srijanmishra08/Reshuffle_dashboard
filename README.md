# ReShuffle OS

The operating system for Reshuffle OPC: CRM, sales, scopes, documents, invoices, projects, freelancers, finance, marketing, events and docs in one logged-in app. See `plan.md` (what and why), `development-plan.md` (build order) and `handoff.md` (current state, run steps, conventions, and the work queue for automated runs).

## Stack

- Next.js 16 (App Router, `src/proxy.ts`), React 19, Tailwind
- Supabase Postgres through Drizzle ORM (server-side only; row level security is on for every table with no policies)
- Better Auth (Google sign-in, email allowlist, roles ADMIN / MANAGER / MEMBER / FREELANCER)
- Zod validation, service layer returning `{ ok, data } | { ok: false, error, code }`
- Vitest (tests run on in-memory Postgres via PGlite)

## Run locally

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL, DIRECT_URL, BETTER_AUTH_*, GOOGLE_*
npm run db:migrate        # applies ./drizzle migrations using DIRECT_URL
npm run dev               # http://localhost:3000
```

Checks: `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`.

## Database

- `DATABASE_URL`: Supabase transaction pooler (port 6543). Used at runtime. Prepared statements are off.
- `DIRECT_URL`: Supabase session pooler (port 5432). Used only by `npm run db:migrate` and `drizzle-kit`.
- Schema lives in `src/server/db/schema/*`. Change it, run `npm run db:generate`, review the SQL in `drizzle/`, commit. New tables must call `.enableRLS()`.

## Deployment

Vercel deploys from `main`. Production env vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BOOTSTRAP_ADMIN_EMAILS`. Apply new migrations (`npm run db:migrate` with `DIRECT_URL`) before a deploy that adds files under `drizzle/`.
