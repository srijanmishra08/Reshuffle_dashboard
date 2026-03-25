# Entity Dictionary

## Core Entities

- `User`: users and role-based access anchors
- `Client`: CRM source of truth
- `Project`: delivery container linked to a client
- `Task`: execution item inside project lifecycle
- `Freelancer`: contractor profile and capacity tracking
- `FreelancerProject`: many-to-many assignment table
- `Deal`: outreach and sales pipeline memory
- `Content`: social/content planning records
- `FinanceRecord`: revenue, expense, payout, subscription entries
- `Event`: event lifecycle records and outcomes
- `Document`: versioned knowledge linked to entities
- `Activity`: unified audit and activity stream
- `AutomationRule`: trigger and action definitions

## Shared Status Enums

- `PipelineStage`: `LEAD`, `CONTACTED`, `CONVERTED`, `RETAINED`
- `GenericStatus`: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`, `ACTIVE`, `ARCHIVED`
- `Priority`: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`
