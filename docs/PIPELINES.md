# Pipelines and stage rules

Last checked against the code on 2026-11-18. There are two kinds of workflow in the app.

## 1. Real domain workflows (the ones that matter)

Each has its own tables, a service that enforces the allowed moves, and an audit entry on every change.

| Workflow | Stages | Rules live in |
|---|---|---|
| Deal (sales board) | `LEAD`, `CONTACTED`, `DIAGNOSED`, `PROPOSAL_SENT`, `NEGOTIATION`, `WON`, `LOST` | `src/server/models/deals.ts` (`canTransitionDeal`), `services/deals.ts` (`transitionDeal`) |
| Scope | `DRAFT`, `SENT`, `ACCEPTED`, `SUPERSEDED` | `services/scopes.ts`, `scope-sharing.ts` |
| Invoice | `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `CANCELLED`; overdue is a flag | `services/invoices.ts` |
| Work order | `DRAFT`, `ISSUED`, `COMPLETED`, `CANCELLED` | `services/work-orders.ts` |
| Delivery project, milestone, task | see `docs/ENTITY_DICTIONARY.md` | `services/delivery.ts`, `project-tasks.ts` |

### Deal stages

The stored keys never change. The board shows these labels, which follow the sales process (lead from a sales node, 1st meeting, optional 2nd meeting about the business and budget, strategy sent, awaiting the client's confirmation mail, accepted):

| Key | Label |
|---|---|
| `LEAD` | New lead |
| `CONTACTED` | 1st meeting |
| `DIAGNOSED` | 2nd meeting · budget |
| `PROPOSAL_SENT` | Strategy sent |
| `NEGOTIATION` | Awaiting confirmation |
| `WON` | Accepted |
| `LOST` | Lost |

Moves: from any open stage you may go to any other open stage, so the 2nd meeting can be skipped. Any open stage may go to `LOST` (a reason is required). `LOST` may reopen to `LEAD`. `WON` is reachable only from `PROPOSAL_SENT` or `NEGOTIATION`, and a won deal cannot move again. Moving to `WON` moves a `PROSPECT` company to `ONBOARDING`. A move is applied only if the deal is still in the stage the caller saw, so two people cannot both move it. Converting to a project needs the deal at `WON` and an accepted scope.

## 2. Generic boards (older)

`PipelineBoard` (`src/components/pipeline-board.tsx`) is a generic kanban backed by the `pipeline_items` table and the stage lists in `src/server/models/pipeline.ts`. It still drives `/app-dev` and `/outreach`. The module names it defines are `crm`, `projects`, `social`, `outreach`, `app-dev`, `freelancers`, `finance`, `events`, `docs`; the real pages for the CRM, projects, finance, events and docs no longer use it. Its `crm` stages (`LEAD`, `CONTACTED`, `FINALISED`, `PROJECT_ONGOING`, `RETAINED`, `LOST`) are not the deal stages above.

Endpoints (staff only):

- `GET /api/pipelines` and `GET /api/pipelines/[module]`: stage definitions.
- `GET`, `POST /api/pipelines/[module]/items`: list or create a card.
- `PATCH`, `DELETE /api/pipelines/[module]/items/[entityId]`: update or delete a card.
- `POST /api/pipelines/transition`: validate a move against the module's allowed transitions and write it to the activity log.

`/outreach` has a "Move to Sales" button that turns a card into a client, contact and lead deal (`services/legacy.ts`, `/api/legacy/*`). `/projects` offers to move old task cards onto a project's task board. These boards are due for retirement.
