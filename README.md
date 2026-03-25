# ReShuffle Dashboard

ReShuffle Dashboard is a full-stack Business Operating System scaffold built with a modular architecture.

## Stack

- Frontend: Next.js (App Router) + TailwindCSS
- API: Next.js Route Handlers + tRPC endpoint scaffold
- ORM / DB: Prisma + PostgreSQL
- Queue and workers: BullMQ + Redis
- Validation: Zod

## Modules Included

1. Client CRM
2. Project Management Dashboard
3. Social Media Planning and Calendar
4. Client Outreach Tracker
5. App Development Cycle
6. Freelancers Status Board
7. Finance Sheet
8. Event Dashboard
9. Documentation System

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Copy environment file:

```bash
cp .env.example .env
```

3. Generate Prisma client:

```bash
npm run prisma:generate
```

4. Run database migrations:

```bash
npm run prisma:migrate
```

5. Start web app:

```bash
npm run dev
```

6. Start automation worker (separate terminal):

```bash
npm run worker:automation
```

## API Endpoints (Initial)

- `GET /api/health`
- `GET|POST /api/clients`
- `GET|POST /api/projects`
- `GET|POST /api/tasks`
- `GET /api/activity?limit=20`
- `POST /api/automation/trigger`
- `GET|POST /api/trpc/[trpc]`

## Important Paths

- Prisma schema: `prisma/schema.prisma`
- Module pages: `src/app/*/page.tsx`
- REST APIs: `src/app/api/*`
- Business services: `src/server/services/*`
- Worker: `src/workers/automation-worker.ts`
- Architecture docs: `docs/*`

## Deployment Targets

- App: Vercel
- PostgreSQL: Supabase or Neon
- Redis: Upstash

## Next Build Steps

1. Add authentication and role guards for Admin, Manager, Freelancer.
2. Replace mock module panels with live data queries and mutation forms.
3. Add queue processors for WhatsApp, email, and social integrations.
4. Add notification center and global search.
