# Phase C: Sanctions + Exclusions + Appeals — Results

## Summary

Phase C delivers the full sanction lifecycle (12 states, 14 endpoints), exclusion case auto-creation from high-stakes sanctions with statutory timeline tracking, the appeal system with decision auto-application (cascading to sanctions/incidents/exclusion cases), the amendment workflow for post-notification corrections, and a daily suspension-return worker job. 38 API endpoints across 4 controllers, 4 backend services, 1 worker job, 7 frontend pages.

## Database

### Schema Changes

- Added `superseded` to `SanctionStatus` Prisma enum (reschedule terminal state)
- Added 11 new indexes across 4 existing tables:
  - `behaviour_sanctions`: date+status, supervisor+date, type+status, partial suspension_end_date
  - `behaviour_appeals`: incident_id, sanction_id (partial), submitted_at
  - `behaviour_exclusion_cases`: status+appeal_deadline, appeal_deadline (partial)
  - `behaviour_amendment_notices`: correction_notification_sent (partial for pending queue)

### Tables Used (from Phase A)

- `behaviour_sanctions` (30 columns) — full lifecycle implemented
- `behaviour_exclusion_cases` (26 columns) — full lifecycle implemented
- `behaviour_appeals` (24 columns) — full lifecycle implemented
- `behaviour_amendment_notices` (15 columns, append-only) — full workflow implemented

## API Endpoints: 38 routes

### Sanctions Controller (14 routes)

| Method | Path                                        | Permission         |
| ------ | ------------------------------------------- | ------------------ |
| POST   | `v1/behaviour/sanctions`                    | `behaviour.manage` |
| GET    | `v1/behaviour/sanctions`                    | `behaviour.manage` |
| GET    | `v1/behaviour/sanctions/today`              | `behaviour.manage` |
| GET    | `v1/behaviour/sanctions/my-supervision`     | `behaviour.view`   |
| GET    | `v1/behaviour/sanctions/calendar`           | `behaviour.manage` |
| GET    | `v1/behaviour/sanctions/active-suspensions` | `behaviour.manage` |
| GET    | `v1/behaviour/sanctions/returning-soon`     | `behaviour.manage` |
| POST   | `v1/behaviour/sanctions/bulk-mark-served`   | `behaviour.manage` |
| GET    | `v1/behaviour/sanctions/:id`                | `behaviour.manage` |
| PATCH  | `v1/behaviour/sanctions/:id`                | `behaviour.manage` |
| PATCH  | `v1/behaviour/sanctions/:id/status`         | `behaviour.manage` |
| POST   | `v1/behaviour/sanctions/:id/parent-meeting` | `behaviour.manage` |
| POST   | `v1/behaviour/sanctions/:id/appeal`         | `behaviour.manage` |
| PATCH  | `v1/behaviour/sanctions/:id/appeal-outcome` | `behaviour.manage` |

### Appeals Controller (10 routes)

| Method | Path                                                | Permission         |
| ------ | --------------------------------------------------- | ------------------ |
| POST   | `v1/behaviour/appeals`                              | `behaviour.manage` |
| GET    | `v1/behaviour/appeals`                              | `behaviour.manage` |
| GET    | `v1/behaviour/appeals/:id`                          | `behaviour.manage` |
| PATCH  | `v1/behaviour/appeals/:id`                          | `behaviour.manage` |
| POST   | `v1/behaviour/appeals/:id/decide`                   | `behaviour.manage` |
| POST   | `v1/behaviour/appeals/:id/withdraw`                 | `behaviour.manage` |
| POST   | `v1/behaviour/appeals/:id/attachments`              | `behaviour.manage` |
| GET    | `v1/behaviour/appeals/:id/attachments`              | `behaviour.manage` |
| POST   | `v1/behaviour/appeals/:id/generate-decision-letter` | `behaviour.manage` |
| GET    | `v1/behaviour/appeals/:id/evidence-bundle`          | `behaviour.manage` |

### Exclusion Cases Controller (10 routes)

| Method | Path                                                   | Permission         |
| ------ | ------------------------------------------------------ | ------------------ |
| POST   | `v1/behaviour/exclusion-cases`                         | `behaviour.manage` |
| GET    | `v1/behaviour/exclusion-cases`                         | `behaviour.manage` |
| GET    | `v1/behaviour/exclusion-cases/:id`                     | `behaviour.manage` |
| PATCH  | `v1/behaviour/exclusion-cases/:id`                     | `behaviour.manage` |
| PATCH  | `v1/behaviour/exclusion-cases/:id/status`              | `behaviour.manage` |
| POST   | `v1/behaviour/exclusion-cases/:id/generate-notice`     | `behaviour.manage` |
| POST   | `v1/behaviour/exclusion-cases/:id/generate-board-pack` | `behaviour.manage` |
| POST   | `v1/behaviour/exclusion-cases/:id/record-decision`     | `behaviour.manage` |
| GET    | `v1/behaviour/exclusion-cases/:id/timeline`            | `behaviour.manage` |
| GET    | `v1/behaviour/exclusion-cases/:id/documents`           | `behaviour.manage` |

### Amendments Controller (4 routes)

| Method | Path                                          | Permission         |
| ------ | --------------------------------------------- | ------------------ |
| GET    | `v1/behaviour/amendments`                     | `behaviour.manage` |
| GET    | `v1/behaviour/amendments/pending`             | `behaviour.manage` |
| GET    | `v1/behaviour/amendments/:id`                 | `behaviour.manage` |
| POST   | `v1/behaviour/amendments/:id/send-correction` | `behaviour.manage` |

## Services: 4

| Service                          | Responsibilities                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `BehaviourSanctionsService`      | Sanction CRUD, state machine, conflict check, suspension days, bulk mark, exclusion auto-creation, amendment detection |
| `BehaviourExclusionCasesService` | Exclusion case CRUD, statutory timeline, legal holds, decision recording, appeal deadline computation                  |
| `BehaviourAppealsService`        | Appeal submission, decision with cascading outcomes, withdrawal, legal holds                                           |
| `BehaviourAmendmentsService`     | Amendment notice creation, correction dispatch, pending queue                                                          |

## Frontend: 7 pages

| Route                        | Description                                                     |
| ---------------------------- | --------------------------------------------------------------- |
| `/behaviour/sanctions`       | Sanction list with filters, calendar toggle, inline mark-served |
| `/behaviour/sanctions/today` | Today's detentions supervisor screen with bulk operations       |
| `/behaviour/appeals`         | Appeal management list with status tabs                         |
| `/behaviour/appeals/[id]`    | Appeal detail with decision form, evidence, timeline            |
| `/behaviour/exclusions`      | Exclusion case list with compliance indicators                  |
| `/behaviour/exclusions/[id]` | Exclusion case detail with statutory timeline checklist         |
| `/behaviour/amendments`      | Amendment work queue with pending/all tabs                      |

## Background Jobs: 1

| Job                           | Queue     | Trigger                        |
| ----------------------------- | --------- | ------------------------------ |
| `behaviour:suspension-return` | behaviour | Daily cron at 07:00 per tenant |

## Files Created: ~30

### packages/shared/src/behaviour/ (7 files)

- `state-machine-sanction.ts`, `state-machine-exclusion.ts`, `state-machine-appeal.ts`
- `schemas/sanction.schema.ts`, `schemas/appeal.schema.ts`, `schemas/exclusion.schema.ts`, `schemas/amendment.schema.ts`

### apps/api/src/modules/behaviour/ (8 files)

- `behaviour-sanctions.service.ts`, `behaviour-sanctions.controller.ts`
- `behaviour-exclusion-cases.service.ts`, `behaviour-exclusions.controller.ts`
- `behaviour-appeals.service.ts`, `behaviour-appeals.controller.ts`
- `behaviour-amendments.service.ts`, `behaviour-amendments.controller.ts`

### apps/worker/src/processors/behaviour/ (1 file)

- `suspension-return.processor.ts`

### apps/web/ (7 pages)

- `sanctions/page.tsx`, `sanctions/today/page.tsx`
- `appeals/page.tsx`, `appeals/[id]/page.tsx`
- `exclusions/page.tsx`, `exclusions/[id]/page.tsx`
- `amendments/page.tsx`

### packages/prisma/migrations/ (1 file)

- `20260326220000_phase_c_sanctions_indexes/migration.sql`

## Files Modified: 8

- `packages/prisma/schema.prisma` — Added `superseded` to SanctionStatus + 7 indexes
- `packages/shared/src/behaviour/index.ts` — Added state machine exports
- `packages/shared/src/behaviour/schemas/index.ts` — Added schema exports
- `apps/api/src/modules/behaviour/behaviour.module.ts` — Registered 4 services + 4 controllers
- `apps/worker/src/worker.module.ts` — Registered suspension-return processor
- `architecture/module-blast-radius.md` — Updated BehaviourModule exports and blast radius
- `architecture/event-job-catalog.md` — Added suspension-return job
- `architecture/state-machines.md` — Added sanction, exclusion, appeal state machines

## Known Limitations

- Document generation endpoints (generate-notice, generate-board-pack, generate-decision-letter) return `not_implemented` — requires Puppeteer integration (Phase G)
- Evidence bundle export returns `not_implemented` — Phase G
- Attachment upload/download for appeals returns stubs — Phase G
- `notify_roles`/`notify_users` actions from policy engine record success but don't dispatch actual notifications — Phase G
- Attendance integration for suspension marking (`markSuspensionAbsence`) is called but AttendanceService method doesn't exist yet — requires attendance module integration
- Sanctions created by policy engine don't have sequence numbers yet (Phase B known limitation)
- Translation files not yet created (hardcoded English)
- Sidebar nav not yet updated with sanctions/appeals/exclusions links

## Deviations from Plan

- No deviations from the Phase C plan
