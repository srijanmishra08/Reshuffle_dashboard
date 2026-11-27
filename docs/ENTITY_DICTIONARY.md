# Entity Dictionary

The real tables live in `src/server/db/schema/*` (one file per area). Money is integer paise, most tables carry `org_id`, and every table has row level security on. Last checked against the code on 2026-11-18.

## Tables by area

| Area | Tables |
|---|---|
| Identity | `user`, `session`, `account`, `verification` (Better Auth), `allowed_emails` (who may sign in, their role, and the company, freelancer or agency they are linked to), `org_settings`, `number_series` |
| CRM | `companies`, `contacts`, `interactions`, `meetings`, `attachments` |
| Sales | `deals`, `deal_stage_history`, `diagnoses`, `sales_nodes` (who brings leads), `deal_modules` (the modules a lead needs), `company_modules` (the modules a client is in), `modules_library` (the SKUs), `scopes`, `scope_items`, `scope_shares` and `scope_acceptances` (public accept link) |
| Billing | `invoices`, `invoice_items`, `payments`, `credit_notes`, `work_orders`, `work_order_items`, `letters` |
| Invoice software link | `ingest_keys` (upload keys, stored hashed), `uploaded_documents` (PDFs sent by the invoice software) |
| Delivery | `delivery_projects`, `project_milestones`, `project_tasks`, `task_comments`, `freelancers`, `freelancer_assignments`, `payouts`, `agencies`, `agency_freelancers` |
| People | `people` (PAN and bank encrypted), `salary_slips` |
| Finance | `expense_categories`, `ledger_entries`, `finance_plans` |
| Marketing and events | `social_accounts`, `content_items`, `events`, `event_team`, `event_registrations` |
| Knowledge | `docs`, `goals`, `questionnaires`, `questionnaire_responses` |
| Cross-cutting | `activity_logs` (audit trail, written by `logActivity`), `rate_limits`, `automation_rules` (table only; nothing evaluates it yet) |
| Legacy, still in the schema | `clients`, `projects`, `tasks`, `pipeline_items`, `social_entries` (the generic boards `/social` and `/app-dev` still use `pipeline_items`) |

## How the main records link

- A **sales node** is a sales staff member, freelancer, agency or individual who brings leads, with an optional commission rate (basis points of accepted deal value). A **commission payment** (`commission_payments`) records money paid to a node, optionally against one of its accepted deals, and books an EXPENSE ledger entry (source `COMMISSION`). A lead is credited to one; `source` and `referrer` on the deal keep its kind and name as text.
- A lead (**deal**) has an owner (`owner_id`, an active team member) and its own history: interactions and meetings carry `deal_id`, as do questionnaires and event registrations that created or relate to it.
- A client's modules (SKUs) are stored in `company_modules`. They are edited on the client page or set when adding the client in the CRM, and a lead that is added with modules adds them to its client too (they are never removed automatically, so a lost deal does not take them away). The CRM list, board and client page show them and the list filters by module. Verticals no longer exist (table and columns dropped in migration `0025`); modules are how a client's project is classified.
- A **company** (client) has contacts, interactions, meetings, deals, delivery projects, invoices, work orders and questionnaires.
- A **deal** belongs to one company. It has stage history, diagnosis answers, the modules it needs (`deal_modules`), and scope versions. A deal's `value_paise` starts as the sum of its modules' `default_price_paise` and can be overridden.
- An accepted scope plus a deal at Accepted (`WON`) converts to one **delivery project** with milestones taken from the payment schedule. Invoices and work orders link back to the project and scope.
- A payment or payout writes a **ledger entry** (`source` PAYMENT or PAYOUT; the unique source keeps it to one).

## Status values

| Name | Values |
|---|---|
| Roles | `ADMIN`, `MANAGER`, `MEMBER` (staff); `FREELANCER`, `CLIENT`, `AGENCY` (portals) |
| Deal stage | `LEAD`, `CONTACTED`, `DIAGNOSED`, `PROPOSAL_SENT`, `NEGOTIATION`, `WON`, `LOST` (board labels: New lead, 1st meeting, 2nd meeting · budget, Strategy sent, Awaiting confirmation, Accepted, Lost) |
| Lead source ("Found through") | Sales staff, Freelancer, Agency, Individual referral, Direct / other (free text is also accepted) |
| Quotation status | `NONE`, `DRAFTED`, `SENT`, `ACCEPTED`, `REJECTED` |
| Temperature | `COLD`, `WARM`, `HOT` |
| Company lifecycle | `PROSPECT`, `ONBOARDING`, `ACTIVE`, `MAINTENANCE`, `CLOSED` |
| Interaction type | `CALL`, `MEETING`, `WHATSAPP`, `EMAIL`, `NOTE`, `SITE_VISIT` |
| Scope | `DRAFT`, `SENT`, `ACCEPTED`, `SUPERSEDED` |
| Invoice | `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, `CANCELLED` (overdue is a flag, `overdue_at`, set by the daily cron) |
| Payment method | `BANK_TRANSFER`, `UPI`, `CASH`, `CHEQUE`, `CARD`, `OTHER` |
| Work order | `DRAFT`, `ISSUED`, `COMPLETED`, `CANCELLED` |
| Letter, salary slip | `DRAFT`, `ISSUED` |
| Delivery project | `PLANNED`, `ACTIVE`, `ON_HOLD`, `COMPLETED`, `CANCELLED` |
| Milestone | `PENDING`, `DONE`, `INVOICED` |
| Project task | `BACKLOG`, `TODO`, `IN_PROGRESS`, `CLIENT_REVIEW`, `REVISION`, `COMPLETED`, `INVOICED`; priority `NONE`, `LOW`, `MEDIUM`, `HIGH` |
| Task comment kind | `COMMENT`, `REVISION_REQUEST`, `APPROVAL` |
| Assignment, payout | assignment `ACTIVE`, `ENDED`; payout `PENDING`, `PAID`, `CANCELLED` |
| Ledger | kind `INCOME`, `EXPENSE`; source `MANUAL`, `PAYMENT`, `PAYOUT` |
| Person kind | `EMPLOYEE`, `INTERN`, `CONTRACTOR` |
| Goal | status `TODO`, `IN_PROGRESS`, `DONE`, `DROPPED`; priority `LOW`, `MEDIUM`, `HIGH` |
| Event | type `SPRINT`, `WORKSHOP`, `IDEATHON`, `BOOTCAMP`, `MEETUP`; status `PLANNED`, `CONFIRMED`, `EXECUTED`, `ARCHIVED` |
| Content item | `IDEA`, `DRAFT`, `SCHEDULED`, `PUBLISHED` |
| Doc type | `SOP`, `PLAYBOOK`, `DECISION`, `NOTE`, `RESOURCE` |
| Doc status | `DRAFT`, `IN_REVIEW`, `PUBLISHED`, `DEPRECATED` (a doc may also link to one client and one lead) |
| Questionnaire | `OPEN`, `CLOSED` |
| Uploaded document | `INVOICE`, `WORK_ORDER` |
| Diagnosis bucket | `REVENUE`, `MARKETING`, `OPERATIONS`, `CUSTOMER_EXPERIENCE`, `MANAGEMENT` (answers are recorded across 8 levels) |
