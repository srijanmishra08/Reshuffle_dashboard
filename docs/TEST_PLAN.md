# Test Plan

## API and Data

- Validate all create/list endpoints for clients, projects, tasks
- Validate activity feed writes on mutating operations
- Validate automation trigger enqueues expected jobs

## Workflow Integrity

- CRM lead conversion updates linked modules
- Project task assignment reflects freelancer capacity
- Finance records tie back to client/project/freelancer links
- Event and content records remain queryable by client and project

## Reliability

- Queue worker retry path for transient errors
- Invalid payload and validation error handling
- Database migration and seed health checks
