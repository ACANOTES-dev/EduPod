# Phase C — Worker Jobs & Background Processing

**Wave**: 2
**Deploy Order**: d3
**Depends On**: A

## Scope

Implements all BullMQ job processors for the homework module — overdue detection, recurring homework generation, parent digest integration, and completion reminders. Also adds search indexing for homework assignments. This phase runs independently of Phase B (both depend only on Phase A) but deploys after B by convention.

## Deliverables

### Processors (`apps/worker/src/processors/homework/`)

#### Overdue Detection
- [ ] `overdue-detection.processor.ts`
  - Job name: `homework:overdue-detection`
  - Cron: daily 06:00 UTC (cross-tenant)
  - Logic: for each active tenant with homework enabled, find `published` assignments where `due_date < today` and students with `not_started` or `in_progress` completion status. Send overdue notifications to parents (in-app + preferred channels).
  - Idempotency: skip students already notified for this assignment (check notification existence)
  - Payload: `{}` (cross-tenant, iterates all tenants)

#### Recurring Homework Generation
- [ ] `generate-recurring.processor.ts`
  - Job name: `homework:generate-recurring`
  - Cron: daily 05:00 UTC (cross-tenant)
  - Logic: for each active tenant, find `HomeworkRecurrenceRule` records where `active = true` and `start_date <= today` and (`end_date IS NULL OR end_date >= today`). For each rule's `days_of_week` matching today's weekday, check if an assignment already exists for today (idempotent). If not, create a new `draft` assignment from the rule's template data.
  - Respects `school_closures` — no homework created on closure dates
  - Payload: `{}` (cross-tenant)

#### Digest Integration
- [ ] `digest-homework.processor.ts`
  - Job name: `homework:digest-homework`
  - Trigger: enqueued by `behaviour:cron-dispatch-daily` at tenant digest time (extends existing daily dispatch)
  - Logic: for each parent in the tenant, gather today's published homework for their linked students. Format as digest entries. Enqueue `communications:dispatch-notifications` for each parent.
  - Skips if `parent_digest_include_homework` setting is false
  - Payload: `{ tenant_id }`

#### Completion Reminder
- [ ] `completion-reminder.processor.ts`
  - Job name: `homework:completion-reminder`
  - Trigger: enqueued by `behaviour:cron-dispatch-daily` at 15:00 tenant timezone
  - Logic: find published assignments with `due_date = tomorrow` and students with `not_started` or `in_progress` status. Send reminder notifications to parents.
  - Skips if `completion_reminder_enabled` setting is false
  - Payload: `{ tenant_id }`

### Cron Registration
- [ ] Add `homework:overdue-detection` to `CronSchedulerService.onModuleInit()` — daily 06:00 UTC repeatable
- [ ] Add `homework:generate-recurring` to `CronSchedulerService.onModuleInit()` — daily 05:00 UTC repeatable
- [ ] Extend `cron-dispatch.processor.ts` to dispatch:
  - `homework:digest-homework` at tenant digest time
  - `homework:completion-reminder` at 15:00 tenant timezone

### Search Integration
- [ ] Add `homework_assignments` to Meilisearch search indexing
  - Index fields: `title`, `description`, `homework_type`, class name, subject name, teacher name
  - Only index `published` assignments
  - Trigger: enqueue `search:index-entity` on create/update/archive

### Worker Module Registration
- [ ] Register all 4 processors in `apps/worker/src/worker.module.ts`

### Tests
- [ ] `overdue-detection.processor.spec.ts`
- [ ] `generate-recurring.processor.spec.ts`
- [ ] `digest-homework.processor.spec.ts`
- [ ] `completion-reminder.processor.spec.ts`

## Out of Scope

- API endpoints (Phase B)
- Frontend pages (Phase D, E, F)
- Dashboard integration (Phase D)
- Analytics queries (Phase B)

## Dependencies

- **Phase A**: All Prisma models (to query homework tables), queue constants (`HOMEWORK_QUEUE`), tenant settings schema (to check `enabled`, `completion_reminder_enabled`, etc.)

## Implementation Notes

- **Cross-tenant processors** (`overdue-detection`, `generate-recurring`) follow the pattern from `gradebook:detect-risks` — iterate all active tenants with homework enabled. Each tenant is processed independently; one tenant's failure doesn't block others.
- **Per-tenant processors** (`digest-homework`, `completion-reminder`) follow the `behaviour:digest-notifications` pattern — dispatched by the daily cron dispatcher with `{ tenant_id }` payload.
- **TenantAwareJob base class**: all 4 processors create a `TenantAwareJob` subclass that sets RLS context before DB operations.
- **Cron-dispatch extension**: the existing `cron-dispatch.processor.ts` already dispatches behaviour jobs per tenant timezone. Adding homework dispatch is a few lines — matching the pattern for digest at configurable time and reminders at 15:00.
- **School closures**: `generate-recurring` must check `school_closures` table for the target date. The `SchoolClosure` model already exists and is used by `suspension-return.processor.ts` — follow the same pattern.
- **Notification channels**: use the existing `communications:dispatch-notifications` job for actual delivery. Homework processors only create notification rows and enqueue dispatch — they don't send directly.
- **Search indexing**: follows the existing `search:index-entity` pattern. Only published assignments are indexed. Archiving removes from index.
- **Job naming**: `homework:overdue-detection`, `homework:generate-recurring`, `homework:digest-homework`, `homework:completion-reminder` — follows `module:action-description` convention.
- **Dedup jobIds**: cross-tenant crons use `cron:homework-overdue-detection` and `cron:homework-generate-recurring` for BullMQ dedup. Per-tenant jobs use `daily:homework-digest:{tenant_id}` and `daily:homework-reminder:{tenant_id}`.
