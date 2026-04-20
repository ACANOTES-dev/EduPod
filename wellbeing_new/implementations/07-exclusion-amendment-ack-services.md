# Implementation 07 — Exclusion Workflow + Amendment Notices + Parent Ack Services

> **Wave:** 3 (parallel-safe — owns endpoints under `apps/api/src/modules/behaviour/{exclusions,amendments,acknowledgements}/`)
> **Classification:** backend + worker
> **Depends on:** 01, 04
> **Deploys:** API + worker restart

---

## Goal

Three behaviour sub-features that exist in the backend but have only empty UI shells today. This impl audits and hardens:

1. **Statutory exclusion workflow** — full lifecycle (`initiated → notice_issued → hearing_scheduled_exc → hearing_held → decision_made → appeal_window → finalised | overturned`) with statutory deadlines, board-pack generation handoff to impl 06, decision-letter generation, hearing scheduler, and timeline computation.
2. **Amendment notices** — when an incident is corrected after parent acknowledgement, the parent must re-acknowledge. Endpoint exists for the queue + send-correction action; verify shape and tighten.
3. **Parent acknowledgement tracking** — multi-channel append-only log of sent / delivered / read / acknowledged states across in-app / email / WhatsApp. Used by the UI in impl 21.

## Shared files this impl touches

- `apps/api/src/modules/behaviour/behaviour.module.ts` — register sub-controllers. Edit late.
- `apps/worker/src/processors/behaviour/` — new processors for SLA checks + acknowledgement reminders. Yours.
- `apps/worker/src/processors/cron-scheduler.service.ts` — register new cron entries. Edit late.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **low.**

## What to build

### 1. Exclusion workflow

#### Endpoints (verify exist; build any missing)

```
POST   /v1/behaviour/exclusion-cases                          — create new case
GET    /v1/behaviour/exclusion-cases                          — list with filters
GET    /v1/behaviour/exclusion-cases/:id                      — single case with timeline
POST   /v1/behaviour/exclusion-cases/:id/issue-notice         — initiated → notice_issued
POST   /v1/behaviour/exclusion-cases/:id/schedule-hearing     — notice_issued → hearing_scheduled_exc
POST   /v1/behaviour/exclusion-cases/:id/record-hearing       — hearing_scheduled_exc → hearing_held
POST   /v1/behaviour/exclusion-cases/:id/record-decision      — hearing_held → decision_made
POST   /v1/behaviour/exclusion-cases/:id/finalise             — appeal_window → finalised
POST   /v1/behaviour/exclusion-cases/:id/overturn             — appeal_window → overturned
POST   /v1/behaviour/exclusion-cases/:id/generate-notice      — calls doc gen (impl 06) for exclusion notice
POST   /v1/behaviour/exclusion-cases/:id/generate-board-pack  — calls doc gen for hearing pack
GET    /v1/behaviour/exclusion-cases/:id/timeline             — computed deadlines + transitions
```

Permissions: `behaviour.manage_exclusions` for state transitions; `behaviour.view` for reads.

State transitions use `packages/shared/src/behaviour/state-machine*.ts` `VALID_TRANSITIONS` map. Reject invalid with `INVALID_STATE_TRANSITION` typed exception.

#### Statutory deadlines

Compute from the case's current state + jurisdiction config (per-tenant setting). Default deadlines (Irish convention; configurable per tenant):

- Notice → Hearing: 7 days minimum
- Hearing → Decision: 5 working days
- Decision → Appeal window: 10 working days
- After appeal_window with no appeal: auto-finalise

The timeline endpoint returns an array of phase objects with `phase_name`, `started_at`, `due_at`, `status: 'pending' | 'on_track' | 'overdue' | 'completed'`.

#### Cron `behaviour:exclusion-deadline-check`

Every 6 hours: scan exclusion cases in non-terminal states, compute timeline, raise `behaviour:task` rows for any breached deadline. Fire `WellbeingNotificationsService.dispatch('sla.breach', ...)` for each breach.

### 2. Amendment notices

#### Endpoints

```
GET    /v1/behaviour/amendments                          — list all amendment requests
GET    /v1/behaviour/amendments/pending                  — only those awaiting parent re-acknowledgement
POST   /v1/behaviour/amendments/:id/send-correction      — sends correction notice to parents (multi-channel via impl 04)
GET    /v1/behaviour/amendments/:id                      — single amendment with diff
```

Service:

- An amendment is created automatically when a previously-acknowledged incident is updated (existing trigger; verify the trigger exists). The amendment row holds: `original_acknowledgement_id`, `change_summary`, `created_by`, `created_at`, `correction_sent_at`, `re_acknowledged_at`.
- `send-correction` enqueues a job that calls `WellbeingNotificationsService.dispatch('amendment.sent', recipients = parents)` with a structured payload.

### 3. Parent acknowledgement tracking

#### Endpoints

```
GET    /v1/behaviour/acknowledgements                    — list (with filters: incident_id, recipient_user_id, status)
GET    /v1/behaviour/acknowledgements/:id                — single
POST   /v1/behaviour/acknowledge/:acknowledgementId      — parent portal endpoint — marks acknowledged
```

The `acknowledge` endpoint is consumed by the parent portal UI; it requires the parent to be authenticated and to be a recipient of the acknowledgement.

#### Multi-level state tracking

`behaviour_parent_acknowledgements` (existing table per audit) has columns: `sent_at`, `delivered_at`, `read_at`, `acknowledged_at`, `channel`, `method`. Append-only — never mutate, only insert new rows for state transitions.

When a notification is dispatched (impl 06 send flow, amendment send, document send), insert ack row with `sent_at`. When the channel provider confirms delivery (email bounce-or-deliver, WhatsApp tick), update `delivered_at`. When the parent opens the message (in-app message view, email beacon), update `read_at`. When they click the acknowledge button, update `acknowledged_at`.

For now (rebuild scope): in-app `read_at` and `acknowledged_at` work end-to-end. Email/SMS/WhatsApp `delivered_at` and `read_at` are stubbed (set to NULL — provider hardening in a later pass).

#### Cron `behaviour:ack-reminders`

Daily at 9am tenant-local: find acknowledgements that are `sent_at` but not `acknowledged_at` for > 3 days, fire reminder via `WellbeingNotificationsService.dispatch('reminder.acknowledgement', ...)`.

### 4. Audit logging

All state transitions on exclusion cases, amendment send-correction, and the acknowledge action go through `AuditLogInterceptor`. Verify.

## Tests

- `exclusions.service.spec.ts`:
  - Each valid transition succeeds; invalid transitions throw `INVALID_STATE_TRANSITION`
  - Timeline computation matches statutory defaults
  - Generate-notice / generate-board-pack call the documents service (impl 06)
- `amendments.service.spec.ts`:
  - `send-correction` enqueues notification job; idempotent (re-sending updates `correction_sent_at`)
- `acknowledgements.service.spec.ts`:
  - Acknowledge endpoint authenticates parent and matches recipient_user_id; rejects with 403 otherwise
  - Append-only — `acknowledged_at` update only inserts new state row, never mutates
- `exclusion-deadline-check.processor.spec.ts`:
  - Breach detection fires task creation + notification dispatch
- `ack-reminders.processor.spec.ts`:
  - Identifies stale acknowledgements correctly; respects timezone

## Watch out for

- **Statutory deadline jurisdiction** — the default Irish convention may not suit other jurisdictions. Make the per-jurisdiction config a tenant setting (defaults from a JSON map in `packages/shared/src/behaviour/exclusion-jurisdictions.ts`). UI in impl 21 lets admins pick.
- **Re-acknowledgement loop** — when an amendment is sent, the original acknowledgement is NOT cleared; the amendment is its own ack row. The "fully acknowledged" status checks both the latest amendment and the original.
- **Incident edits triggering amendments** — verify the existing trigger does not fire an amendment on every save (e.g. correcting a typo before the parent has even acknowledged). Probably gated on `original_acknowledgement_id IS NOT NULL`. Check.
- **Parent portal authentication** — the acknowledge endpoint must work via the parent's existing portal session. Don't introduce a new auth flow.

## Deployment notes

- Restart: API + worker.
- Smoke: list exclusions on NHQS — empty. Create one via curl, transition through states, verify timeline endpoint shows phase progression. Create an incident, "acknowledge" it as the seeded parent, edit it, verify an amendment row is created and `pending` queue shows it.
