# Event & Job Side-Effect Catalog

> **Purpose**: Before modifying any queue, job payload, cron registration, or approval callback, check here for the live side-effect graph.
> **Maintenance**: Update when adding processors, changing job payload contracts, or introducing/removing dispatch paths.
> **Last verified**: 2026-04-07

---

## Current Worker Surface

- **Queues**: `22` queue names in [apps/worker/src/base/queue.constants.ts](/Users/ram/Desktop/SDB/apps/worker/src/base/queue.constants.ts)
- **Processor files**: `95` live `*.processor.ts` files under [apps/worker/src/processors](/Users/ram/Desktop/SDB/apps/worker/src/processors)
- **Repeatable cron registrations**: `39` repeatable jobs registered in [apps/worker/src/cron/cron-scheduler.service.ts](/Users/ram/Desktop/SDB/apps/worker/src/cron/cron-scheduler.service.ts)
- **Architecture rule**: async communication is BullMQ-driven; there is no `EventEmitter2` event bus

### Core rules

- Most domain jobs require `tenant_id` and run inside `TenantAwareJob`
- Platform or cross-tenant jobs are the main exception: monitoring, security, some regulatory/compliance jobs, and scheduler-dispatch jobs
- The worker contract is broader than the API import graph: queue names, job names, shared schemas, and table shapes are all cross-process contracts

---

## Approval Callback System

Approval callbacks remain the most fragile side-effect chain in the platform.

### Live callback mapping

- `announcement_publish` -> `notifications` queue -> `communications:on-approval`
- `invoice_issue` -> `finance` queue -> `finance:on-approval`
- `payroll_finalise` -> `payroll` queue -> `payroll:on-approval`

### Callback lifecycle

1. `ApprovalRequestsService.approve()` sets the approval to `approved`
2. `callback_status` is tracked on the approval request
3. the mapped job is enqueued to the target queue
4. the callback processor performs the domain action
5. success marks the callback executed; failures are retried by `approvals:callback-reconciliation`

### Cross-file contract

Changing an approval type means updating all of:

- Prisma/shared enum surface
- approval callback mapping
- worker callback processor
- worker module registration
- callback reconciliation expectations

Missing any one of those leaves “approved but not actually executed” items in the system.

---

## Repeatable Jobs Registered In CronSchedulerService

### `early-warning`

- `early-warning:compute-daily` -> daily `01:00 UTC`
- `early-warning:weekly-digest` -> daily `07:00 UTC`

### `gradebook`

- `gradebook:detect-risks` -> daily `02:00 UTC`
- `report-cards:auto-generate` -> daily `03:00 UTC`

### `behaviour`

- `behaviour:refresh-mv-student-summary` -> every `15 min`
- `behaviour:refresh-mv-exposure-rates` -> daily `01:30 UTC`
- `behaviour:refresh-mv-benchmarks` -> daily `02:15 UTC`
- `behaviour:partition-maintenance` -> monthly `1st 00:00 UTC`
- `behaviour:cron-dispatch-daily` -> hourly
- `behaviour:cron-dispatch-sla` -> every `5 min`
- `behaviour:cron-dispatch-monthly` -> monthly `1st 01:00 UTC`
- `behaviour:notification-reconciliation` -> daily `05:00 UTC`

### `notifications`

- `notifications:dispatch-queued` -> every `30s`
- `communications:retry-failed-notifications` -> every `30s`
- `notifications:parent-daily-digest` -> hourly
- `monitoring:dlq-scan` -> every `15 min`
- `monitoring:canary-ping` -> every `5 min`

### `wellbeing`

- `wellbeing:cleanup-participation-tokens` -> daily `05:00 UTC`
- `wellbeing:eap-refresh-check` -> daily `06:00 UTC`
- `wellbeing:survey-closing-reminder` -> daily `08:00 UTC`
- `wellbeing:compute-workload-metrics` -> daily `03:30 UTC`

### `cleanup / privacy`

- `communications:ip-cleanup` -> daily `04:00 UTC`
- `imports:file-cleanup` -> daily `05:00 UTC`

### `security`

- `security:anomaly-scan` -> every `15 min`
- `security:breach-deadline` -> hourly

### `compliance`

- `data-retention:enforce` -> weekly Sunday `03:00 UTC`
- `compliance:deadline-check` -> daily `06:00 UTC`

### `regulatory`

- `regulatory:scan-tusla-thresholds` -> daily `06:00 UTC`
- `regulatory:check-deadlines` -> daily `07:00 UTC`

### `homework`

- `homework:generate-recurring` -> daily `05:00 UTC`
- `homework:overdue-detection` -> daily `06:00 UTC`
- `homework:digest-homework` -> daily `07:00 UTC`
- `homework:completion-reminder` -> daily `15:00 UTC`

### `approvals`

- `approvals:callback-reconciliation` -> daily `04:30 UTC`

### `engagement`

- `engagement:annual-consent-renewal` -> daily `04:15 UTC`
- `engagement:chase-outstanding` -> daily `09:00 UTC`
- `engagement:expire-pending` -> daily `00:00 UTC`
- `engagement:conference-reminders` -> daily `08:00 UTC`

### `pastoral`

- `pastoral:cron-dispatch-overdue` -> hourly

---

## Queue Inventory

### `admissions`

- `admissions:auto-expiry`
- **Current dispatch path**: no active enqueue site or repeatable registration was found in the current repo search outside the processor/tests
- **Implication**: the processor exists, but the automation path is presently undocumented and not discoverable from in-repo dispatch code

### `approvals`

- `approvals:callback-reconciliation`
- **Source**: cron scheduler
- **Side effects**: retries approval callbacks, updates callback health metadata, backstops announcement/invoice/payroll approval execution

### `attendance`

- `attendance:generate-sessions`
- `attendance:detect-pending`
- `attendance:auto-lock`
- `attendance:detect-patterns`
- **Observed fan-out**: `attendance:detect-patterns` can create attendance alerts, notifications, and early-warning recomputes
- **Current dispatch path**: processors exist, but no active enqueue or repeatable registration was found in the current repo search for these four job names

### `audit-log`

- `audit-log:write`
- **Source**: `AuditLogService.enqueue()`
- **Side effects**: writes mutation audit rows asynchronously so the global interceptor does not block request latency

### `behaviour`

- `behaviour:evaluate-policy`
- `behaviour:check-awards`
- `behaviour:suspension-return`
- `behaviour:detect-patterns`
- `behaviour:notification-reconciliation`
- `behaviour:task-reminders`
- `behaviour:refresh-mv-student-summary`
- `behaviour:refresh-mv-benchmarks`
- `behaviour:refresh-mv-exposure-rates`
- `behaviour:partition-maintenance`
- `behaviour:guardian-restriction-check`
- `behaviour:retention-check`
- `behaviour:cron-dispatch-daily`
- `behaviour:cron-dispatch-sla`
- `behaviour:cron-dispatch-monthly`
- `behaviour:document-ready`
- `behaviour:attachment-scan`
- `behaviour:break-glass-expiry`
- `safeguarding:critical-escalation`
- `safeguarding:sla-check`
- **Sources**: API incident/sanction/document flows, cron scheduler, safeguarding escalations, PDF callback flow
- **Major side effects**: sanctions, tasks, interventions, exclusion/appeal cascades, materialized-view refresh, parent notifications, legal-retention actions

### `compliance`

- `compliance:deadline-check`
- `data-retention:enforce`
- **Source**: cron scheduler
- **Side effects**: deadline warnings, retention execution orchestration
- **Important exception**: `compliance:execute` still runs on the `imports` queue, not the `compliance` queue

### `early-warning`

- `early-warning:compute-daily`
- `early-warning:compute-student`
- `early-warning:weekly-digest`
- **Sources**: cron scheduler plus worker fan-out from attendance, behaviour, and pastoral
- **Major side effects**: recalculates student risk profiles, tier transitions, routing/assignment outputs, weekly digests

### `engagement`

- `engagement:annual-consent-renewal`
- `engagement:chase-outstanding`
- `engagement:expire-pending`
- `engagement:conference-reminders`
- `engagement:distribute-forms`
- `engagement:generate-event-invoices`
- `engagement:cancel-event`
- `engagement:generate-trip-pack`
- **Sources**: cron scheduler plus API event/form actions
- **Major side effects**: form issuance, reminder fan-out, invoice generation, event cancellation rollback, trip-pack PDF generation

### `finance`

- `finance:on-approval`
- `finance:overdue-detection`
- **Sources**: approvals callback path for `finance:on-approval`
- **Current dispatch path note**: no active enqueue or repeatable registration was found in the current repo search for `finance:overdue-detection`

### `gradebook`

- `gradebook:detect-risks`
- `report-cards:auto-generate`
- `gradebook:bulk-import-process`
- `gradebook:mass-report-card-pdf`
- `report-cards:generate` _(impl 04 — Report Cards Redesign)_
- **Sources**: cron scheduler plus gradebook/report-card actions
- **Major side effects**: academic alerts, draft report cards, bulk result import, report-card PDF generation

#### `report-cards:generate` (impl 04)

- **Enqueued by**: `ReportCardGenerationService.generateRun` (POST `/v1/report-cards/generation-runs`) — triggered by the admin wizard submit step. Will also be invoked from impl 05's teacher-request approval flow when `auto_execute` is true.
- **Payload**:
  ```ts
  { tenant_id: string; user_id: string; batch_job_id: string; correlation_id?: string }
  ```
- **Processor**: `ReportCardGenerationProcessor` → `ReportCardGenerationJob extends TenantAwareJob`
- **Queue defaults**: `attempts=3`, `backoff=exponential 5s`, `removeOnComplete=100`, `removeOnFail=500` (inherits queue-level defaults)
- **Lock duration**: 5 minutes (long-running rendering + upload pipeline)
- **Flow**:
  1. Load the `ReportCardBatchJob` row by id (tenant-scoped) and move to `processing`.
  2. Resolve the scope from `scope_ids_json` + `scope_type` → student IDs (year_group / class / individual modes).
  3. Load the tenant, tenant settings, template, and optional Arabic template row.
  4. Load grade snapshots, finalised subject comments, finalised overall comments, and personal-info for the resolved students in bulk.
  5. For each student:
     - Build the `ReportCardRenderPayload` (English).
     - Call the injected `ReportCardRenderer` (`REPORT_CARD_RENDERER_TOKEN`) — bound to `PlaceholderReportCardRenderer` today; `ProductionReportCardRenderer` will swap in at impl 11.
     - Upload bytes via `ReportCardStorageWriter` (`REPORT_CARD_STORAGE_WRITER_TOKEN`) and upsert the `ReportCard` row keyed by (student, period, template, template_locale).
     - Delete the previous `pdf_storage_key` when the upsert replaces an existing row — overwrite semantics, no document version history.
     - If `student.preferred_second_language = 'ar'` AND the template has an Arabic locale row, repeat for `ar`.
     - On per-student error: append `{ student_id, message }` to `errors_json`, increment `students_blocked_count`, and continue.
  6. Update the batch job status to `completed` with final counters. Infrastructure-level failures (tenant or template not found) write `status = 'failed'` with `error_message`.
- **Major side effects**: PDF bytes written to object storage under `tenant/{tenant_id}/report-cards/{student_id}/{period_id}/{template_id}/{locale}.pdf`; `ReportCard` rows upserted; previous PDFs deleted (data loss — see `danger-zones.md`).
- **RLS**: `TenantAwareJob` sets `app.current_tenant_id` at the top of the transaction. All reads and writes stay inside the transaction.
- **DI bindings** (worker module):
  - `REPORT_CARD_RENDERER_TOKEN` → `PlaceholderReportCardRenderer` (production swap at impl 11)
  - `REPORT_CARD_STORAGE_WRITER_TOKEN` → `NullReportCardStorageWriter` (swap to S3 writer in production bootstrap)

### `homework`

- `homework:generate-recurring`
- `homework:overdue-detection`
- `homework:digest-homework`
- `homework:completion-reminder`
- **Sources**:
  - `generate-recurring` and `overdue-detection` are true cross-tenant cron jobs from `CronSchedulerService`
  - `digest-homework` and `completion-reminder` are also enqueued per-tenant by `behaviour:cron-dispatch-daily`
- **Critical note**: the homework digest/reminder processors require `tenant_id`, but `CronSchedulerService` also registers repeatable jobs for them with empty `{}` payloads. The per-tenant behaviour-dispatch path matches the processor contract; the direct cron registrations do not.

### `imports`

- `imports:validate`
- `imports:process`
- `imports:file-cleanup`
- `compliance:execute`
- **Sources**: import upload flow, cron scheduler, compliance execution
- **Major side effects**: file validation, data import, S3 cleanup, GDPR execution path

### `notifications`

- `communications:publish-announcement`
- `communications:on-approval`
- `communications:dispatch-notifications`
- `communications:retry-failed-notifications`
- `communications:inquiry-notification`
- `communications:stale-inquiry-detection`
- `communications:ip-cleanup`
- `behaviour:parent-notification`
- `behaviour:digest-notifications`
- `notifications:dispatch-queued`
- `notifications:parent-daily-digest`
- `monitoring:dlq-scan`
- `monitoring:canary-ping`
- `monitoring:canary-echo`
- `monitoring:canary-check`
- **Sources**: announcement publish flows, parent inquiries, retries, platform monitoring, behaviour/pastoral fan-out, cron scheduler
- **Major side effects**: this is the central delivery queue for almost every user-facing notification surface

### `pastoral`

- `pastoral:notify-concern`
- `pastoral:escalation-timeout`
- `pastoral:checkin-alert`
- `pastoral:intervention-review-reminder`
- `pastoral:overdue-actions`
- `pastoral:precompute-agenda`
- `pastoral:sync-behaviour-safeguarding`
- `pastoral:wellbeing-flag-expiry`
- `pastoral:cron-dispatch-overdue`
- **Sources**: concern/check-in/SST actions, cron scheduler, cross-module sync paths
- **Major side effects**: notifications, escalations, early-warning fan-out, overdue safeguarding backstops, agenda precompute

### `payroll`

- `payroll:on-approval`
- `payroll:generate-sessions`
- `payroll:mass-export-payslips`
- **Sources**: approval callbacks and payroll-run lifecycle actions
- **Major side effects**: run finalisation, payslip creation, export bundles

### `pdf-rendering`

- `pdf:render`
- **Source**: `PdfJobService`
- **Major side effects**: generates PDFs, uploads to S3, and triggers downstream callbacks such as `behaviour:document-ready`

### `regulatory`

- `regulatory:check-deadlines`
- `regulatory:scan-tusla-thresholds`
- `regulatory:generate-des-files`
- `regulatory:ppod-sync`
- `regulatory:ppod-import`
- **Sources**: cron scheduler plus on-demand regulatory actions
- **Major side effects**: deadline notifications, threshold scanning, returns file generation, PPOD sync/import flows

### `reports`

- no active processors currently discovered
- **Contract**: queue constant exists but the queue is presently reserved capacity rather than a live worker surface

### `scheduling`

- `scheduling:solve-v2`
- `scheduling:reap-stale-runs`
- **Sources**: scheduling solve actions for `solve-v2`
- **Current dispatch path note**: no active enqueue or repeatable registration was found in the current repo search for `scheduling:reap-stale-runs`

### `search-sync`

- `search:index-entity`
- `search:full-reindex`
- **Sources**: entity mutations and admin reindex actions
- **Major side effects**: Meilisearch indexing and tenant reindex operations

### `security`

- `security:anomaly-scan`
- `security:breach-deadline`
- `security:key-rotation`
- **Sources**: cron scheduler plus explicit key-rotation workflows
- **Major side effects**: platform incident creation/escalation and encryption-key rotation orchestration

### `wellbeing`

- `wellbeing:moderation-scan`
- `wellbeing:survey-open-notify`
- `wellbeing:survey-closing-reminder`
- `wellbeing:cleanup-participation-tokens`
- `wellbeing:eap-refresh-check`
- `wellbeing:compute-workload-metrics`
- **Sources**: survey activation/submission flows and cron scheduler
- **Major side effects**: moderation flags, staff notifications, anonymous-token cleanup, cached workload metrics

---

## Cross-Queue Chains To Respect

### Announcements

`ApprovalRequestsService` or direct publish -> `notifications` queue -> `communications:on-approval` or `communications:publish-announcement` -> `communications:dispatch-notifications`

### Behaviour discipline chain

API incident mutation -> `behaviour:evaluate-policy` -> sanctions/tasks/interventions/alerts -> notification rows -> `communications:dispatch-notifications` or `behaviour:parent-notification`

### Safeguarding escalation chain

critical concern -> `safeguarding:critical-escalation` -> self-reenqueue outside the DB transaction until acknowledgement or chain exhaustion

### Pastoral escalation chain

critical concern -> `pastoral:notify-concern` -> `pastoral:escalation-timeout` -> optional self-reenqueue + notification dispatch + early-warning recompute

### PDF callback chain

domain service -> `pdf:render` -> S3 upload -> downstream callback job such as `behaviour:document-ready`

### Parent delivery chain

domain code writes notification rows -> `notifications:dispatch-queued` or direct `communications:dispatch-notifications` -> provider dispatch -> retries via `communications:retry-failed-notifications`

---

## Live Drift And Risk Notes

### Homework dual-dispatch mismatch

- `homework:digest-homework` and `homework:completion-reminder` currently have two dispatch paths
- one is valid: per-tenant dispatch from `behaviour:cron-dispatch-daily`
- one is invalid: direct repeatable registration in `CronSchedulerService` with empty payloads even though the processors reject missing `tenant_id`

This is source-of-truth architecture now and should be treated as a live danger, not a documentation typo.

### Processor-exists vs dispatcher-exists is not the same thing

As of this verification pass, several processors exist without an obvious in-repo enqueue or cron-registration path for their jobs:

- `admissions:auto-expiry`
- `attendance:generate-sessions`
- `attendance:detect-pending`
- `attendance:auto-lock`
- `attendance:detect-patterns`
- `finance:overdue-detection`
- `scheduling:reap-stale-runs`
- `communications:stale-inquiry-detection`

That does not prove the flows are unused operationally, but it does mean the dispatch path is not discoverable from current application or worker code and should not be assumed active without further verification.

### Cross-tenant jobs must stay relation-filter free

Cross-tenant jobs such as `homework:generate-recurring`, `homework:overdue-detection`, `early-warning:compute-daily`, `notifications:dispatch-queued`, and `monitoring:dlq-scan` must avoid RLS-backed relation filters before tenant context is set.

### Monitoring is part of the architecture now

- `monitoring:dlq-scan` watches queue failure depth
- `monitoring:canary-ping`/`echo`/`check` verify critical queues respond within SLA

Changing queue names, critical-queue membership, or canary job IDs is a platform operation, not a local refactor.

---

## Practical Rule

Before changing any queue, job name, or payload:

1. update the processor
2. update every enqueue site
3. update cron registration if repeatable
4. update approval mappings if callback-driven
5. re-check the owning state machine and danger-zone entries

If one side changes and the other does not, the break is usually silent.
