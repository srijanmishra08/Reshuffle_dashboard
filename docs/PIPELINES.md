# Pipeline Models

This document defines the canonical pipeline models implemented for all dashboard modules.

## Modules Covered

- `crm`
- `projects`
- `social`
- `outreach`
- `app-dev`
- `freelancers`
- `finance`
- `events`
- `docs`

## API Endpoints

- `GET /api/pipelines` returns all pipeline model definitions.
- `GET /api/pipelines/[module]` returns one module definition.
- `GET /api/pipelines/[module]/items` returns persisted pipeline cards for that module.
- `POST /api/pipelines/[module]/items` creates a new pipeline card.
- `PATCH /api/pipelines/[module]/items/[entityId]` updates title, subtitle, or stage.
- `DELETE /api/pipelines/[module]/items/[entityId]` deletes a pipeline card.
- `POST /api/pipelines/transition` validates a transition and writes to activity log.

## Transition Payload

```json
{
  "module": "crm",
  "from": "LEAD",
  "to": "CONTACTED",
  "entityType": "client",
  "entityId": "cl_123",
  "actorId": "user_123",
  "metadata": {
    "note": "First outreach done"
  }
}
```

## Notes

- Transition rules are currently enforced in the service layer.
- Successful transitions emit a `pipeline.transition.*` activity event.
- Successful transitions also persist stage updates in `PipelineItem` when database access is configured.
- This creates a consistent contract for UI boards, automations, and analytics.
