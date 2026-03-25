# ReShuffle OS Architecture

## Layered Design

1. Frontend: Next.js App Router + Tailwind UI shell
2. API Layer: REST endpoints in `src/app/api/*` and extensible tRPC endpoint in `src/app/api/trpc/[trpc]/route.ts`
3. Business Logic: services in `src/server/services/*`
4. Data Layer: PostgreSQL via Prisma (`prisma/schema.prisma`)
5. Async Layer: BullMQ queue + worker (`src/workers/automation-worker.ts`)
6. Integrations: placeholders for WhatsApp, email, social APIs, accounting tools

## Core Cross-Cutting Features

- Unified activity feed via `Activity` model and log service
- Automation engine via `AutomationRule` + queue triggers
- Role model in `User.role`: `ADMIN`, `MANAGER`, `FREELANCER`
- Shared entity linking across CRM, Projects, Social, Outreach, Finance, Events, Docs
