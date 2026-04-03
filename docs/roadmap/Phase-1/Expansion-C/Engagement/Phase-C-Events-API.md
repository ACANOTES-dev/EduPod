# Phase C — Events API

**Wave**: 2
**Deploy Order**: d3
**Depends On**: A

## Scope

The complete backend for the Events & Scheduling engine: event CRUD with polymorphic type handling, full lifecycle state machine, participant management, staff assignment, event dashboard (completion rates), parent event endpoints, and four BullMQ jobs (invoice generation, chase-up, deadline expiry, event cancellation). This phase makes the event entity operational — events can be created, published, opened (triggering form distribution from Phase B's job), tracked, and closed.

## Deliverables

### Services

- `apps/api/src/modules/engagement/events.service.ts` — Event CRUD (create, list, getById, update, delete-draft-only). Lifecycle transitions enforcing `EVENT_VALID_TRANSITIONS` with type-specific rules (policy_signoff skips in_progress; trips blocked if risk assessment not approved). Side effects on transition (enqueue jobs). Dashboard query (consent %, payment %, registration count). Staff assignment (add, remove, list).
- `apps/api/src/modules/engagement/events.service.spec.ts`
- `apps/api/src/modules/engagement/event-participants.service.ts` — Resolve target students from `target_type` + `target_config_json` (whole_school, year_group, class_group, custom). Create participant records on event open. Update participant status on consent/payment changes. Capacity enforcement. Withdraw logic. Bulk "remind outstanding" (enqueues notifications for all pending participants).
- `apps/api/src/modules/engagement/event-participants.service.spec.ts`

### Controllers

- `apps/api/src/modules/engagement/events.controller.ts` — Admin endpoints:
  - `POST   /v1/engagement/events`
  - `GET    /v1/engagement/events`
  - `GET    /v1/engagement/events/:id`
  - `PATCH  /v1/engagement/events/:id`
  - `DELETE /v1/engagement/events/:id`
  - `POST   /v1/engagement/events/:id/publish`
  - `POST   /v1/engagement/events/:id/open`
  - `POST   /v1/engagement/events/:id/close`
  - `POST   /v1/engagement/events/:id/cancel`
  - `GET    /v1/engagement/events/:id/staff`
  - `POST   /v1/engagement/events/:id/staff`
  - `DELETE /v1/engagement/events/:id/staff/:staffId`
  - `GET    /v1/engagement/events/:id/participants`
  - `PATCH  /v1/engagement/events/:id/participants/:participantId`
  - `GET    /v1/engagement/events/:id/dashboard`
  - `POST   /v1/engagement/events/:id/remind-outstanding`
- `apps/api/src/modules/engagement/events.controller.spec.ts`
- `apps/api/src/modules/engagement/parent-events.controller.ts` — Parent endpoints:
  - `GET    /v1/parent/engagement/events`
  - `GET    /v1/parent/engagement/events/:id`
  - `POST   /v1/parent/engagement/events/:id/register/:studentId`
  - `POST   /v1/parent/engagement/events/:id/withdraw/:studentId`
- `apps/api/src/modules/engagement/parent-events.controller.spec.ts`

### Workers

- `apps/worker/src/engagement/engagement-generate-invoices.processor.ts` — Processes `engagement:generate-event-invoices`. Receives `{ tenant_id, event_id }`. For each participant's household, creates an invoice via `InvoiceService.createInvoice()` with a single line item (event fee). Links invoice to participant record. Uses `EVI` sequence prefix.
- `apps/worker/src/engagement/engagement-chase-outstanding.processor.ts` — Cron job (daily 09:00). Iterates all tenants. For each tenant, finds events/forms with pending submissions within configured reminder thresholds (`default_reminder_days`). Dispatches reminder notifications. Respects `max_reminders_per_form`.
- `apps/worker/src/engagement/engagement-expire-pending.processor.ts` — Cron job (daily 00:00). Iterates all tenants. Finds pending submissions past their deadline. Transitions to `expired`. Updates participant `consent_status` to `declined`.
- `apps/worker/src/engagement/engagement-cancel-event.processor.ts` — Processes `engagement:cancel-event`. Receives `{ tenant_id, event_id }`. Notifies all participants of cancellation. Voids unpaid invoices (calls finance module). Releases any booked conference time slots.

### Module Update

- Update `apps/api/src/modules/engagement/engagement.module.ts` — register events, event-participants, parent-events controllers and all event-related services.

### Cron Registration

- Update `CronSchedulerService` in worker — register `engagement:chase-outstanding` (daily 09:00) and `engagement:expire-pending` (daily 00:00) with `jobId: 'cron:CHASE_OUTSTANDING_JOB'` / `'cron:EXPIRE_PENDING_JOB'`.

## Out of Scope

- Form template CRUD, form distribution, consent records (Phase B)
- Trip pack generation, risk assessment gate, attendance, incidents (Phase D)
- Conference time slots, bookings, conflict prevention (Phase E)
- All frontend pages (Phases F, G)
- Annual consent renewal (Phase H)
- Calendar integration (Phase H)

## Dependencies

- **Phase A**: All Prisma models (`EngagementEvent`, `EngagementEventStaff`, `EngagementEventParticipant`), Zod schemas (`createEngagementEventSchema`, `updateEngagementEventSchema`, `eventTargetConfigSchema`, `eventDashboardQuerySchema`), DTOs, state machine constants (`EVENT_VALID_TRANSITIONS`), `ENGAGEMENT` queue constant, `engagementConfigSchema` (for tenant config reads).

## Implementation Notes

- **Event → Form distribution**: When an event transitions `published → open`, the service enqueues `engagement:distribute-forms` (Phase B's processor). If Phase B is not yet deployed, the job sits in the queue until the processor comes online. At deploy time, B (d2) deploys before C (d3), so the processor will be available.
- **Event → Invoice generation**: When a paid event (fee_amount > 0) transitions to `open`, enqueue `engagement:generate-event-invoices`. The processor calls `InvoiceService.createInvoice()` from the finance module. Invoice lines use `fee_description` as the line item description and `fee_amount` as the unit amount.
- **Polymorphic type validation**: `createEngagementEventSchema` uses `.refine()` to enforce type-specific required fields. For example, `parent_conference` requires `slot_duration_minutes`; trip types require `start_date` and `location`; `policy_signoff` requires only `consent_deadline`.
- **State machine enforcement**: The service must validate transitions against `EVENT_VALID_TRANSITIONS` and apply type-specific rules before performing the transition. Invalid transitions return `400 Bad Request` with a descriptive error.
- **Dashboard query**: The dashboard endpoint returns `{ total_invited, total_registered, consent_stats: { granted, pending, declined, expired }, payment_stats: { paid, pending, waived, not_required }, capacity, capacity_used }`. This is a single aggregation query over `engagement_event_participants`.
- **Capacity enforcement**: Registration rejects with `409 Conflict` when `capacity_used >= capacity`. The check uses `SELECT ... FOR UPDATE` on the event row within the RLS transaction to prevent race conditions.
- **Chase-up cron**: The processor reads `engagement.default_reminder_days` from tenant config (e.g., `[2, 5, 7]`). For each open event/form, it checks `days_until_deadline` and triggers a reminder if the current day matches a threshold AND the submission hasn't already received that reminder (track via a `reminder_count` or last-reminded timestamp — add to submission record if needed).
- **Permission guards**: Event CRUD uses `@RequiresPermission('engagement.events.*')`. Dashboard uses `engagement.events.view_dashboard`. Teacher-scoped access checks `engagement_event_staff` membership.
