# Phase E — Worker Jobs & Dashboard

**Wave**: 3
**Deploy Order**: d5
**Depends On**: B, C, D

## Scope

Implements all background job processors for the Regulatory Portal (deadline reminders, Tusla threshold scanning, DES file generation, PPOD sync, PPOD import), registers the REGULATORY queue and cron schedules, and builds the dashboard aggregation service that summarises compliance status across all regulatory domains. The dashboard service is included here because it requires all Wave 2 services (Tusla, DES, PPOD) to exist before it can meaningfully aggregate.

## Deliverables

### Worker Queue & Processors

- `apps/worker/src/base/queue.constants.ts` — **add** `REGULATORY: 'regulatory'` to `QUEUE_NAMES`
- `apps/worker/src/processors/regulatory/deadline-check.processor.ts` — daily 07:00 cron, iterates tenants, checks approaching deadlines, enqueues notification jobs
- `apps/worker/src/processors/regulatory/tusla-threshold-scan.processor.ts` — daily 06:00 cron, iterates tenants, scans cumulative absence counts, creates `AttendancePatternAlert` records
- `apps/worker/src/processors/regulatory/des-returns-generate.processor.ts` — on-demand, runs full DES pipeline via `RegulatoryDesService`
- `apps/worker/src/processors/regulatory/ppod-sync.processor.ts` — on-demand, runs push export via `RegulatoryPpodService`
- `apps/worker/src/processors/regulatory/ppod-import.processor.ts` — on-demand, runs pull import via `RegulatoryPpodService`
- `apps/worker/src/cron/cron-scheduler.service.ts` — **add** 2 cron registrations (deadline-check at 07:00, tusla-threshold-scan at 06:00)

### Dashboard Service

- `apps/api/src/modules/regulatory/regulatory-dashboard.service.ts` — aggregate compliance status across all domains (calendar deadlines, Tusla metrics, DES readiness, PPOD sync status, October Returns readiness, CBA sync status)
- `apps/api/src/modules/regulatory/regulatory-dashboard.service.spec.ts`

### Controller Endpoints

- `apps/api/src/modules/regulatory/regulatory.controller.ts` — **add** Dashboard endpoint group:
  - `GET /v1/regulatory/dashboard`
  - `GET /v1/regulatory/dashboard/overdue`
- `apps/api/src/modules/regulatory/regulatory.controller.spec.ts` — **add** dashboard test cases

### Architecture Docs

- `architecture/event-job-catalog.md` — **update** with full details for all 5 regulatory jobs (names, queues, triggers, cron patterns, payloads)

## Out of Scope

- The services that processors delegate to (Tusla, DES, PPOD) — already built in Phases B, C, D
- Frontend dashboard page (Phase F)
- Frontend Tusla/DES/PPOD pages (Phases G, H)

## Dependencies

**Phase B** provides:

- `RegulatoryTuslaService` — used by `tusla-threshold-scan.processor.ts` for threshold queries and by the dashboard service for Tusla metric aggregation

**Phase C** provides:

- `RegulatoryDesService` — used by `des-returns-generate.processor.ts` for background file generation and by the dashboard service for DES readiness status
- `RegulatoryOctoberReturnsService` — used by the dashboard service for October Returns readiness

**Phase D** provides:

- `RegulatoryPpodService` — used by `ppod-sync.processor.ts` and `ppod-import.processor.ts` for background sync operations, and by the dashboard service for sync status
- `RegulatoryCbaService` — used by the dashboard service for CBA sync status

## Implementation Notes

- **Processor pattern**: Each processor extends `WorkerHost`, uses `@Inject('PRISMA_CLIENT')` for raw Prisma access, and delegates to a `TenantAwareJob` subclass. Guard clause on job name.
- **Cron jobs**: `deadline-check` and `tusla-threshold-scan` are cross-tenant — empty payload, processor iterates all tenants. On-demand jobs (`des-returns-generate`, `ppod-sync`, `ppod-import`) include `tenant_id` in payload.
- **Cron registration**: `jobId: 'cron:${JOB_CONSTANT}'` for BullMQ deduplication, `removeOnComplete: 10`, `removeOnFail: 50`.
- **Deadline checker**: Queries `regulatory_calendar_events` where `due_date - today` matches any value in the event's `reminder_days` array. Enqueues notification jobs via `QUEUE_NAMES.NOTIFICATIONS`.
- **Tusla threshold scan**: Extends the existing `excessive_absences` alert type — uses `AttendancePatternAlert` with Tusla-specific context in `details_json`. No new enum needed.
- **Dashboard aggregation**: Joins calendar events (upcoming deadlines), regulatory submissions (recent), live attendance counts for Tusla, PPOD sync status counts, October Returns readiness, CBA sync status. Returns a typed `DashboardSummary` object.
- The `REGULATORY` queue must be registered in the worker's BullMQ module configuration.
