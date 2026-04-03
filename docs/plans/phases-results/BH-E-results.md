# Phase E: Recognition + Interventions — Results

## Summary

Phase E delivers the positive recognition system (points, awards, house teams, recognition wall) and the intervention/restriction system (intervention plans with reviews, guardian visibility restrictions). 30 endpoints across 3 controllers, 6 backend services, 2 worker jobs, 6 frontend pages, 5 shared Zod schemas, and an intervention state machine.

## Database

**No new tables or migrations.** All tables were created in Phase A. Phase E implements the business logic operating on:

- `behaviour_recognition_awards` — Milestone awards (append-only except superseded_by_id)
- `behaviour_award_types` — Configurable per-tenant with repeatability semantics
- `behaviour_house_teams` — Optional house/team system
- `behaviour_house_memberships` — Student-house assignment per academic year
- `behaviour_interventions` — Structured intervention plans with SEND awareness
- `behaviour_intervention_incidents` — Join table linking incidents to interventions
- `behaviour_intervention_reviews` — Periodic check-ins (append-only)
- `behaviour_publication_approvals` — Consent + approval gate for public display
- `behaviour_guardian_restrictions` — Guardian visibility restrictions with effective dates
- `behaviour_entity_history` — Audit trail for restrictions, publications, interventions
- `behaviour_tasks` — Auto-created tasks for intervention reviews and restriction reminders

## API Endpoints: 30 routes

### Recognition & Houses Controller (12 routes)

| Method | Route                                               | Permission                           |
| ------ | --------------------------------------------------- | ------------------------------------ |
| GET    | `v1/behaviour/recognition/wall`                     | `behaviour.view`                     |
| GET    | `v1/behaviour/recognition/leaderboard`              | `behaviour.view`                     |
| GET    | `v1/behaviour/recognition/houses`                   | `behaviour.view`                     |
| GET    | `v1/behaviour/recognition/houses/:id`               | `behaviour.view`                     |
| POST   | `v1/behaviour/recognition/awards`                   | `behaviour.manage`                   |
| GET    | `v1/behaviour/recognition/awards`                   | `behaviour.view`                     |
| POST   | `v1/behaviour/recognition/publications`             | `behaviour.manage`                   |
| GET    | `v1/behaviour/recognition/publications/:id`         | `behaviour.manage`                   |
| PATCH  | `v1/behaviour/recognition/publications/:id/approve` | `behaviour.admin`                    |
| PATCH  | `v1/behaviour/recognition/publications/:id/reject`  | `behaviour.admin`                    |
| GET    | `v1/behaviour/recognition/public/feed`              | `behaviour.view` (TODO: make public) |
| POST   | `v1/behaviour/recognition/houses/bulk-assign`       | `behaviour.admin`                    |

### Interventions Controller (12 routes)

| Method | Route                                          | Permission         |
| ------ | ---------------------------------------------- | ------------------ |
| POST   | `v1/behaviour/interventions`                   | `behaviour.manage` |
| GET    | `v1/behaviour/interventions`                   | `behaviour.manage` |
| GET    | `v1/behaviour/interventions/overdue`           | `behaviour.manage` |
| GET    | `v1/behaviour/interventions/my`                | `behaviour.manage` |
| GET    | `v1/behaviour/interventions/outcomes`          | `behaviour.manage` |
| GET    | `v1/behaviour/interventions/:id`               | `behaviour.manage` |
| PATCH  | `v1/behaviour/interventions/:id`               | `behaviour.manage` |
| PATCH  | `v1/behaviour/interventions/:id/status`        | `behaviour.manage` |
| POST   | `v1/behaviour/interventions/:id/reviews`       | `behaviour.manage` |
| GET    | `v1/behaviour/interventions/:id/reviews`       | `behaviour.manage` |
| GET    | `v1/behaviour/interventions/:id/auto-populate` | `behaviour.manage` |
| POST   | `v1/behaviour/interventions/:id/complete`      | `behaviour.manage` |

### Guardian Restrictions Controller (6 routes)

| Method | Route                                           | Permission        |
| ------ | ----------------------------------------------- | ----------------- |
| POST   | `v1/behaviour/guardian-restrictions`            | `behaviour.admin` |
| GET    | `v1/behaviour/guardian-restrictions`            | `behaviour.admin` |
| GET    | `v1/behaviour/guardian-restrictions/active`     | `behaviour.admin` |
| GET    | `v1/behaviour/guardian-restrictions/:id`        | `behaviour.admin` |
| PATCH  | `v1/behaviour/guardian-restrictions/:id`        | `behaviour.admin` |
| POST   | `v1/behaviour/guardian-restrictions/:id/revoke` | `behaviour.admin` |

## Services: 6

| Service                                | Responsibilities                                                            |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `BehaviourPointsService`               | Computed points with Redis caching (5min TTL), leaderboard, house standings |
| `BehaviourAwardService`                | Manual/auto award creation, repeat mode validation, tier supersession       |
| `BehaviourRecognitionService`          | Recognition wall, publication approvals with consent + admin gates          |
| `BehaviourHouseService`                | House CRUD, membership management, bulk assignment                          |
| `BehaviourInterventionsService`        | Intervention CRUD, state machine, reviews with auto-populated stats         |
| `BehaviourGuardianRestrictionsService` | Restrictions CRUD, active check, revocation, expiry, review reminders       |

## Frontend: 6 pages

| Route                           | Description                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `/behaviour/recognition`        | Recognition wall with 4 tabs: Wall, Leaderboard, Houses, Pending Approvals    |
| `/behaviour/interventions`      | Intervention list with 5 tabs: Active, Overdue, Monitoring, Completed, All    |
| `/behaviour/interventions/new`  | Multi-section create form with goals/strategies builders, SEND toggle         |
| `/behaviour/interventions/[id]` | Intervention detail with 5 tabs: Overview, Reviews, Tasks, Incidents, History |
| `/settings/behaviour-awards`    | Award type CRUD with repeat mode, tier config                                 |
| `/settings/behaviour-houses`    | House CRUD with membership management                                         |

## Background Jobs: 2

| Job                                    | Queue     | Description                                                                |
| -------------------------------------- | --------- | -------------------------------------------------------------------------- |
| `behaviour:check-awards`               | behaviour | Auto-award check on positive incidents. Dedup by triggered_by_incident_id. |
| `behaviour:guardian-restriction-check` | behaviour | Daily: expire ended restrictions, create review reminder tasks             |

## Configuration

### Shared Zod schemas added: 5

- `recognition.schema.ts` — Award types, manual awards, publications, wall query, leaderboard, house assignment
- `intervention.schema.ts` — Intervention CRUD, reviews, status transitions, outcome analytics
- `guardian-restriction.schema.ts` — Restriction CRUD, revocation, list query
- `house.schema.ts` — House CRUD
- `state-machine-intervention.ts` — Intervention lifecycle: planned -> active -> monitoring -> completed/abandoned

### Integration with Phase A

- `BehaviourService.createIncident()` now enqueues `behaviour:check-awards` for positive incidents
- `BehaviourModule` updated with all new services and controllers

## Files Created: ~25 new files

### Backend (9 files)

- `apps/api/src/modules/behaviour/behaviour-points.service.ts`
- `apps/api/src/modules/behaviour/behaviour-award.service.ts`
- `apps/api/src/modules/behaviour/behaviour-recognition.service.ts`
- `apps/api/src/modules/behaviour/behaviour-interventions.service.ts`
- `apps/api/src/modules/behaviour/behaviour-guardian-restrictions.service.ts`
- `apps/api/src/modules/behaviour/behaviour-house.service.ts`
- `apps/api/src/modules/behaviour/behaviour-recognition.controller.ts`
- `apps/api/src/modules/behaviour/behaviour-interventions.controller.ts`
- `apps/api/src/modules/behaviour/behaviour-guardian-restrictions.controller.ts`

### Shared (5 files)

- `packages/shared/src/behaviour/schemas/recognition.schema.ts`
- `packages/shared/src/behaviour/schemas/intervention.schema.ts`
- `packages/shared/src/behaviour/schemas/guardian-restriction.schema.ts`
- `packages/shared/src/behaviour/schemas/house.schema.ts`
- `packages/shared/src/behaviour/state-machine-intervention.ts`

### Frontend (6 files)

- `apps/web/src/app/[locale]/(school)/behaviour/recognition/page.tsx`
- `apps/web/src/app/[locale]/(school)/behaviour/interventions/page.tsx`
- `apps/web/src/app/[locale]/(school)/behaviour/interventions/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/behaviour/interventions/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/behaviour-awards/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/behaviour-houses/page.tsx`

### Worker (2 files)

- `apps/worker/src/processors/behaviour/check-awards.processor.ts`
- `apps/worker/src/processors/behaviour/guardian-restriction-check.processor.ts`

## Files Modified: 5

- `apps/api/src/modules/behaviour/behaviour.module.ts` — Added 6 services, 3 controllers
- `apps/api/src/modules/behaviour/behaviour.service.ts` — Added check-awards enqueue on positive incidents
- `apps/worker/src/worker.module.ts` — Registered 2 new processors
- `packages/shared/src/behaviour/schemas/index.ts` — Added 4 schema exports
- `packages/shared/src/behaviour/index.ts` — Added state-machine-intervention export

## Known Limitations

- Public recognition feed endpoint requires `behaviour.view` (no `@Public()` decorator available — needs a skip-auth mechanism)
- `attendance_rate_since_last` on intervention reviews always returns `null` (attendance module integration deferred)
- Translation files not yet updated with behaviour recognition/intervention keys
- Sidebar navigation not yet updated to include Recognition or Interventions links
- Cron scheduling for `behaviour:guardian-restriction-check` needs to be registered in CronSchedulerService

## Deviations from Plan

- None significant — all 30 endpoints, 6 services, 2 workers, 6 pages implemented as specified
