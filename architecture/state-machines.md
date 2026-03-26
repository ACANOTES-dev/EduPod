# State Machine Contracts

> **Purpose**: Before changing a status field or adding a transition, check here for the full contract.
> **Maintenance**: Update when adding new statuses or changing transition rules.
> **Last verified**: 2026-03-26

---

## How to read this

Each state machine lists:
- **Valid transitions**: `from -> [to1, to2]`
- **Terminal states**: No outgoing transitions (marked with `*`)
- **Side effects**: What happens when a transition occurs
- **Guarded by**: Where the transition validation lives

---

## Core Entity Lifecycles

### StudentStatus
```
applicant  -> [active]
active     -> [withdrawn, graduated, archived]
withdrawn  -> [active]
graduated  -> [archived]
archived*
```
- **Guarded by**: `packages/shared/src/constants/student-status.ts` + `students.service.ts`
- **Side effects**: Status change triggers search reindex. `active` enables class enrolment. `withdrawn/archived` should cascade to drop active enrolments.
- **Note**: Transition map is duplicated in shared constants AND service — keep both in sync.

### ClassEnrolmentStatus
```
active    -> [dropped, completed]
dropped   -> [active]
completed*
```
- **Guarded by**: `packages/shared/src/constants/class-enrolment-status.ts` + `class-enrolments.service.ts`
- **Side effects**: `dropped` removes student from class. `active` (re-enrol) adds them back. `completed` is set during year-end promotion.
- **Note**: Transition map is duplicated in shared constants AND service — keep both in sync.

### AcademicYearStatus
```
planned -> [active]
active  -> [closed]
closed*
```
- **Guarded by**: `academic-years.service.ts` line 17
- **Side effects**: Only ONE year can be `active` per tenant (enforced in service). `active` enables all academic operations. `closed` triggers promotion eligibility.
- **Danger**: Closing a year while periods are still `active` is possible — service does not enforce period closure first.

### AcademicPeriodStatus
```
planned -> [active]
active  -> [closed]
closed*
```
- **Guarded by**: `academic-periods.service.ts` line 17
- **Side effects**: `closed` triggers the `report-cards:auto-generate` cron job (daily 03:00 UTC check). Gradebook assessments should be locked before period closure.

---

## Admissions & Registration

### ApplicationStatus
```
draft                       -> [submitted]
submitted                   -> [under_review, rejected]
under_review                -> [pending_acceptance_approval, rejected]
pending_acceptance_approval  -> [accepted (via approval), rejected]
accepted                    -> [withdrawn]
rejected*
withdrawn*
```
- **Guarded by**: `applications.service.ts` line 542 (transition map) + dedicated methods
- **Side effects**: `submitted` generates application number (SequenceService). `accepted` via approval triggers registration flow. `withdrawn` by applicant.
- **Danger**: `draft -> submitted` is handled by a separate submission method, not the transition map. The transition map only covers post-submission states.

### FormDefinitionStatus (Admission Forms)
```
draft     -> [published]
published -> [archived]
archived*
```
- **Guarded by**: `admission-forms.service.ts`
- **Side effects**: `published` makes form available for applications. Publishing a new version auto-archives the previous one.

---

## Finance

### InvoiceStatus (MOST COMPLEX STATE MACHINE)
```
draft              -> [pending_approval, issued, cancelled]
pending_approval   -> [issued (via approval callback), cancelled]
issued             -> [void, written_off]
partially_paid     -> [paid (via payment), written_off]
paid*
overdue            -> [void, written_off]
void*
cancelled*
written_off*
```
- **Guarded by**: `invoices.service.ts` (implicit per-method validation, no single transition map)
- **Side effects**:
  - `issued`: sets `issued_at`, starts overdue clock
  - `partially_paid`: automatic when payment < total (via payment posting)
  - `paid`: automatic when cumulative payments >= total
  - `overdue`: set by `finance:overdue-detection` cron job, not by user action
  - `void`: reverses all posted payments
  - `written_off`: records loss, closes invoice
- **Danger**: `partially_paid` and `overdue` are system-driven transitions, not user-initiated. The `paid` transition is triggered by the payment posting flow, not by changing invoice status directly. Three transitions happen outside the invoice service: `overdue` (cron worker), `issued` (approval callback worker), `partially_paid/paid` (payment service).
- **NO SINGLE TRANSITION MAP** — validation is spread across methods. This is the highest-risk state machine for bugs.

### PaymentStatus
```
pending         -> [posted, failed, voided]
posted          -> [refunded_partial, refunded_full, voided]
failed*
voided*
refunded_partial -> [refunded_full]
refunded_full*
```
- **Guarded by**: `payments.service.ts` (implicit)
- **Side effects**: `posted` updates invoice paid amount and may transition invoice to `partially_paid` or `paid`. `voided` reverses the payment and recalculates invoice status.

### RefundStatus
```
pending_approval -> [approved, rejected]
approved         -> [executed, failed]
executed*
rejected*
failed*
```
- **Guarded by**: `refunds.service.ts`
- **Side effects**: `executed` updates payment status to `refunded_partial` or `refunded_full` and recalculates invoice status.

### CreditNoteStatus
```
open            -> [partially_used, fully_used, cancelled]
partially_used  -> [fully_used]
fully_used*
cancelled*
```
- **Side effects**: Usage reduces invoice balance due.

### PaymentPlanStatus
```
pending         -> [approved, rejected, counter_offered]
counter_offered -> [approved, rejected]
approved*  (creates installment schedule)
rejected*
```

### ScholarshipStatus
```
active  -> [expired, revoked]
expired*
revoked*
```

---

## Payroll

### PayrollRunStatus
```
draft             -> [pending_approval, finalised, cancelled]
pending_approval  -> [finalised (via approval callback), cancelled]
finalised*
cancelled*
```
- **Guarded by**: `payroll-runs.service.ts` (implicit per-method)
- **Side effects**: `finalised` generates payslip numbers (SequenceService) and creates individual payslip records. If via approval, this happens in the worker processor.
- **Danger**: `finalised` via approval callback happens in the worker, not the API. If worker fails mid-generation, some payslips may be created and others not.

---

## Communications

### AnnouncementStatus
```
draft            -> [pending_approval, scheduled, published]
pending_approval -> [published (via approval callback)]
scheduled        -> [published (by scheduler)]
published        -> [archived]
archived*
```
- **Side effects**: `published` triggers notification dispatch to all audience members.

### NotificationStatus
```
queued    -> [sent, failed]
sent      -> [delivered, failed]
delivered -> [read]
failed    -> [queued (retry)]
read*
```
- **Side effects**: Retry is handled by `communications:retry-failed-notifications` cron job.

### ParentInquiryStatus
```
open        -> [in_progress, closed]
in_progress -> [closed]
closed*
```

### ContactFormStatus
```
new_submission -> [reviewed, closed, spam]
reviewed       -> [closed, spam]
closed*
spam*
```
- **Guarded by**: `contact-form.service.ts` line 10 (explicit transition map)

---

## Scheduling

### SchedulingRunStatus
```
queued    -> [running]
running   -> [completed, failed]
completed -> [applied, discarded]
failed*
applied*
discarded*
```
- **Side effects**: `applied` writes schedules to the schedules table. `failed` may be set by stale reaper cron if run exceeds 30 minutes. `completed` stores result in `result_json` JSONB.

### SubstitutionStatus
```
assigned  -> [confirmed, declined]
confirmed -> [completed]
declined*
completed*
```

### ExamSessionStatus
```
planning  -> [published]
published -> [completed]
completed*
```

### ScenarioStatus
```
draft   -> [solved]
solved  -> [approved, rejected]
approved*
rejected*
```

---

## Attendance

### AttendanceSessionStatus
```
open      -> [submitted, cancelled]
submitted -> [locked]
locked*
cancelled*
```
- **Side effects**: `submitted` makes records visible to parents. `locked` prevents any further edits. `cancelled` by school closure detection.

### AttendanceAlertStatus
```
active       -> [acknowledged, resolved]
acknowledged -> [resolved]
resolved*
```

---

## Gradebook

### AssessmentStatus
```
draft  -> [open]
open   -> [closed]
closed -> [locked, open]  (CAN REOPEN)
locked*
```
- **Guarded by**: `assessments.service.ts` line 392 (explicit transition map)
- **Side effects**: `open` allows grade entry. `closed` triggers grade calculation. `locked` is permanent.
- **Note**: `closed -> open` is allowed (reopening). This is intentional for corrections.

### ReportCardStatus
```
draft     -> [published, revised]
published -> [revised]
revised*  (creates a new version)
```

### AcademicAlertStatus
```
active       -> [acknowledged, resolved]
acknowledged -> [resolved]
resolved*
```

---

## Platform & Infrastructure

### TenantStatus
```
active    -> [suspended, archived]
suspended -> [active, archived]
archived*
```

### MembershipStatus
```
invited                -> [pending_verification, active, expired]
pending_verification   -> [active]
active                 -> [suspended, disabled, archived]
suspended              -> [active, disabled]
disabled*
archived*
```

### InvitationStatus
```
pending -> [accepted, expired, revoked]
accepted*
expired*
revoked*
```

### ApprovalRequestStatus
```
pending_approval -> [approved, rejected, cancelled]
approved         -> [executed]
rejected*
cancelled*
expired*
executed*
```
- **Side effects**: `approved` triggers MODE_A_CALLBACKS dispatch (see event-job-catalog.md)

---

## Import & Compliance

### ImportStatus
```
uploaded   -> [validated, failed]
validated  -> [processing]
processing -> [completed, failed, partially_rolled_back]
completed  -> [rolled_back]
failed*
rolled_back*
partially_rolled_back*
```

### ComplianceRequestStatus
```
submitted  -> [classified, rejected]
classified -> [approved, rejected]
approved   -> [completed]
rejected*
completed*
```
- **Guarded by**: `compliance.service.ts` (implicit per-method)

---

## Behaviour Module Lifecycles

### IncidentStatus
```
draft          -> [active, withdrawn]
active         -> [investigating, under_review, escalated, resolved, withdrawn]
investigating  -> [awaiting_approval, awaiting_parent_meeting, resolved, escalated, converted_to_safeguarding]
awaiting_approval       -> [active, resolved]
awaiting_parent_meeting -> [resolved, escalated]
under_review   -> [active, escalated, resolved, withdrawn]
escalated      -> [investigating, resolved]
resolved       -> [closed_after_appeal, superseded]
withdrawn*
closed_after_appeal*
superseded*
converted_to_safeguarding*  (PROJECTED as "closed" for non-safeguarding users)
```
- **Guarded by**: `packages/shared/src/behaviour/state-machine.ts` -> `isValidTransition()` (single source of truth) + `behaviour.service.ts` -> `transitionStatus()` which calls it
- **Side effects**:
  - `draft -> active`: If `follow_up_required`, auto-creates a `BehaviourTask` of type `follow_up`. If category has `requires_parent_notification`, queues `behaviour:parent-notification` job.
  - `active -> withdrawn`: Records history with reason. Cascading withdrawal in Phase C (sanctions -> cancelled, tasks -> cancelled, unsent notifications -> cancelled).
  - `* -> converted_to_safeguarding`: Visible only to `safeguarding.view` users. All other users see this as `closed` with reason "Referred internally". Applied in: API responses, search indexing, entity history rendering, parent notifications.
  - Any transition: Records `behaviour_entity_history` entry with `change_type = 'status_changed'`, previous status, new status, and optional reason.
- **Danger**: The status projection for `converted_to_safeguarding` must be applied at EVERY surface: API responses, search results, exports, hover cards, parent portal. Missing one surface leaks safeguarding information.
- **Note**: `resolved` is terminal UNLESS appealed (-> `closed_after_appeal`) or superseded. This two-stage terminal design is intentional — it allows post-resolution corrections without re-opening.

### BehaviourTaskStatus
```
pending     -> [in_progress, completed, cancelled, overdue]
in_progress -> [completed, cancelled]
overdue     -> [in_progress, completed, cancelled]
completed*
cancelled*
```
- **Guarded by**: `behaviour-tasks.service.ts` -> `completeTask()`, `cancelTask()` (per-method validation)
- **Side effects**:
  - `* -> completed`: Sets `completed_at`, `completed_by_id`, optional `completion_notes`. Records history.
  - `* -> cancelled`: Records history with mandatory reason.
  - `pending -> overdue`: Set automatically by `behaviour:task-reminders` daily cron when `due_date < yesterday`. Sends overdue notification.
- **Note**: `overdue` is NOT terminal — tasks can still be completed or cancelled after becoming overdue.
