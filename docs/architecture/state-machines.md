# State Machine Contracts

> **Purpose**: Before changing a status field or adding a transition, check here for the full contract.
> **Maintenance**: Update when adding new statuses or changing transition rules.
> **Last verified**: 2026-04-09

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

### SupportPlanStatus (SEN)

```
draft         -> [active]
active        -> [under_review, closed]
under_review  -> [active, closed]
closed        -> [archived]
archived*
```

- **Guarded by**: `packages/shared/src/sen/state-machine.ts`, enforced at runtime by `apps/api/src/modules/sen/sen-support-plan.service.ts`
- **Side effects**:
  - `draft -> active`: sets `next_review_date` from tenant setting `sen.default_review_cycle_weeks`
  - `active -> under_review`: stamps `review_date` and `reviewed_by_user_id`
  - `under_review -> active`: clears review state and assigns a fresh `next_review_date`
  - `under_review -> closed`: persists final `review_notes` and reviewer
  - `closed -> archived`: terminal archival, no downstream jobs yet

### SenGoalStatus

```
not_started        -> [in_progress]
in_progress        -> [partially_achieved, achieved, discontinued]
partially_achieved -> [in_progress, achieved, discontinued]
achieved*
discontinued*
```

- **Guarded by**: `packages/shared/src/sen/state-machine.ts`, enforced at runtime by `apps/api/src/modules/sen/sen-goal.service.ts`
- **Side effects**:
  - `not_started -> in_progress`: status only
  - `in_progress -> partially_achieved`: optional append-only progress note
  - `* -> achieved`: optional append-only achievement note plus optional `current_level` update
  - `* -> discontinued`: optional append-only discontinuation note plus optional `current_level` update

### SenReferralStatus (Professional Involvement)

```
pending         -> [scheduled]
scheduled       -> [completed]
completed       -> [report_received]
report_received*
```

- **Guarded by**: `packages/shared/src/sen/state-machine-referral.ts` — `isValidReferralTransition()`. Strictly forward-only; no skipping steps, no backward transitions.
- **Location**: `apps/api/src/modules/sen/sen-professional.service.ts` (enforced in `update()`)
- **Side effects**: None. Status is informational tracking for the referral lifecycle.

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
- **Side effects**: `submitted` generates application number (SequenceService), materialises applicant consent records from `payload_json.__consents`, and may create a parent `whatsapp_channel` consent. `accepted` via approval triggers registration flow. `withdrawn` by applicant.
- **Danger**: `draft -> submitted` is handled by a separate submission method, not the transition map. The transition map only covers post-submission states.

### FormDefinitionStatus (Admission Forms)

```
draft     -> [published]
published -> [archived]
archived*
```

- **Guarded by**: `admission-forms.service.ts`
- **Side effects**: `published` makes form available for applications. Publishing a new version auto-archives the previous one.

### ConsentRecordStatus

```
granted   -> [withdrawn, expired]
withdrawn*
expired*
```

- **Guarded by**: `gdpr/consent.service.ts`
- **Side effects**: `withdrawn` takes effect synchronously on the next downstream read. WhatsApp notifications fall back to SMS, AI grading/comments/progress summaries reject requests, risk detection skips the student, allergy reports hide consent-gated rows, and cross-school benchmarking excludes the student immediately.
- **Note**: Active uniqueness is enforced by a partial unique index on `(tenant_id, subject_type, subject_id, consent_type)` where `status = 'granted'`, so withdrawn consent can be re-granted as a new row.

### DPA Acceptance (synthetic lifecycle)

```
not_accepted               -> [accepted_current]
accepted_current          -> [stale_on_new_dpa_version]
stale_on_new_dpa_version  -> [accepted_current]
```

- **Guarded by**: `gdpr/dpa.service.ts` + global `gdpr/dpa-accepted.guard.ts`
- **Side effects**: Accepting the current DPA appends an immutable acceptance row with content hash, user, timestamp, and IP. A newly published platform `dpa_versions.version` does not mutate old rows; instead it makes previous acceptance stale because the global guard compares tenant acceptance against the current platform version before allowing tenant-scoped API access.

### PrivacyNoticeVersionPublication (synthetic lifecycle)

```
draft      -> [published]
published*   (read-only; superseded only by a newer published version)
```

- **Guarded by**: `gdpr/privacy-notices.service.ts`
- **Side effects**: Drafts may be edited until `published_at` is set. Publishing fan-outs in-app notifications to all active tenant memberships and makes the new version the current acknowledgement target.

### PrivacyNoticeAcknowledgement (synthetic lifecycle)

```
not_acknowledged             -> [acknowledged_current]
acknowledged_current         -> [stale_on_new_notice_version]
stale_on_new_notice_version  -> [acknowledged_current]
```

- **Guarded by**: `gdpr/privacy-notices.service.ts`
- **Side effects**: Acknowledgements are unique per `(tenant_id, user_id, privacy_notice_version_id)`. When a newer notice is published, earlier acknowledgements remain in history but no longer satisfy the current-version check, which re-shows the acknowledgement banner until the latest version is acknowledged.

---

## Finance

### InvoiceStatus (CONSOLIDATED)

```
draft              -> [pending_approval, issued, cancelled]
pending_approval   -> [issued (via approval callback), cancelled]
issued             -> [partially_paid, paid, overdue, void, written_off]
partially_paid     -> [paid, written_off]
overdue            -> [partially_paid, paid, void, written_off]
paid*
void*
cancelled*
written_off*
```

- **Guarded by**: `packages/shared/src/constants/invoice-status.ts` -> `VALID_INVOICE_TRANSITIONS` map (single source of truth) + `helpers/invoice-status.helper.ts` -> `validateInvoiceTransition()` which enforces it in the API
- **Side effects**:
  - `draft -> issued`: sets `issue_date`, starts overdue clock. May route through `pending_approval` if approval is required.
  - `draft -> pending_approval`: links to approval request; approval callback worker handles `pending_approval -> issued`
  - `issued/overdue -> partially_paid`: automatic when payment < total (via `deriveInvoiceStatus` in payment allocation)
  - `issued/overdue/partially_paid -> paid`: automatic when cumulative payments >= total (via `deriveInvoiceStatus`)
  - `issued -> overdue`: set by `finance:overdue-detection` cron job, not by user action
  - `issued/overdue -> void`: requires no payments allocated (balance must equal total)
  - `issued/partially_paid/overdue -> written_off`: records `write_off_amount`, zeros balance
  - `draft/pending_approval -> cancelled`: cancels any linked approval request
- **Transition initiators**:
  - User-initiated: `draft->issued`, `draft->pending_approval`, `draft/pending_approval->cancelled`, `issued/overdue->void`, `issued/partially_paid/overdue->written_off`
  - System-driven: `pending_approval->issued` (approval callback worker), `issued->overdue` (overdue cron), `issued/overdue->partially_paid/paid` (payment service via `deriveInvoiceStatus`)
- **Payable statuses**: `issued`, `partially_paid`, `overdue` -- these are the only statuses that accept payment allocations, credit note applications, late fees, and Stripe checkout
- **Note**: The user-initiated `issue()` method only accepts `draft` status. The `pending_approval -> issued` path is handled exclusively by the `InvoiceApprovalCallbackProcessor` worker.

### PaymentStatus

```
pending         -> [posted, failed, voided]
posted          -> [refunded_partial, refunded_full, voided]
failed          -> [pending]
voided*
refunded_partial -> [refunded_full]
refunded_full*
```

- **Guarded by**: `packages/shared/src/finance/state-machine-payment.ts` — `isValidPaymentTransition()`. Wired in `payments.service.ts`.
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
pending_approval  -> [draft (rejected), finalised (approved)]
finalised*
cancelled*
```

- **Guarded by**: `packages/shared/src/payroll/state-machine.ts` — `isValidPayrollRunTransition()`. Wired in `payroll-runs.service.ts` (`finalise()`, `cancelRun()`, `executeFinalisation()`).
- **Side effects**: `finalised` generates payslip numbers (SequenceService) and creates individual payslip records. This can happen directly from `draft` or through the approval callback path.
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

- **Side effects**: Retry is handled by `communications:retry-failed-notifications` cron job. WhatsApp delivery also has a consent gate: missing active `whatsapp_channel` consent immediately transitions the original notification to `failed` and creates an SMS fallback notification.

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
draft             -> [open]                          (teacher opens for grade entry)
open              -> [submitted_locked]              (teacher final-submits all grades)
submitted_locked  -> [unlock_requested]              (teacher requests unlock)
unlock_requested  -> [reopened, submitted_locked]    (approver grants or denies)
reopened          -> [final_locked]                   (teacher resubmits after amendment)
final_locked*
```

- **Guarded by**: `assessments.service.ts` `transitionStatus()` and unlock request flow
- **Side effects**: `submitted_locked` triggers grade calculation eligibility.
- **Legacy values**: `closed` and `locked` exist in the Prisma enum for backward compatibility but have been data-migrated:
  - `closed` → `submitted_locked`
  - `locked` → `final_locked`
- **Note**: The unlock flow (`submitted_locked -> unlock_requested -> reopened`) replaces the old `closed -> open` reopen path. Only an approver can grant the unlock; denial keeps the assessment in `submitted_locked`.

### ConfigApprovalStatus (AssessmentCategory, RubricTemplate, CurriculumStandard, TeacherGradingWeight)

```
draft             -> [pending_approval]   (teacher submits)
pending_approval  -> [approved, rejected] (approver reviews)
rejected          -> [draft]              (teacher edits and resets)
approved          -> [archived]           (admin archives)
archived*
```

- **Guarded by**: each respective service's `submitForApproval()` and `review()` methods
- **Side effects**: Only `approved` items can be used in assessment creation.
- **Note**: This config approval workflow applies to teacher-created configuration entities (assessment categories, rubric templates, curriculum standards, teacher grading weights). It ensures all teacher-authored config is reviewed before it enters the active grading pipeline.

### ReportCardStatus

```
draft      -> [published, revised, superseded]
published  -> [revised, superseded]
revised    -> [superseded]  (revised creates a new version chain)
superseded* (overwritten by a regeneration run)
```

- **Guarded by**: `report-cards.service.ts` (existing) and the regeneration pipeline introduced by Implementation 03 of the Report Cards Redesign.
- **Side effects**: When a row is `superseded`, the canonical query excludes it; the file at `pdf_storage_key` is queued for cleanup; downstream listings render the new version only. The `revision_of_report_card_id` chain is preserved for audit.
- **Note**: `superseded` was added by Implementation 01 (Report Cards Redesign — Database Foundation). Existing transitions are preserved.

### CommentWindowStatus _(Report Cards Redesign — impl 01)_

```
scheduled -> [open, closed]
open      -> [closed]
closed    -> [open]   (admin reopen — typically via teacher request approval)
```

- **Guarded by**: `comment-windows.service.ts` (introduced in a later impl) and the partial unique index `report_comment_windows_one_open_per_tenant` which enforces "at most one `open` window per tenant" at the database layer.
- **Side effects**:
  - `scheduled -> open`: enables teacher comment edits and AI draft requests for the targeted academic period.
  - `open -> closed`: blocks further comment edits and AI calls. The AI draft endpoint must reject calls outside an open window with `COMMENT_WINDOW_CLOSED`.
  - `closed -> open`: reopening a previously closed window — only allowed when no other window for the same tenant is currently `open` (enforced by the partial unique index).
- **Cost control**: this state machine is the core mechanism that gates AI cost. Server-side enforcement is mandatory.

### ReportCardBatchJob (generation run) _(Report Cards Redesign — impl 04)_

Logical lifecycle exposed by `ReportCardGenerationService` + `ReportCardGenerationProcessor`:

```
pending (queued)       -> [running (processing), failed]
running (processing)   -> [completed, partial_success, failed]
completed*             (terminal — every student produced at least one PDF)
partial_success*       (terminal — at least one student failed, see errors_json)
failed*                (terminal — infrastructure-level failure before any student was processed)
```

The physical `BatchJobStatus` enum only carries four values today (`queued`, `processing`, `completed`, `failed`). The logical states above map onto them like so:

- `pending` = `queued`
- `running` = `processing`
- `completed` = `completed` with `students_blocked_count = 0`
- `partial_success` = `completed` with `students_blocked_count > 0` (inspect `errors_json`)
- `failed` = `failed` with `error_message` set

- **Guarded by**: `ReportCardGenerationService.generateRun` (insert as `queued` with `total_count = resolvedStudentIds.length`) and `ReportCardGenerationJob.processJob` (transitions `queued → processing → completed | failed`).
- **Side effects**:
  - `queued → processing`: sets `status = processing` and marks the start of PDF rendering.
  - `processing → completed`: every student's PDFs have been rendered and upserted; counters are final.
  - Per-student errors accumulate on `errors_json` without changing the terminal status — a completed run with a non-zero `students_blocked_count` is the logical "partial success" signal. The frontend wizard displays this as a warning banner.
  - `processing → failed`: infrastructure failure (tenant/template missing, DB unreachable) — no reports are produced and `error_message` is recorded.
- **Comment gating**: enforced synchronously by `dryRunCommentGate` before a run is enqueued. A run cannot move past `queued` without either (a) all required comments finalised or (b) an explicit `override_comment_gate` flag from an admin whose tenant has `allow_admin_force_generate = true`.
- **Overwrite semantics**: per-student upsert on `(tenant_id, student_id, academic_period_id, template_id, template_locale)`. Previous `pdf_storage_key` is deleted in the same transaction — see `danger-zones.md` for the data-loss tradeoff.

### TeacherRequestStatus _(Report Cards Redesign — impl 01)_

```
pending   -> [approved, rejected, cancelled]
approved  -> [completed]
rejected* (terminal — author may submit a new request)
cancelled* (terminal — author cancelled before review)
completed* (terminal — admin executed the requested action)
```

- **Guarded by**: `teacher-requests.service.ts` (introduced in a later impl). State validation lives in `VALID_TRANSITIONS`.
- **Side effects**:
  - `approved`: the principal has approved but not yet acted. The request becomes `completed` once the resulting action lands (a new comment window is opened or a regeneration run starts), at which point `resulting_run_id` or `resulting_window_id` is set.
  - `rejected`: optional `review_note` is recorded; no downstream action.
  - `cancelled`: only the author can cancel, and only while `pending`.
- **Note**: `request_type = open_comment_window` requests must have `target_scope_json IS NULL`; `request_type = regenerate_reports` requests must carry a non-null `target_scope_json`. Cross-field rule is enforced by `submitTeacherRequestSchema` in `@school/shared/report-cards`.

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

- **Guarded by**: `ApprovalRequestsService.approve()`, `reject()`, and `cancel()` use conditional `updateMany(... status: 'pending_approval' ...)` transitions so concurrent stale reads cannot produce two successful decisions.
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
submitted  -> [classified]
classified -> [approved, rejected]
approved   -> [completed]
rejected*
completed*
```

- **Guarded by**: `packages/shared/src/compliance/state-machine.ts` — `isValidComplianceTransition()`. Wired in `compliance.service.ts` (`classify()`, `approve()`, `reject()`, `execute()`).
- **Side effects**: `create()` auto-sets `deadline_at = now + 30 days`. `extend()` sets `extension_granted=true`, `extension_deadline_at = deadline_at + 60 days` (Article 12(3)). `compliance:deadline-check` cron sets `deadline_exceeded=true` when effective deadline passes. Erasure execution also deletes consent records + tokenisation mappings.
- **Subject types**: `student`, `parent`, `household`, `user`, `staff` (Phase F), `applicant` (Phase F)

---

## Regulatory & Child Protection

### RegulatoryTransferStatus

```
pending    -> [accepted, rejected, cancelled]
accepted   -> [completed, cancelled]
rejected*
completed*
cancelled*
```

- **Guarded by**: `apps/api/src/modules/regulatory/regulatory-transfers.service.ts`
- **Prisma enum mapping**: API `pending|accepted|rejected|completed|cancelled` maps to DB `transfer_pending|transfer_accepted|transfer_rejected|transfer_completed|transfer_cancelled`
- **Side effects**: transfer lifecycle updates are local to the inter-school transfer record; `ppod_confirmed` is tracked separately and does not itself drive a status transition

### MandatedReportStatus

```
none             -> [draft]
draft            -> [submitted]
submitted        -> [acknowledged]
acknowledged     -> [outcome_received]
outcome_received*
```

- **Guarded by**: `apps/api/src/modules/child-protection/services/mandated-report.service.ts`
- **Prisma enum mapping**: `mr_draft`, `mr_submitted`, `mr_acknowledged`, `outcome_received`
- **Side effects**:
  - `none -> draft`: creates the mandated report draft on the linked CP record and writes a pastoral event
  - `draft -> submitted`: stores Tusla reference details and submission metadata
  - `submitted -> acknowledged`: records acknowledgement details
  - `acknowledged -> outcome_received`: records the final outcome
- **Note**: this is a synthetic lifecycle layered over `cp_records.mandated_report_status`; a CP record can also remain in `none` forever if no mandated report is opened

---

## Staff Wellbeing Lifecycles

### SurveyStatus

```
draft    -> [active]
active   -> [closed]
closed   -> [archived]
archived*
```

- **Guarded by**: `apps/api/src/modules/staff-wellbeing/services/survey.service.ts` — `activate()`, `close()` methods enforce per-transition validation
- **Valid transitions**:
  - `draft → active` (requires: questions exist, window dates set, no other active survey for tenant)
  - `active → closed` (side effects: `results_released` set to `true`)
  - `closed → archived` (no side effects, cleanup only)
- **Invalid transitions**: No backward transitions. No `draft→closed`. No `active→draft`. No skipping states.
- **Note**: Results are only visible after `active → closed` transition — the `results_released` flag gates all result endpoints. There is no separate `release-survey-results` job; results computation happens inline on query.

### ModerationStatus (survey responses)

```
pending  -> [approved, flagged, redacted]
approved*
flagged  -> [approved, redacted]
redacted*
```

- **Guarded by**: `apps/api/src/modules/staff-wellbeing/services/survey-results.service.ts` — `moderateResponse()`
- **Side effects**: `redacted` overwrites original `answer_text` with `[Response redacted by moderator]`. Redaction is irreversible — original text is destroyed.
- **Auto-flagging**: The `wellbeing:moderation-scan` worker job automatically transitions `pending → flagged` if staff names, room codes, or subject names are detected in freeform text.
- **Danger**: `survey_responses` has NO `tenant_id` and NO RLS — see DZ-27. Moderation access is gated by joining through the tenant-scoped `staff_surveys` table.

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
in_progress -> [completed, cancelled, overdue]
overdue     -> [in_progress, completed, cancelled]
completed*
cancelled*
```

- **Guarded by**: `packages/shared/src/behaviour/state-machine-task.ts` -> `isValidTaskTransition()` (single source of truth, added in SP3) + `behaviour-tasks.service.ts` -> `completeTask()`, `cancelTask()` (per-method validation)
- **Side effects**:
  - `* -> completed`: Sets `completed_at`, `completed_by_id`, optional `completion_notes`. Records history.
  - `* -> cancelled`: Records history with mandatory reason.
  - `pending -> overdue`: Set automatically by `behaviour:task-reminders` daily cron when `due_date < yesterday`. Sends overdue notification.
  - `in_progress -> overdue`: Also set by task-reminders cron if a task in progress passes its due date.
- **Note**: `overdue` is NOT terminal — tasks can still be completed or cancelled after becoming overdue. The `in_progress -> overdue` transition was added in SP3 (previously only `pending -> overdue` was valid).

### SanctionStatus (Phase C)

```
pending_approval -> [scheduled, cancelled]
scheduled        -> [served, partially_served, no_show, excused, cancelled, superseded, not_served_absent, appealed]
appealed         -> [scheduled, cancelled, replaced]
no_show          -> [superseded, cancelled]
excused          -> [superseded, cancelled]
not_served_absent-> [superseded]
served*
partially_served*
cancelled*
replaced*
superseded*
```

- **Guarded by**: `packages/shared/src/behaviour/state-machine-sanction.ts` -> `isValidSanctionTransition()` + `behaviour-sanctions.service.ts` -> `transitionStatus()`
- **Side effects**:
  - Creation: Generates `SN-YYYYMM-NNNNNN` sequence number. Checks if approval required (suspension/expulsion). Auto-creates exclusion case for external suspensions >= 5 days or expulsions.
  - `scheduled -> served`: Sets `served_at`, `served_by_id`. Records history.
  - `scheduled -> appealed`: Triggered by appeal submission. Sets appeal reference.
  - `scheduled -> superseded`: Old sanction on reschedule. New sanction created with same incident link.
  - `appealed -> scheduled`: Appeal rejected (upheld_original). Sanction reinstated.
  - `appealed -> cancelled`: Appeal upheld (overturned). Incident transitions to `closed_after_appeal`.
  - `appealed -> replaced`: Appeal partially upheld. New replacement sanction created.
  - Bulk mark served: `POST /sanctions/bulk-mark-served` transitions multiple sanctions atomically with partial success.
- **Danger**: Appeal decision cascading — a single `decide` call can transition the sanction, incident, and exclusion case. All in one transaction.

### InterventionStatus (Phase E)

```
planned                  -> [active_intervention, abandoned]
active_intervention      -> [monitoring, completed_intervention, abandoned]
monitoring               -> [completed_intervention, active_intervention]
completed_intervention*
abandoned*
```

- **Guarded by**: `packages/shared/src/behaviour/state-machine-intervention.ts` -> `isValidInterventionTransition()` (single source of truth) + `behaviour-interventions.service.ts` -> `transitionStatus()`
- **Prisma enum mapping**: `active_intervention` -> DB `"active"`, `completed_intervention` -> DB `"completed"`. Other values (`planned`, `monitoring`, `abandoned`) map to themselves.
- **Side effects**:
  - `planned -> active_intervention`: Records entity history. Intervention plan is now in effect.
  - `active_intervention -> monitoring`: Moves intervention to observation phase. Records history.
  - `monitoring -> active_intervention`: Re-activates intervention if monitoring reveals it's still needed.
  - `* -> completed_intervention`: Terminal. Records completion. Sets completed metrics.
  - `* -> abandoned`: Terminal. Records abandonment with reason. No further transitions allowed.
- **Note**: `monitoring -> active_intervention` is a deliberate cycle — interventions can oscillate between active and monitoring until a terminal state is reached. This supports iterative intervention plans where a student's needs change.
- **Danger**: The Prisma enum names (`active_intervention`, `completed_intervention`) differ from their DB-mapped values (`active`, `completed`) to avoid collisions with other enums. Code that handles these statuses must use the Prisma enum name, not the DB value.

### SafeguardingStatus (Phase D)

```
reported             -> [acknowledged]
acknowledged         -> [under_investigation]
under_investigation  -> [referred, monitoring, resolved]
referred             -> [monitoring, resolved]
monitoring           -> [resolved]
resolved             -> [sealed]
sealed*
```

- **Guarded by**: `packages/shared/src/behaviour/safeguarding-state-machine.ts` -> `isValidSafeguardingTransition()` (single source of truth) + `safeguarding.service.ts` -> `transitionStatus()`
- **Prisma enum mapping**: `monitoring` -> DB `"sg_monitoring"` (to avoid collision with `InterventionStatus.monitoring`). Other values map to themselves.
- **Side effects**:
  - `reported -> acknowledged`: SLA clock stops (`sla_first_response_met_at` set). Critical escalation chain terminates (processor checks `status !== 'reported'`).
  - `acknowledged -> under_investigation`: Designated liaison formally opens investigation.
  - `under_investigation -> referred`: Referral to external agency (Tusla, Garda). Records referral details.
  - `* -> resolved`: Closes the concern. Outcome notes recorded.
  - `resolved -> sealed`: IRREVERSIBLE. Seals the record for long-term retention. Sealed concerns cannot be viewed without `safeguarding.seal_access` permission. A sealed record cannot be unsealed.
- **SLA Notes**: SLA deadlines are computed on creation based on severity:
  - `critical`: 1 hour
  - `high`: 4 hours
  - `medium`: 24 hours
  - `low`: 72 hours
    The `safeguarding:sla-check` cron (every 5 min) creates breach tasks if `sla_first_response_met_at` is null and `sla_first_response_due < now()`.
- **Critical Escalation**: When severity is `critical`, a `safeguarding:critical-escalation` job is enqueued immediately (step 0). It re-enqueues itself with 30-minute delay for each subsequent step in the escalation chain (designated liaison -> deputy -> fallback chain). Chain terminates when concern is acknowledged or chain is exhausted.
- **Danger**: The `sealed` state is the most dangerous transition in the system — it is completely irreversible. There is no unsealing mechanism by design. Data under a sealed concern is subject to enhanced access controls and cannot be included in standard reports. The Prisma enum uses `sg_monitoring` for the `monitoring` status to avoid name collision.

### ExclusionStatus (Phase C)

```
initiated             -> [notice_issued]
notice_issued         -> [hearing_scheduled_exc]
hearing_scheduled_exc -> [hearing_held]
hearing_held          -> [decision_made]
decision_made         -> [appeal_window]
appeal_window         -> [finalised, overturned]
finalised*
overturned*
```

- **Guarded by**: `packages/shared/src/behaviour/state-machine-exclusion.ts` -> `isValidExclusionTransition()` + `behaviour-exclusion-cases.service.ts`
- **Side effects**:
  - Creation: Auto-populates `statutory_timeline` JSON with school-day-computed deadlines. Sets legal holds on incident, sanction, and all linked entities. Creates `appeal_review` task.
  - `hearing_held -> decision_made`: Records decision, computes `appeal_deadline = decision_date + 15 school days`.
  - `decision_made -> appeal_window`: Auto-transition on decision recording.
  - `appeal_window -> overturned`: Linked appeal succeeded. Sanction cancelled.
- **Danger**: Statutory timeline dates are computed once on creation and stored as JSONB. If school closures change after creation, stored dates may be stale. Dynamic status computation in `getTimeline()` mitigates this for current status.

### AppealStatus (Phase C)

```
submitted         -> [under_review, withdrawn_appeal]
under_review      -> [hearing_scheduled, decided, withdrawn_appeal]
hearing_scheduled -> [decided, withdrawn_appeal]
decided*
withdrawn_appeal*
```

- **Guarded by**: `packages/shared/src/behaviour/state-machine-appeal.ts` -> `isValidAppealTransition()` + `behaviour-appeals.service.ts`
- **Side effects**:
  - Submission: Generates `AP-YYYYMM-NNNNNN`. If sanction is `scheduled`, transitions to `appealed`. Sets legal holds. Links to exclusion case if applicable. Creates `appeal_review` task.
  - `* -> decided`: Records decision + reasoning. Applies outcome:
    - `upheld_original`: sanction `appealed -> scheduled`
    - `modified`: applies amendments, creates replacement sanction if needed
    - `overturned`: sanction -> `cancelled`, incident -> `closed_after_appeal`, exclusion case -> `overturned`
  - Creates amendment notices for parent-visible field changes. All in single interactive transaction.
  - `* -> withdrawn_appeal`: Restores sanction from `appealed -> scheduled`.
- **Danger**: The `decide` endpoint's atomic transaction touches up to 6 tables: appeals, sanctions, incidents, exclusion_cases, amendment_notices, entity_history. Transaction timeout risk on complex decisions.

### DocumentStatus (Phase G, updated reliability hardening R-14)

- **Model**: `BehaviourDocument.status`
- **Prisma enum mapping**: `generating` → DB `"generating"`, `draft_doc` → DB `"draft"`, `sent_doc` → DB `"sent"`, `finalised` and `superseded` unchanged
- **Initial state**: `generating` (all documents start here since R-14; transitions to `draft_doc` on PDF render callback)
- **Terminal states**: `sent_doc *`, `superseded *`
- **Transitions**:
  - `generating -> draft_doc` (on `PdfRenderProcessor` callback via `behaviour:document-ready` job)
  - `generating -> generating` (stays on callback failure — logged, retried by BullMQ)
  - `draft_doc -> finalised` (staff reviews and confirms via `PATCH /documents/:id/finalise`)
  - `finalised -> sent_doc` (dispatched via `POST /documents/:id/send` with channel email/whatsapp/in_app)
  - `finalised -> superseded` (amendment generates replacement document)
  - `sent_doc -> superseded` (amendment to a previously sent document)
- **Side effects**:
  - `generating -> draft_doc`: `file_key` and `file_size` set from rendered PDF. In-app notification created for the requesting user.
  - `draft_doc -> finalised`: Entity history entry recorded. Staff can now send or print.
  - `finalised -> sent_doc`: `sent_at` and `sent_via` set. `behaviour_parent_acknowledgements` row created. Notification dispatched.
  - `* -> superseded`: `superseded_by_id` and `superseded_reason` set. Original document retained for audit.
  - Print channel: Does NOT transition status. Generates download URL + logs `document_printed` history event.
- **Auto-generation triggers**: Sanction creation (detention_notice, suspension_letter), exclusion initiation (exclusion_notice), appeal hearing date set (appeal_hearing_invite), appeal decided (appeal_decision_letter). All auto-generated docs start at `generating` and transition to `draft_doc` on render callback.
- **Guarded by**: `BehaviourDocumentService.finaliseDocument()`, `BehaviourDocumentService.sendDocument()`, `PdfRenderProcessor` (for `generating -> draft_doc`)
- **Danger**: Documents in `generating` status have no `file_key` — callers of `autoGenerateDocument()` and `generateDocument()` must not assume the returned document has a PDF ready. See DZ-37.

---

## Legal Hold Lifecycle (Phase H)

- **Table**: `behaviour_legal_holds`
- **Status enum**: `LegalHoldStatus` — `active_hold` (@map "active"), `released`
- **Initial state**: `active_hold`
- **Terminal state**: `released *`
- **Transitions**:
  - `active_hold -> released` (admin releases via `POST /admin/legal-holds/:id/release`)
- **Side effects**:
  - `createHold`: Creates hold record + propagates to all linked entities (one level). Logs `legal_hold_set` in entity history.
  - `releaseHold`: Updates status to `released`. Logs `legal_hold_released` in entity history. Does NOT trigger anonymisation. If `releaseLinked=true`, releases all holds with same `legal_basis`.
  - **Retention worker**: Checks for active holds before anonymising any entity. If held, entity is skipped and logged.
- **Propagation rules**: incident → sanctions, tasks, attachments, documents. appeal → incident + all incident-linked. exclusion_case → sanction, incident, documents + all incident-linked.
- **Guarded by**: `BehaviourLegalHoldService.createHold()`, `BehaviourLegalHoldService.releaseHold()`
- **Danger**: Releasing a hold does NOT immediately anonymise the entity. The entity may still be within its retention period or have other active holds. Only the retention worker handles anonymisation.

---

## Retention Status Lifecycle (Phase H)

- **Field**: `retention_status` on incidents, sanctions, interventions, attachments
- **Enum**: `RetentionStatus` — `active`, `archived`, `anonymised`
- **Initial state**: `active`
- **Transitions**:
  - `active -> archived` (retention worker marks records for left students past retention period)
  - `archived -> anonymised` (retention worker strips PII from records past full retention deadline, if no legal hold)
- **Side effects**:
  - `active -> archived`: Record excluded from default list views, search, analytics. Still fully readable with "Include archived" toggle.
  - `archived -> anonymised`: PII fields replaced (student names → hash, free text → "[Archived content]"). Entity history logged. Meilisearch entry deleted. IRREVERSIBLE.
- **Guarded by**: `RetentionCheckProcessor` (worker job only — no manual API transition)

---

## SecurityIncidentStatus (Phase J)

- **Field**: `status` on `security_incidents`
- **Values**: `detected`, `investigating`, `contained`, `reported`, `resolved`, `closed`
- **Initial state**: `detected`
- **Transitions**:
  ```
  detected      -> [investigating, contained]
  investigating -> [contained, resolved]
  contained     -> [reported, resolved]
  reported      -> [resolved]
  resolved      -> [closed]
  closed*
  ```
- **Side effects**:
  - Every transition: a `status_change` event is added to `security_incident_events` timeline
  - `contained -> reported`: should correlate with DPC notification (72-hour Article 33 requirement)
  - `detected` → `investigating`: acknowledges the incident, stops the 12-hour escalation cron
- **Guarded by**: `SECURITY_INCIDENT_STATUS_TRANSITIONS` in `packages/shared/src/security/incident.types.ts` + validated in `SecurityIncidentsService.update()`
- **Platform-level**: No tenant_id. Incidents may span multiple tenants.
- **72-hour clock**: Starts at `detected_at`. Breach deadline cron fires escalation events at 12h, 48h, and 72h for high/critical severity incidents.

---

### HomeworkStatus

- **Field**: `status` on `homework_assignments`
- **Values**: `draft`, `published`, `archived`
- **Initial state**: `draft`
- **Transitions**:
  ```
  draft      -> [published, archived]
  published  -> [archived]
  archived*
  ```
- **Side effects**:
  - `draft -> published`: sets `published_at` timestamp, makes assignment visible to students/parents
  - `published -> archived`: hides from default views but retains for analytics
- **Guarded by**: `VALID_HOMEWORK_TRANSITIONS` in `packages/shared/src/constants/homework-status.ts` + enforced in `apps/api/src/modules/homework/homework.service.ts`
- **Simplicity**: 3 states, 2 transitions — follows the published/archive pattern rather than the more complex finance or behaviour machines

---

## Engagement Module Lifecycles

### EngagementFormTemplateStatus

```
draft      -> [published]
published  -> [archived]
archived*
```

- **Guarded by**: `VALID_TRANSITIONS` in `apps/api/src/modules/engagement/form-templates.service.ts`
- **Side effects**:
  - `draft -> published`: makes the template available for distribution and parent submission flows
  - `published -> archived`: retires the template from new use while preserving historical submissions
- **Note**: the service also prevents unsafe edits when submissions already exist, even if the raw status transition is valid

### EngagementEventStatus

```
draft         -> [published, cancelled]
published     -> [open, cancelled]
open          -> [closed, cancelled]
closed        -> [in_progress, cancelled]
in_progress   -> [completed, cancelled]
completed     -> [archived]
cancelled     -> [archived]
archived*
```

- **Guarded by**: `EVENT_VALID_TRANSITIONS` in `packages/shared/src/engagement/engagement-constants.ts`
- **Side effects**:
  - `published -> open`: triggers downstream form distribution and invoice generation jobs
  - `* -> cancelled`: enqueues `engagement:cancel-event` to reverse pending forms/invoices
  - `completed -> archived`: terminal. Retains data for analytics.
- **Note**: `cancelled` is NOT terminal — it can transition to `archived` for cleanup.

### EngagementSubmissionStatus

```
pending       -> [submitted, expired]
submitted     -> [acknowledged, revoked]
acknowledged  -> [revoked]
expired*
revoked*
```

- **Guarded by**: `SUBMISSION_VALID_TRANSITIONS` in `packages/shared/src/engagement/engagement-constants.ts`
- **Side effects**:
  - `pending -> submitted`: records parent response + optional signature
  - `submitted -> acknowledged`: admin acknowledges submission
  - `* -> revoked`: consent withdrawal path (GDPR)
- **Terminal states**: `expired`, `revoked`

### ConferenceSlotStatus

```
available     -> [booked, blocked]
booked        -> [completed, cancelled]
blocked       -> [available]
completed*
cancelled     -> [available]
```

- **Guarded by**: `SLOT_VALID_TRANSITIONS` in `packages/shared/src/engagement/engagement-constants.ts`
- **Side effects**:
  - `available -> booked`: creates a `ConferenceBooking` record
  - `booked -> cancelled`: releases the slot back to `available` (via `cancelled -> available`)
- **Note**: `cancelled` is NOT terminal — slots return to `available` for rebooking.

### ConferenceBookingStatus

```
confirmed     -> [completed, cancelled, no_show]
completed*
cancelled*
no_show*
```

- **Guarded by**: `BOOKING_VALID_TRANSITIONS` in `packages/shared/src/engagement/engagement-constants.ts`
- **Initial state**: `confirmed` (created on successful slot booking)
- **Terminal states**: `completed`, `cancelled`, `no_show`
- **Side effects**: `confirmed -> cancelled` also transitions the parent slot back to `available`.

---

## Pastoral Module Lifecycles

### PastoralCaseStatus

```
open       -> [active]
active     -> [monitoring, resolved]
monitoring -> [active, resolved]
resolved   -> [closed]
closed     -> [open]
```

- **Guarded by**: `packages/shared/src/pastoral/case-state-machine.ts` -> `CASE_TRANSITIONS` + `isValidCaseTransition()` (single source of truth) + `CaseService.transitionStatus()`
- **Side effects**:
  - `* -> resolved`: Sets `resolved_at` timestamp.
  - `* -> closed`: Sets `closed_at` timestamp.
  - `closed -> open`: Clears `resolved_at` and `closed_at` (reopen flow).
- **Note**: There are NO terminal states — `closed` can cycle back to `open`. This is intentional for cases that require re-opening after parental contact or new evidence.

### PastoralReferralStatus

```
draft                        -> [submitted]
submitted                    -> [acknowledged, withdrawn]
acknowledged                 -> [assessment_scheduled, withdrawn]
assessment_scheduled         -> [assessment_complete, withdrawn]
assessment_complete          -> [report_received, withdrawn]
report_received              -> [recommendations_implemented, withdrawn]
recommendations_implemented*
withdrawn*
```

- **Guarded by**: `VALID_TRANSITIONS` in `apps/api/src/modules/pastoral/services/referral.service.ts`
- **Terminal states**: `recommendations_implemented`, `withdrawn`
- **Side effects**: `submitted` notifies the referral recipient. Each forward transition records a pastoral event. `withdrawn` at any stage marks the referral as no longer active.
- **Waitlist states**: `submitted`, `acknowledged`, `assessment_scheduled` — referrals in these states appear in the "awaiting" view.

### PastoralReferralRecommendationStatus

```
pending        -> [in_progress, not_applicable]
in_progress    -> [implemented, not_applicable]
implemented*
not_applicable*
```

- **Guarded by**: `VALID_TRANSITIONS` in `apps/api/src/modules/pastoral/services/referral-recommendation.service.ts`
- **Terminal states**: `implemented`, `not_applicable`

### SstMeetingStatus

```
scheduled   -> [in_progress, cancelled]
in_progress -> [completed, cancelled]
completed*
cancelled*
```

- **Guarded by**: `VALID_TRANSITIONS` in `apps/api/src/modules/pastoral/services/sst-meeting.service.ts`
- **Side effects**: `scheduled` triggers `pastoral:precompute-agenda` job for agenda pre-population. `completed` locks the agenda and generates minutes.

### CriticalIncidentStatus

```
ci_active     -> [ci_monitoring, ci_closed]
ci_monitoring -> [ci_active, ci_closed]
ci_closed     -> [ci_monitoring]
```

- **Guarded by**: `VALID_TRANSITIONS` in `apps/api/src/modules/pastoral/services/critical-incident.service.ts`
- **Prisma enum mapping**: `active` → DB `"ci_active"`, `monitoring` → DB `"ci_monitoring"`, `closed` → DB `"ci_closed"` (prefixed to avoid enum collisions with PastoralCaseStatus and SafeguardingStatus)
- **Note**: No true terminal state — closed incidents can return to monitoring. This allows multi-phase critical incidents (e.g., a lockdown followed by ongoing monitoring of the affected community).

### PastoralInterventionStatus

```
pc_active -> [achieved, partially_achieved, not_achieved, escalated, withdrawn]
```

- **Guarded by**: `InterventionService.transitionStatus()` — only `pc_active` interventions can transition
- **Prisma enum**: `pc_active` → DB `"active"` (prefixed to avoid collision with other `active` enums)
- **Terminal states**: `achieved`, `partially_achieved`, `not_achieved`, `escalated`, `withdrawn` — all terminal
- **Side effects**: All terminal transitions require `outcome_notes`. `escalated` should trigger creation of a new higher-tier intervention or a behaviour referral.
