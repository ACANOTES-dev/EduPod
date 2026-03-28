# State Machine Contracts

> **Purpose**: Before changing a status field or adding a transition, check here for the full contract.
> **Maintenance**: Update when adding new statuses or changing transition rules.
> **Last verified**: 2026-03-27

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

### DocumentStatus (Phase G)

- **Model**: `BehaviourDocument.status`
- **Prisma enum mapping**: `draft_doc` → DB `"draft"`, `sent_doc` → DB `"sent"`, `finalised` and `superseded` unchanged
- **Initial state**: `draft_doc` (all documents start here)
- **Terminal states**: `sent_doc *`, `superseded *`
- **Transitions**:
  - `draft_doc -> finalised` (staff reviews and confirms via `PATCH /documents/:id/finalise`)
  - `finalised -> sent_doc` (dispatched via `POST /documents/:id/send` with channel email/whatsapp/in_app)
  - `finalised -> superseded` (amendment generates replacement document)
  - `sent_doc -> superseded` (amendment to a previously sent document)
- **Side effects**:
  - `draft_doc -> finalised`: Entity history entry recorded. Staff can now send or print.
  - `finalised -> sent_doc`: `sent_at` and `sent_via` set. `behaviour_parent_acknowledgements` row created. Notification dispatched.
  - `* -> superseded`: `superseded_by_id` and `superseded_reason` set. Original document retained for audit.
  - Print channel: Does NOT transition status. Generates download URL + logs `document_printed` history event.
- **Auto-generation triggers**: Sanction creation (detention_notice, suspension_letter), exclusion initiation (exclusion_notice), appeal hearing date set (appeal_hearing_invite), appeal decided (appeal_decision_letter). All auto-generated docs start at `draft_doc`.
- **Guarded by**: `BehaviourDocumentService.finaliseDocument()`, `BehaviourDocumentService.sendDocument()`
- **Danger**: Document generation runs Puppeteer inside the API transaction — timeout risk for complex board pack templates.

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
- **Guarded by**: `INCIDENT_STATUS_TRANSITIONS` map in `@school/shared` + validated in `SecurityIncidentsService.update()`
- **Platform-level**: No tenant_id. Incidents may span multiple tenants.
- **72-hour clock**: Starts at `detected_at`. Breach deadline cron fires escalation events at 12h, 48h, and 72h for high/critical severity incidents.
