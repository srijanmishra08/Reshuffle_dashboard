# Founder Metrics

Last checked against the code on 2026-11-18. The Overview (`/`, `services/overview.ts`) shows real numbers, scoped to the organisation. Every staff sign-in (admin, manager, member) can open it, receivables and cash included; portal roles cannot.

## What the Overview shows

| Group | Numbers |
|---|---|
| Pipeline | open deals and their value, deals accepted this month (count and value), win rate (accepted of closed), count and value per stage |
| Receivables | total outstanding on open invoices, and how much of it is overdue (amount and number of invoices) |
| Clients | active clients |
| Projects | active and planned, on hold, at risk (late milestones), tasks overdue, tasks in client review |
| Cash | income and expense from the ledger |
| Follow-ups and meetings | due follow-ups, upcoming meetings |
| Activity | latest entries from the audit log |

The Finance page adds receivables aging, a monthly view, the GST summary and a B2B CSV. The notification bell lists overdue invoices, overdue tasks and work waiting on the client.

## Data rules

- Every number is computed from primary records (deals, invoices, payments, ledger entries, tasks), never stored separately.
- Accepted deals are counted from stage history, so moving a deal around does not double count.
- Money is integer paise, shown in rupees with Indian grouping.
- Every change to a record writes an `activity_logs` entry through `logActivity`.
- The demo organisation used by the portal preview is excluded from every figure.

## Not tracked yet

- Conversion rate between individual stages (the history to compute it is stored in `deal_stage_history`).
- Freelancer utilisation and overload flags.
- Event revenue against expectation.
- Content output by platform and status as a KPI (the content calendar exists).
