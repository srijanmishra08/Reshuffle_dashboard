# Integrations Roadmap

## Priority Order

1. Email provider integration (follow-ups, reminders)
2. WhatsApp API integration for outreach notifications
3. Social publishing and analytics APIs
4. Accounting sync (Tally or equivalent)
5. Calendar sync for events and follow-ups
6. Dev lifecycle integrations (issue tracker and deployment events)

## Reliability Requirements

- Idempotent sync operations with external IDs
- Retry with exponential backoff for failed jobs
- Dead-letter strategy for repeated failures
- Activity log entries for each sync action
