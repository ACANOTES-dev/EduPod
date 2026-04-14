# Leave & Cover — Implementation Plan

**Created:** 2026-04-14
**Owner:** Scheduler rebuild stream
**Status:** In progress
**Sibling docs:** `IMPLEMENTATION_LOG.md` (completed solver work Stages 1–9), `README.md`

---

## Status Board

| Stage | Title                            | Status   |
| ----- | -------------------------------- | -------- |
| S1    | Schema + RLS                     | complete |
| S2    | Teacher self-report flow         | complete |
| S3    | Leave request + approval flow    | pending  |
| S4    | Auto-cascade substitution engine | pending  |
| S5    | Notification templates + wiring  | pending  |
| S6    | Sub board + admin feed UI polish | pending  |
| S7    | Payroll-facing export endpoint   | pending  |
| S8    | Deploy + verify on prod          | pending  |

---

## Overview

Extend the scheduler stream with teacher-initiated absence reporting, planned-leave approval workflow, and a cascade-based substitution assignment engine. Payroll tracking is intentionally minimal: count `days_worked` vs `days_missed` per calendar month per staff; no pay-rate or tax logic.

**Three teacher-facing flows:**

1. **Self-report absence** (sick/emergency) — no approval, effective immediately
2. **Leave request** (planned days off) — admin approval required before it books
3. **Direct nomination** — as part of (1), teacher can nominate a specific colleague who has informally agreed to cover

**Cascade substitution assignment** — when an absence is created (self-reported or approved leave falling on a school day):

- Parallel offers: system sends substitute offers to top-N competency-ranked candidates simultaneously
- First-accept-wins (row-level lock prevents double-book)
- If nominated sub is present → offer goes to them alone first; if they decline → escalate to admin (no auto-cascade)
- Expiry: per-tenant configurable offer timeout
- Exhaustion: if all offers expire or decline, broadcast to `school_owner` + `school_principal` + `school_vice_principal` for manual pick

---

## Decisions Locked In

| #   | Decision                          | Value                                                                  |
| --- | --------------------------------- | ---------------------------------------------------------------------- |
| 1   | Offer timeout                     | Tenant-configurable column (`offer_timeout_minutes`), default 30       |
| 2   | Offers                            | **Parallel** (fan out to top-N, first-accept-wins)                     |
| 3   | Notification channels             | In-app + email always; SMS + WhatsApp per-tenant opt-in                |
| 4   | Default leave types               | Seeded + tenant-customisable (sick/annual/bereavement/maternity/...)   |
| 5   | Leave balances                    | **Out of scope** (defer to future stage)                               |
| 6   | Multi-day records                 | One record spans `date_from` → `date_to`; cascade runs per school day  |
| 7   | Cancel/amend                      | Allowed; existing offers auto-revoked; confirmed subs get release note |
| 8   | "Admin" recipients for broadcasts | Role keys `school_owner`, `school_principal`, `school_vice_principal`  |
| 9   | Nominated sub declines            | **Escalate to admin** (no auto-cascade fallback)                       |
| 10  | Nominee validation                | None — any active teacher (warn in UI if not competent, but allow)     |

---

## Data Model (S1)

### Modify `teacher_absences`

Keep the existing `absence_date` column — it now plays the role of start-date — and add a nullable `date_to` for multi-day absences. `date_to IS NULL` = single-day (backwards-compatible with every existing caller in `workload-*` services and the frontend). Add:

| Column                    | Type             | Notes                                                    |
| ------------------------- | ---------------- | -------------------------------------------------------- |
| `date_to`                 | DATE NULL        | NULL = single-day (span = absence_date only); else range |
| `absence_type`            | enum             | `self_reported` \| `approved_leave`                      |
| `leave_type_id`           | UUID NULL        | FK `leave_types.id`, NULL for sick/self-reported         |
| `leave_request_id`        | UUID NULL        | FK `leave_requests.id`, NULL unless approved-leave       |
| `nominated_substitute_id` | UUID NULL        | FK `staff_profiles.id`, optional direct nomination       |
| `is_paid`                 | BOOLEAN          | default true; derived from leave_type but stored         |
| `days_counted`            | NUMERIC(5,2)     | e.g. `0.25` for 8–10am, `1.0` full day, `5.0` Mon–Fri    |
| `cancelled_at`            | TIMESTAMPTZ NULL | soft cancel; active if NULL                              |
| `cancelled_by_user_id`    | UUID NULL        |                                                          |
| `cancellation_reason`     | TEXT NULL        |                                                          |

Keep: `absence_date`, `full_day`, `period_from`, `period_to`, `reason`, `reported_by_user_id`, `reported_at`, timestamps.

New index: `idx_teacher_absences_tenant_range ON (tenant_id, absence_date, date_to)` for day-overlap queries.

Drop existing `@@unique([tenant_id, staff_profile_id, absence_date])` (cannot re-use for multi-day). Replace with partial unique `(tenant_id, staff_profile_id, absence_date) WHERE cancelled_at IS NULL`. Multi-day overlap enforced at service layer (check for any existing active absence whose range intersects the new range before insert).

### New table `leave_types`

System-seeded defaults, tenant-customisable.

| Column                 | Type         | Notes                                                                |
| ---------------------- | ------------ | -------------------------------------------------------------------- |
| `id`                   | UUID PK      |                                                                      |
| `tenant_id`            | UUID NULL    | NULL = system default; tenant rows override/add                      |
| `code`                 | VARCHAR(50)  | `sick`, `annual`, `bereavement`, `maternity`, `paternity`, etc.      |
| `label`                | VARCHAR(100) | display name                                                         |
| `requires_approval`    | BOOLEAN      | `false` for sick (self-report); `true` for annual/bereavement/etc.   |
| `is_paid_default`      | BOOLEAN      | `true` for sick/annual/bereavement; `false` for unpaid personal      |
| `max_days_per_request` | INT NULL     | NULL = unlimited; e.g. 3 for bereavement                             |
| `requires_evidence`    | BOOLEAN      | `true` for sick >3 days, `true` for bereavement — soft/optional flag |
| `display_order`        | INT          |                                                                      |
| `is_active`            | BOOLEAN      |                                                                      |

Seeded defaults: `sick` (no-approval, paid), `annual` (approval, paid), `bereavement` (approval, paid, 3-day cap), `maternity` (approval, paid), `paternity` (approval, paid), `unpaid_personal` (approval, unpaid), `jury_duty` (approval, paid), `medical_appointment` (approval, paid), `toil` (approval, paid).

### New table `leave_requests`

Approval workflow for planned absences. Creates a `teacher_absence` on approval.

| Column                 | Type              | Notes                                                               |
| ---------------------- | ----------------- | ------------------------------------------------------------------- |
| `id`                   | UUID PK           |                                                                     |
| `tenant_id`            | UUID NOT NULL     |                                                                     |
| `staff_profile_id`     | UUID NOT NULL     |                                                                     |
| `leave_type_id`        | UUID NOT NULL     | FK `leave_types`                                                    |
| `date_from`            | DATE NOT NULL     |                                                                     |
| `date_to`              | DATE NOT NULL     |                                                                     |
| `full_day`             | BOOLEAN           |                                                                     |
| `period_from`          | SMALLINT NULL     | partial-day start                                                   |
| `period_to`            | SMALLINT NULL     | partial-day end                                                     |
| `reason`               | TEXT              |                                                                     |
| `evidence_url`         | VARCHAR(500) NULL | uploaded doctor's note etc.                                         |
| `status`               | enum              | `pending` \| `approved` \| `rejected` \| `cancelled` \| `withdrawn` |
| `submitted_by_user_id` | UUID NOT NULL     |                                                                     |
| `submitted_at`         | TIMESTAMPTZ       |                                                                     |
| `reviewed_by_user_id`  | UUID NULL         |                                                                     |
| `reviewed_at`          | TIMESTAMPTZ NULL  |                                                                     |
| `review_notes`         | TEXT NULL         |                                                                     |
| `resulting_absence_id` | UUID NULL         | FK `teacher_absences.id` once approved                              |

Index: `idx_leave_requests_tenant_status ON (tenant_id, status)`.

### New table `substitution_offers`

One row per (absence, schedule_slot, candidate_sub). Tracks the cascade.

| Column               | Type             | Notes                                                           |
| -------------------- | ---------------- | --------------------------------------------------------------- |
| `id`                 | UUID PK          |                                                                 |
| `tenant_id`          | UUID NOT NULL    |                                                                 |
| `absence_id`         | UUID NOT NULL    | FK `teacher_absences`                                           |
| `schedule_id`        | UUID NOT NULL    | FK `schedules`                                                  |
| `absence_date`       | DATE NOT NULL    | specific day within absence range this offer covers             |
| `candidate_staff_id` | UUID NOT NULL    | FK `staff_profiles`                                             |
| `offered_at`         | TIMESTAMPTZ      |                                                                 |
| `expires_at`         | TIMESTAMPTZ      | `offered_at + tenant.offer_timeout_minutes`                     |
| `status`             | enum             | `pending` \| `accepted` \| `declined` \| `expired` \| `revoked` |
| `responded_at`       | TIMESTAMPTZ NULL |                                                                 |
| `decline_reason`     | TEXT NULL        |                                                                 |
| `is_nomination`      | BOOLEAN          | `true` if this offer came from Sarah nominating Oscar           |
| `cascade_round`      | SMALLINT         | 1 for initial fan-out; N for Nth round after exhaustion         |

Indexes: `(tenant_id, absence_id, status)`, `(tenant_id, candidate_staff_id, status)`, `(tenant_id, expires_at) WHERE status = 'pending'` (for expiry cron).

### Expand `substitution_records`

Add columns (keep existing):

| Column         | Type      | Notes                                                                         |
| -------------- | --------- | ----------------------------------------------------------------------------- |
| `offer_id`     | UUID NULL | FK `substitution_offers` — the accepted offer that created this record        |
| `absence_date` | DATE NULL | specific day within range; allows one absence to produce N records for N days |
| `source`       | enum      | `cascade` \| `nomination` \| `manual` — how this assignment was created       |

Extend enum `SubstitutionStatus`: `assigned | confirmed | declined | revoked` (add `revoked` for "no longer needed" cases).

### New table `tenant_scheduling_settings`

Mirror of `tenant_settings_inbox` pattern. One row per tenant.

| Column                  | Type        | Notes                                         |
| ----------------------- | ----------- | --------------------------------------------- |
| `id`                    | UUID PK     |                                               |
| `tenant_id`             | UUID UNIQUE |                                               |
| `offer_timeout_minutes` | INT         | default `30`                                  |
| `parallel_offer_count`  | INT         | default `3` (top-N to fan out)                |
| `sms_enabled`           | BOOLEAN     | default `false`                               |
| `whatsapp_enabled`      | BOOLEAN     | default `false`                               |
| `auto_cascade_enabled`  | BOOLEAN     | default `true` — admin can disable per tenant |
| timestamps              |             |                                               |

### RLS policies

All new tables follow the standard boilerplate with `FORCE ROW LEVEL SECURITY` and `tenant_id` isolation. `leave_types` dual-policy: allow NULL tenant_id (system defaults) OR match.

---

## State Machines

### `leave_requests.status`

```
pending ──approve──► approved  (side-effect: insert teacher_absence row, enqueue cascade)
pending ──reject───► rejected
pending ──withdraw─► withdrawn (teacher cancels before review)
approved ──cancel──► cancelled (teacher or admin cancels after approval; revokes offers + confirmed subs)
```

### `teacher_absences` (soft state via `cancelled_at`)

```
active (cancelled_at IS NULL) ──cancel──► cancelled (cancelled_at SET)
```

### `substitution_offers.status`

```
pending ──accept──► accepted  (first-accept-wins, siblings → revoked)
pending ──decline─► declined  (trigger cascade-next)
pending ──expire──► expired   (trigger cascade-next)
pending ──revoke──► revoked   (absence cancelled, sibling accepted)
```

### `substitution_records.status`

```
assigned (on offer.accepted) ──confirm──► confirmed (admin/auto)
assigned ──revoke──► revoked  (absence cancelled before class)
```

---

## API Surface

### Teacher

| Method | Path                                  | Permission                               |
| ------ | ------------------------------------- | ---------------------------------------- |
| POST   | `/v1/scheduling/absences/self-report` | `schedule.report_own_absence`            |
| POST   | `/v1/scheduling/absences/:id/cancel`  | `schedule.report_own_absence` (own only) |
| POST   | `/v1/leave/requests`                  | `leave.submit_request`                   |
| GET    | `/v1/leave/requests/my`               | `leave.submit_request`                   |
| POST   | `/v1/leave/requests/:id/withdraw`     | `leave.submit_request` (own)             |
| POST   | `/v1/scheduling/offers/:id/accept`    | `schedule.respond_to_offer`              |
| POST   | `/v1/scheduling/offers/:id/decline`   | `schedule.respond_to_offer`              |
| GET    | `/v1/scheduling/offers/my`            | `schedule.respond_to_offer`              |

### Admin

| Method | Path                             | Permission                    |
| ------ | -------------------------------- | ----------------------------- |
| GET    | `/v1/leave/requests`             | `leave.approve_requests`      |
| POST   | `/v1/leave/requests/:id/approve` | `leave.approve_requests`      |
| POST   | `/v1/leave/requests/:id/reject`  | `leave.approve_requests`      |
| GET    | `/v1/scheduling/settings`        | `settings.manage`             |
| PATCH  | `/v1/scheduling/settings`        | `settings.manage`             |
| GET    | `/v1/leave/types`                | `leave.submit_request` (read) |
| POST   | `/v1/leave/types`                | `settings.manage`             |
| PATCH  | `/v1/leave/types/:id`            | `settings.manage`             |

### Payroll-facing (S7)

| Method | Path                                         | Permission                  |
| ------ | -------------------------------------------- | --------------------------- |
| GET    | `/v1/payroll/absence-periods?period=YYYY-MM` | `payroll.manage_attendance` |

Returns:

```json
{
  "data": [
    {
      "staff_profile_id": "...",
      "staff_name": "Sarah Daly",
      "period": "2026-04",
      "days_worked": 18.0,
      "days_missed": 2.5,
      "breakdown": [
        { "leave_type": "sick", "days": 1.5, "is_paid": true },
        { "leave_type": "annual", "days": 1.0, "is_paid": true }
      ]
    }
  ]
}
```

---

## Worker Jobs (S4)

Queue: `scheduling` (existing).

| Job name                         | Trigger                                     | Purpose                                                                                                          |
| -------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `substitutions:cascade-next`     | On absence create OR offer declined/expired | For each uncovered school day × period slot, create up to N pending offers and dispatch notifications            |
| `substitutions:expire-offers`    | Cron every 60s                              | Find offers where `expires_at < now() AND status = 'pending'` → mark expired, enqueue cascade-next for that slot |
| `substitutions:revoke-on-cancel` | On absence cancelled                        | Revoke all pending offers + confirmed records for that absence; notify                                           |

Processor: new `apps/worker/src/processors/scheduling/substitution-cascade.processor.ts` extending `TenantAwareJob`.

---

## Notification Templates (S5)

Seed these in `packages/prisma/seed/notification-templates.ts` (create if absent).

All templates seeded for `en` + `ar`, channels `email` + `in_app` (+ `sms` and `whatsapp` seeded too; dispatcher skips channel if tenant setting disabled).

| template_key                          | Recipient              | Trigger                                                 |
| ------------------------------------- | ---------------------- | ------------------------------------------------------- |
| `absence.self_reported_confirmation`  | Reporter (Sarah)       | After self-report succeeds                              |
| `absence.admin_notice`                | Admin role holders     | After self-report OR approved leave activates           |
| `substitution.offer_received`         | Candidate sub (James)  | Offer created                                           |
| `substitution.offer_nominated`        | Nominated sub (Oscar)  | Offer created with `is_nomination = true`               |
| `substitution.admin_offer_dispatched` | Admin role holders     | Offer(s) dispatched                                     |
| `substitution.accepted`               | Admin + reporter       | Offer accepted                                          |
| `substitution.declined`               | Admin                  | Offer declined — includes next cascade round info       |
| `substitution.cascade_exhausted`      | Admin role holders     | All offers declined/expired → manual assignment needed  |
| `substitution.offer_revoked`          | Candidate sub          | Absence cancelled or sibling sub already accepted       |
| `substitution.nominated_rejected`     | Admin                  | Nominated sub declined (no auto-cascade; manual needed) |
| `leave.request_submitted`             | Admin                  | New leave request awaiting approval                     |
| `leave.request_approved`              | Requester              | Admin approved their leave                              |
| `leave.request_rejected`              | Requester              | Admin rejected their leave                              |
| `absence.cancelled`                   | Admin + confirmed subs | Absence cancelled                                       |

---

## Permissions (S1–S3)

Add to `packages/prisma/seed/permissions.ts`:

| permission_key                | Tier  | Roles receiving it by default                               |
| ----------------------------- | ----- | ----------------------------------------------------------- |
| `schedule.report_own_absence` | staff | `teacher`                                                   |
| `schedule.respond_to_offer`   | staff | `teacher`                                                   |
| `leave.submit_request`        | staff | `teacher`                                                   |
| `leave.approve_requests`      | admin | `school_owner`, `school_principal`, `school_vice_principal` |

Existing `schedule.manage_substitutions` remains the catch-all for admin-side manual intervention.

---

## UI Surfaces

### Teacher (S2, S3, S4)

- **Dashboard widget** "Quick Actions" card with "Report Absence" + "Request Leave" buttons
- **Self-report modal**: date-range picker, full/partial-day toggle, period range picker (if partial), reason textarea, optional nomination picker (active-teacher search), submit
- **Leave request form** at `/dashboard/teacher/leave/new`: leave_type dropdown, date-range, reason, optional evidence upload, submit
- **My leave list** at `/dashboard/teacher/leave`: pending/approved/rejected history
- **Offer card** on teacher's `/timetables?tab=teacher` view + dedicated `/dashboard/teacher/offers` page: each pending offer shows date, period, class, subject, time remaining; Accept/Decline buttons

### Admin (S3, S6)

- **Leave approval queue** at `/scheduling/leave-requests`: pending list, click to review, approve/reject with notes
- **Admin notification feed** (existing notifications panel enhanced): filter by `substitution.*` and `leave.*` template keys
- **Sub board** at `/scheduling/substitution-board` (existing): extend to show offer state ("Offered to James, Oscar — 12 min remaining"); add "exhausted" red banner for slots needing manual pick
- **Settings** at `/scheduling/settings`: offer timeout, parallel count, SMS/WhatsApp toggles, auto-cascade toggle

---

## Payroll Export Contract (S7)

The simplest possible read endpoint. Given a `period=YYYY-MM`, compute for each staff_profile in the tenant:

- `days_worked` = `school_days_in_month - sum(days_counted for absences overlapping month)`
- `days_missed` = `sum(days_counted for absences overlapping month)`
- `breakdown` = group `days_counted` by `leave_type` + `is_paid`

Weekends + school holidays excluded (uses existing `academic_calendar` + `school_holidays` tables).

No caching, no materialized view — month-range aggregations on demand. Fast enough for O(100) staff × O(20) absences.

---

## Stages

### S1 — Schema + RLS

- Prisma migration adds `leave_types`, `leave_requests`, `substitution_offers`, `tenant_scheduling_settings`
- Modify `teacher_absences` (add columns, swap `absence_date` for `date_from`/`date_to`, backfill existing rows with `date_from = date_to = absence_date`)
- Expand `substitution_records` (add `offer_id`, `absence_date`, `source`) + enum extension (`revoked`)
- Post-migrate SQL: RLS policies for all new tables
- Seed `leave_types` defaults (9 rows, tenant_id NULL = system)
- Seed permissions `schedule.report_own_absence`, `schedule.respond_to_offer`, `leave.submit_request`, `leave.approve_requests`
- Grant permissions per role (teacher + admin tiers)
- Regenerate `api-surface.snapshot.json` is N/A yet (endpoints come in S2+)
- Unit tests: migration smoke test, role-permission grants

**Exit:** `npx prisma migrate dev` clean, RLS policies present, seed runs.

### S2 — Teacher self-report flow

- Zod schemas in `packages/shared`: `selfReportAbsenceSchema`, `cancelAbsenceSchema`
- Controller: add endpoints to `scheduling-enhanced.controller.ts` or new `absences.controller.ts`
- Service: extend `substitution.service.ts` with `selfReport()` + `cancelAbsence()`
- Auth: gate on `schedule.report_own_absence`; reject if `staff_profile_id` on payload ≠ caller's staff_profile
- Teacher dashboard: Quick Actions card + self-report modal
- API integration test + controller spec

**Exit:** Sarah logs in as teacher, reports 8–10am absence with or without nomination, `TeacherAbsence` + `cascade-next` job enqueued. Cascade engine stubbed; full behaviour in S4.

### S3 — Leave request + approval

- Zod schemas: `createLeaveRequestSchema`, `reviewLeaveRequestSchema`
- New controller `leave-requests.controller.ts`
- New service `leave-requests.service.ts` (state machine transitions)
- Approval side-effect: create `TeacherAbsence` row, link via `resulting_absence_id`, enqueue cascade-next
- Teacher UI: `/dashboard/teacher/leave/new` + `/dashboard/teacher/leave`
- Admin UI: `/scheduling/leave-requests` approval queue
- Tests: state machine exhaustive, RLS leakage

**Exit:** Sarah submits annual leave for next Mon–Wed; admin approves; absence created; cascade enqueued for 3 days; admin rejection also works.

### S4 — Auto-cascade engine

- BullMQ processor `SubstitutionCascadeProcessor` (new file)
- Cron registration: `substitutions:expire-offers` every 60s
- Accept/decline endpoints + row-level `FOR UPDATE` locking in `acceptOffer()` to ensure first-accept-wins
- Nomination path: if `nominated_substitute_id` set → single offer with `is_nomination = true`; on decline → `substitution.nominated_rejected` to admin (no cascade)
- Parallel offers: load top-N from existing `suggest()` output, create N offers, dispatch notifications to all
- First-accept-wins: on accept → sibling offers for same (absence, schedule_id, date) → `revoked`, dispatch `offer_revoked` to them
- On all-declined/all-expired → enqueue `substitution.cascade_exhausted` to admin broadcast
- Revoke-on-cancel: when absence cancelled, revoke all pending + confirmed, notify
- Teacher UI: offer card list + accept/decline buttons, countdown display

**Exit:** Sarah self-reports, James + Michael + Liam get parallel offers, James accepts first, sibling offers auto-revoke, admin + Sarah see acceptance. Separately, Sarah nominates Oscar, Oscar declines, admin gets `nominated_rejected` with no further cascade.

### S5 — Notifications

- Seed file `notification-templates/leave-and-cover.ts` with all 14 template_keys × 2 locales
- Dispatch hooks in each state-transition point:
  - `selfReport()` → `absence.self_reported_confirmation` (reporter) + `absence.admin_notice` (admin broadcast)
  - `cascadeNext()` → `substitution.offer_received` (candidates) or `substitution.offer_nominated` (nominee) + `substitution.admin_offer_dispatched` (admin broadcast)
  - `acceptOffer()` → `substitution.accepted` (admin + reporter), `substitution.offer_revoked` (siblings)
  - `declineOffer()` → `substitution.declined` (admin), triggers next cascade round
  - `cascadeExhausted()` → `substitution.cascade_exhausted` (admin broadcast)
  - Leave flows → their respective template_keys
- Channel opt-in: dispatcher reads `tenant_scheduling_settings.sms_enabled` / `whatsapp_enabled` and skips accordingly
- Admin broadcast helper: lookup users via `user_roles` where `role_key IN (school_owner, school_principal, school_vice_principal)`

**Exit:** Every state transition produces the right notification rows (verified in integration spec).

### S6 — UI polish

- Sub board shows offer state: `"Offered to 3 (12 min remaining)"` / `"Confirmed: James Lee"` / `"Needs manual pick"` with appropriate colours
- Admin notification feed filter for substitution + leave events
- Leave approval queue list with pending/reviewed tabs
- Audit trail view on each absence (timeline of offers, responses, status changes)

**Exit:** Admin walks through the full lifecycle end-to-end via UI.

### S7 — Payroll export

- New controller `payroll-attendance.controller.ts` (or add to existing `payroll` module if present)
- Service: month-range aggregation query, joins `teacher_absences` + `leave_types` + `school_holidays`
- Response shape per contract above
- Test: fixture with 2 staff, 3 absences across 2 months → assert correct daily rollup

**Exit:** Hit endpoint, get payload matching contract.

### S8 — Deploy + verify

- rsync monorepo to prod (excludes per CLAUDE.md hard rule)
- Run `pnpm --filter prisma migrate deploy` on prod via SSH
- Run seed via `pnpm --filter prisma run seed:permissions` + templates seed
- `pm2 restart all`
- Playwright spot-check (≤20 min budget per memory):
  1. Teacher self-reports as Sarah — absence shows in list
  2. Admin sees admin notice in feed
  3. Sub sees offer in `/dashboard/teacher/offers` — accepts
  4. Admin sees acceptance
  5. Leave request → approve → cascade enqueues
- Commit implementation + log entry

**Exit:** All five flows verified on nhqs.edupod.app.

---

## Test Strategy

- Co-located specs for every new service and controller
- Integration e2e in `apps/api/test/` for one happy-path per stage (self-report → cascade → accept; leave-submit → approve → cascade)
- RLS tests: create in tenant A, attempt from tenant B for each new table
- State machine exhaustive transitions for `leave_requests`, `substitution_offers`, `substitution_records`
- Race test: two subs accept simultaneously → exactly one wins, other returns 409

---

## Open Questions / Deferred

- **Leave balance tracking** — out of scope per Decision 5. Will add `leave_balances` table + accrual rules in a future stage when payroll is ready.
- **Recurring sub agreements** ("James always covers Sarah's homeroom") — not in scope. All offers are per-absence.
- **Bulk import of leave requests** — not in scope. One at a time via UI.
- **Mobile push notifications** — rely on existing in-app + email. Native push is separate infra.

---

## Change Log

- 2026-04-14: Initial plan created. All 10 decisions locked. Stages S1–S8 scoped.
