# Event & Job Side-Effect Catalog

> **Purpose**: Before modifying any queue, job payload, cron registration, or approval callback, check here for the live side-effect graph.
> **Maintenance**: Update when adding processors, changing job payload contracts, or introducing/removing dispatch paths.
> **Last verified**: 2026-05-16 (Platform Dashboard Layer 1.5 Session 1.5B — added API-process platform error retention and platform audit hash-chain verification intervals); previously: 2026-05-13 (queue + cron audit — corrected inbox fallback cadence, added EXAM_SCHEDULING queue, removed three unimplemented Communications cron entries, fixed false claim that behaviour ack-reminders / exclusion-deadline-check are registered as crons); previously: 2026-04-27 (Communications Overhaul rebuild — Impl 14 sign-off baseline).

---

## Current Worker Surface

- **Queues**: `23` queue names in [apps/worker/src/base/queue.constants.ts](/Users/ram/Desktop/SDB/apps/worker/src/base/queue.constants.ts)
- **Processor files**: `120+` live `*.processor.ts` files under [apps/worker/src/processors](/Users/ram/Desktop/SDB/apps/worker/src/processors)
- **Repeatable cron registrations**: `~53` repeatable jobs registered in [apps/worker/src/cron/cron-scheduler.service.ts](/Users/ram/Desktop/SDB/apps/worker/src/cron/cron-scheduler.service.ts) (count includes per-tenant variance-refresh entries registered at runtime by `budgeting:variance-refresh-bootstrap`)
- **Architecture rule**: async communication is BullMQ-driven; there is no `EventEmitter2` event bus

## API Process Intervals

- `platform:health-snapshot` -> every `60s` in the API process via `HealthSnapshotService` (Session 1B). Calls `HealthService.check()`, persists `platform_health_snapshots`, publishes `platform:health` snapshot/state-change messages through `RedisPubSubService`, and prunes snapshots older than 7 days. This is intentionally not a BullMQ worker job because it monitors the API process's own dependencies and WebSocket-facing health state.
- `platform:alert-evaluation` -> every `30s` in the API process via `AlertEvaluationService` (Session 1C). Reads enabled `platform_alert_rules`, evaluates them against the current `HealthService.check()` result, writes `platform_alert_history`, sends configured email notifications through the existing tenant-scoped Resend provider when `PLATFORM_ALERT_EMAIL_TENANT_ID` is configured, publishes `platform:alerts` fired/resolved messages through `RedisPubSubService`, respects cooldown windows, tracks sustained conditions in API-process memory, and auto-resolves open alerts when conditions clear.
- `platform:error-log-retention` -> hourly API-process check in `PlatformErrorLogMaintenanceService`; executes once per UTC day after `04:00` when an active `platform_owner` actor can be resolved. Deletes `platform_error_log` rows where `last_seen_at` is older than 90 days and writes a blocking `platform_error_retention_purged` audit entry with the cutoff and purge count.
- `platform:audit-chain-verification` -> same hourly API-process maintenance loop; executes once per UTC day after `04:00`. Calls `PlatformAuditService.verifyChainIntegrity()` and publishes a critical `platform:alerts` message with `type='audit_integrity_broken'` if the append-only hash chain has a broken link.

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
- `inbox:fallback-check` -> every `15 min` (impl 07; cross-tenant, fans out `inbox:fallback-scan-tenant` per tenant)
- `communications:ip-cleanup` -> daily `04:00 UTC` (also listed under cleanup/privacy below)
- `comms:suppression-list-cleanup` -> daily `03:00 UTC` — cross-tenant; deletes `notification_suppression_list` rows whose `expires_at < now()`. Permanent suppressions (`expires_at IS NULL`) are never deleted. Owns: `suppression-list-cleanup.processor.ts`. Payload: `{}`. (Communications Overhaul Impl 06)

> **Planned (Comms Overhaul Impl 06–08 — NOT YET IMPLEMENTED).** No processor files exist in
> `apps/worker/src/processors/communications/` for these jobs and they are not registered in
> `CronSchedulerService`. Do not treat as live infrastructure:
>
> - `comms:domain-verification-refresh` (planned every `30 min`) — cross-tenant Resend domain status sync.
> - `comms:whatsapp-template-sync` (planned every `15 min`) — cross-tenant Twilio Content API sync.
> - `comms:whatsapp-service-window-cleanup` (planned daily `04:00 UTC`) — prune expired WhatsApp service windows.

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

### `reports`

- `reports:scheduled-run` -> every 15 min (Wave 3 / impl 08 — scheduled-reports tick, fans out per due saved-report into `reports:scheduled-deliver`)
- `reports:alert-evaluate` -> every 30 min (Wave 3 / impl 09 — cross-tenant tick that fans out per active tenant into `reports:alert-evaluate-tenant`)

### `finance`

- `finance:overdue-detection` -> daily `00:05 UTC` (cross-tenant; transitions issued/partially_paid invoices past due_date to `overdue`)
- `finance:reconcile-stripe-refunds` -> daily `03:00 UTC` (FIN-023; cross-tenant; logs drift between Stripe refunds and local refund rows for tenants with a Stripe config)

### `attendance`

The four attendance processors require `tenant_id`. Each cron is a cross-tenant dispatcher (empty payload) that iterates active tenants and enqueues per-tenant work:

- `attendance:cron-dispatch-generate` -> daily `04:30 UTC` (fans out `attendance:generate-sessions`)
- `attendance:cron-dispatch-patterns` -> daily `02:30 UTC` (fans out `attendance:detect-patterns`)
- `attendance:cron-dispatch-pending` -> daily `18:00 UTC` (fans out `attendance:detect-pending`)
- `attendance:cron-dispatch-lock` -> daily `23:00 UTC` (fans out `attendance:auto-lock`)

### `scheduling`

- `scheduling:reap-stale-runs` -> every minute (SCHED-029; scans `scheduling_runs` rows stuck in `running` past their budget and forces them to a terminal state)

### `budgeting`

- `budgeting:variance-refresh-bootstrap` -> daily `01:50 UTC` (cross-tenant bootstrap; iterates active tenants and registers per-tenant `budgeting:variance-refresh` repeatables at 02:00 in tenant timezone)
- `budgeting:shareable-link-cleanup` -> daily `03:00 UTC` (cross-tenant; hard-deletes `shareable_links` rows expired >30 days)

---

## Queue Inventory

### `admissions`

- `admissions:payment-expiry`
- **Source**: cron registered in `CronSchedulerService`, every 15 minutes (Wave 3 / impl 08)
- **Side effects**: scans applications where `status = 'conditional_approval' AND payment_deadline < now()`, reverts each to `waiting_list` (releasing the held seat), writes an internal note, notifies the parent the window lapsed, then calls `AdmissionsAutoPromotionService.promoteYearGroup` to FIFO-promote the next waiting applicant into the freed seat.

### `notifications` (admissions-owned jobs on the shared `notifications` queue)

- `admissions:payment-link`
- **Source**: `ApplicationStateMachineService.moveToConditionalApproval` enqueues this on transition to `conditional_approval`
- **Side effects**: worker processor `AdmissionsPaymentLinkProcessor` creates a Stripe Checkout Session (`unit_amount` = `application.payment_amount_cents`, metadata `{purpose: 'admissions', tenant_id, application_id, expected_amount_cents}`), stamps `application.stripe_checkout_session_id`, and enqueues an email `Notification` row with the payment URL
- **Idempotency**: append-only `admissions_payment_events` ledger keyed on Stripe `event.id`

- `admissions:auto-promoted`
- **Source**: `AdmissionsAutoPromotionService.promoteYearGroup` enqueues one job per application it promotes (fire-and-forget; failure degrades gracefully)
- **Side effects**: parent notification email that the application has moved from waiting list to ready-to-admit (processor implementation deferred — flagged in impl 09 follow-ups)
- **Tiered FIFO (household-numbers rebuild):** the underlying auto-promotion scan orders by `is_sibling_application DESC, apply_date ASC`. The notification payload is unchanged but the set of promoted applications differs under contention — siblings promote first within each (academic_year, year_group) bucket.

### `finance → admissions` webhook branch (not a queue)

- `StripeService.handleCheckoutCompleted` routes `metadata.purpose === 'admissions'` events to `handleAdmissionsCheckoutCompleted`, which dedups on the ledger, verifies the amount against `application.payment_amount_cents` (defence in depth), loads the application via `metadata.application_id`, then calls `ApplicationConversionService.convertToStudent` + `ApplicationStateMachineService.markApproved` inside a single interactive RLS transaction.

### `approvals`

- `approvals:callback-reconciliation`
- **Source**: cron scheduler
- **Side effects**: retries approval callbacks, updates callback health metadata, backstops announcement/invoice/payroll approval execution

### `attendance`

- `attendance:generate-sessions`
- `attendance:detect-pending`
- `attendance:auto-lock`
- `attendance:detect-patterns`
- `attendance:cron-dispatch-generate` / `cron-dispatch-patterns` / `cron-dispatch-pending` / `cron-dispatch-lock` (cross-tenant dispatchers — see Repeatable Jobs section above)
- **Observed fan-out**: `attendance:detect-patterns` can create attendance alerts, notifications, and early-warning recomputes
- **Current dispatch path**: the four per-tenant jobs are fanned out by the matching `attendance:cron-dispatch-*` cron, which iterates active tenants and enqueues one per-tenant payload each.

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
     - Call the injected `ReportCardRenderer` (`REPORT_CARD_RENDERER_TOKEN`) — bound to `ProductionReportCardRenderer` as of impl 11. The production renderer compiles a Handlebars template (editorial-academic or modern-editorial) with the `ReportCardRenderPayload` view model, then renders the resulting HTML to a PDF buffer via Puppeteer.
     - Upload bytes via `ReportCardStorageWriter` (`REPORT_CARD_STORAGE_WRITER_TOKEN`) and upsert the `ReportCard` row keyed by (student, period, template, template_locale).
     - Delete the previous `pdf_storage_key` when the upsert replaces an existing row — overwrite semantics, no document version history.
     - If `student.preferred_second_language = 'ar'` AND the template has an Arabic locale row, repeat for `ar`.
     - On per-student error: append `{ student_id, message }` to `errors_json`, increment `students_blocked_count`, and continue.
  6. Update the batch job status to `completed` with final counters. Infrastructure-level failures (tenant or template not found) write `status = 'failed'` with `error_message`.
- **Major side effects**: PDF bytes written to object storage under `tenant/{tenant_id}/report-cards/{student_id}/{period_id}/{template_id}/{locale}.pdf`; `ReportCard` rows upserted; previous PDFs deleted (data loss — see `danger-zones.md`).
- **RLS**: `TenantAwareJob` sets `app.current_tenant_id` at the top of the transaction. All reads and writes stay inside the transaction.
- **DI bindings** (worker module):
  - `REPORT_CARD_RENDERER_TOKEN` → `ProductionReportCardRenderer` (impl 11 — Handlebars + Puppeteer, ports `editorial-academic` and `modern-editorial` designs; bilingual EN/AR from the same template via view-model direction + translation table). Impl 12 removed the `PlaceholderReportCardRenderer` fallback; the production renderer is now the sole binding.
  - `PUPPETEER_LAUNCHER_TOKEN` → `DefaultPuppeteerLauncher` (dynamic `import('puppeteer')`, `--no-sandbox` args).
  - `TEMPLATE_DESIGN_RESOLVER_TOKEN` → `PrismaTemplateDesignResolver` — reads `reportCardTemplate.branding_overrides_json.design_key` (cached per process) to pick which template design to render; falls back to `editorial-academic` if the key is unset, unknown, or the lookup throws.
  - `REPORT_CARD_STORAGE_WRITER_TOKEN` → `NullReportCardStorageWriter` (swap to S3 writer in production bootstrap)
- **Template assets**: Handlebars `.hbs` source files live under `apps/worker/src/report-card-templates/{editorial-academic,modern-editorial}/index.hbs`; the nest-cli `assets` config copies them into `dist/` on build so the runtime `path.resolve` works in both dev (ts-node) and prod (compiled JS).

### `homework`

- `homework:generate-recurring`
- `homework:overdue-detection`
- `homework:digest-homework`
- `homework:completion-reminder`
- **Sources**:
  - `generate-recurring`, `overdue-detection`, `digest-homework`, and `completion-reminder` are all cross-tenant cron jobs from `CronSchedulerService` — each processor branches on `job.data.tenant_id` (direct cron = iterate all active tenants; per-tenant enqueue = single tenant) after the Wave 2 fix (2026-04-18).
  - `digest-homework` and `completion-reminder` are also enqueued per-tenant by `behaviour:cron-dispatch-daily` — still supported via the same branch.

### Homework publish notifications (synchronous, not queued)

- `HomeworkNotificationService.notifyOnPublish(tenantId, homeworkId)` fires inline from `HomeworkService.updateStatus` on every `draft → published` transition, and from the `POST /v1/homework/:id/notify` re-notify endpoint.
- **Flow**: resolve `class_parents` audience via `InboxModule.AudienceResolutionService` → call `CommunicationsModule.NotificationsService.createBatch` with `channel: 'in_app'`, `template_key: 'homework_assigned'`, `source_entity_type: 'homework_assignment'`, `source_entity_id: <homework_id>`.
- **Intentionally not queued**: in-app rows are cheap direct writes and the teacher expects immediate feedback in the confirmation toast; there is no multi-channel fan-out to defer to a worker. Notification failures are logged but do NOT roll back the publish — teachers can call `POST /v1/homework/:id/notify` to retry.
- **No email / SMS / WhatsApp**: homework notifications intentionally exclude paid third-party channels for per-message cost discipline. A future dedicated mobile app will deliver push notifications off the same in-app rows.

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

#### `communications:dispatch-notifications` locale rendering

System notification template rows resolve `t:`-prefixed keys against the per-locale
catalogues at `packages/shared/src/notifications/messages/notifications.{locale}.json`.
The catalogue currently ships eight locales: `en`, `ar`, `fr`, `es`, `de`, `ga`, `it`, `ro`.
Tenant override rows with non-null `tenant_id` continue to use raw Handlebars strings.

Locale resolution is stored on the `notifications.locale` row before dispatch. The worker
passes that locale into the renderer for email, SMS, and WhatsApp. The template lookup
chain inside `dispatch-notifications.processor.ts` is: tenant template at the requested
locale -> platform template at the requested locale -> for non-`en` locales only, platform
template at `en` (catalogue-backed). Missing `t:` keys throw `MISSING_NOTIFICATION_MESSAGE`;
missing catalogues throw `MISSING_NOTIFICATION_LOCALE`. There is no silent fallback to English
when the row's resolved locale catalogue itself is absent.

Dual-language household opt-in is applied when notification rows are emitted
through `NotificationsService.createBatch` (no new job — existing fan-out path).
Parent recipients linked to a household with `dual_language_opt_in=true` and a distinct,
tenant-supported `secondary_locale` receive two rows: the original locale first, then the
secondary locale. Idempotency keys, when present, are suffixed with `-{locale}` so the
unique constraint does not collapse the pair.

`notifications:parent-daily-digest` resolves each parent's locale from `User.preferred_locale`
(default `en`) and stamps it on every digest row. Student names render as `full_name_ar` when
locale is `ar` and the field is present; otherwise as `full_name`.

PDF jobs (`pdf:render`) do **not** carry a `locale` field on the queue payload — locale
selection happens upstream when the calling service builds the render payload (e.g.
`report-cards:generate` writes one row per `template_locale` and stores the locale on the
`ReportCard` row + S3 key path).

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

Job names + Redis status/PDF keys + TTLs are **all** sourced from `packages/shared/src/payroll/{job-names,redis-keys}.ts` (single source of truth shared between API enqueue sites and worker processors). Inline format strings on either side are blocked by the cross-path equivalence guard.

- `payroll:on-approval` (constant: `PAYROLL_ON_APPROVAL_JOB`) — approval-callback worker. Re-uses pre-computed entry totals written by `FinalisationService` and uses the shared `formatPayslipNumber` helper to emit `<PREFIX>-YYYYMM-NNNNNN` payslip numbers (canonical 6-digit padding). Mirrors `FinalisationService.finaliseAtomic` behaviour for the approval path.
- `payroll:session-generation` (constant: `PAYROLL_SESSION_GENERATION_JOB`) — counts `class_delivery_records` with `status = 'delivered'` bracketed to the run period (NOT raw `schedule.count()` as in pre-rebuild). Status surfaced via `buildSessionGenStatusKey(tenantId, runId)`, TTL `SESSION_GEN_STATUS_TTL_SECONDS`. Idempotency: `jobId: session-gen:{runId}`.
- `payroll:mass-export` (constant: `PAYROLL_MASS_EXPORT_JOB`) — renders all payslips in a finalised run to a single PDF; cached as a base64 buffer under `buildMassExportPdfKey(tenantId, runId)` with TTL `MASS_EXPORT_PDF_TTL_SECONDS = 1200` (20 min). Status under `buildMassExportStatusKey(tenantId, runId, locale)`. Idempotency: `jobId: mass-export:{runId}:{locale}`. Default 3 retries with exponential backoff at the API enqueue site.
- **Sources**: approval callbacks (`payroll:on-approval`); `payroll-runs.service.triggerSessionGeneration` (`payroll:session-generation`); `payslips.service.triggerMassExport` (`payroll:mass-export`)
- **Major side effects**: run finalisation (delegates to `FinalisationService.finaliseAtomic` — single source of truth), payslip creation, two-phase recurring-deduction application (`payroll_deduction_applications`), export bundles cached in Redis

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

- `reports:export-batch`
  - **Source**: `ReportExportService` enqueues this when a synchronous export's row count exceeds 5 000 (Wave 2 / impl 04).
  - **Side effects**: stub render → upload → deliver pipeline (full body lands in Wave 3 / impl 13).
- `reports:scheduled-run`
  - **Source**: cron registered in `CronSchedulerService` (every 15 min, Wave 3 / impl 08).
  - **Side effects**: scans `scheduled_reports` rows whose `next_run_at <= now()`, fans out `reports:scheduled-deliver` per due saved report.
- `reports:scheduled-deliver`
  - **Source**: enqueued by `reports:scheduled-run` (Wave 3 / impl 08) per due report.
  - **Side effects**: executes the saved report query, renders the configured export format, delivers via email + inbox, writes a `scheduled_report_runs` row with the outcome.
- `reports:alert-evaluate`
  - **Source**: cron registered in `CronSchedulerService` (every 30 min, Wave 3 / impl 09).
  - **Side effects**: dispatcher only — reads active tenants and fans out `reports:alert-evaluate-tenant` per tenant. Does no DB writes itself.
- `reports:alert-evaluate-tenant`
  - **Source**: enqueued by `reports:alert-evaluate` (Wave 3 / impl 09) per active tenant.
  - **Side effects**: per-tenant evaluator inside a `TenantAwareJob` transaction (RLS context set). For every enabled `report_alert` for that tenant: runs the registered metric calculator (8 calculators today — `overdue_invoices_count`, `attendance_rate_today`, `open_safeguarding_concerns_count`, `at_risk_students_count`, `unpaid_balance_total`, `behaviour_incidents_week`, `teacher_submission_compliance_week`, `cover_gaps_week`), applies the alert's operator (`gt | gte | lt | lte | eq | ne`) to the threshold, applies 24-hour anti-spam suppression (a `threshold_crossed` outcome inside the window without an intervening `ok` is recorded as `threshold_crossed` with `notified_user_ids: []` so the run is logged but no notification fires), creates `Notification` rows (channel `in_app`, template `reports.alert_threshold_crossed`) for each resolved recipient, and updates `report_alerts.last_measured_value` (and `last_triggered_at` only when a notification actually dispatched). Every tick writes a `report_alert_runs` row with `outcome ∈ {ok, threshold_crossed, error}`.
  - **Recipient resolution**: alert's `notification_recipients_json` (string-array of emails) is resolved to user IDs via `tenant_memberships` (membership_status = active). Emails with no matching active member are silently skipped.
- **Routing**: all four jobs land on the shared `REPORTS` queue. The single `@Processor(QUEUE_NAMES.REPORTS)` (`ReportsExportBatchProcessor`) is a thin dispatcher that switches on `job.name` to per-job `@Injectable()` handlers — `ReportsExportBatchHandler`, `ScheduledReportsTickProcessor`, `ScheduledReportsDeliverProcessor`, `ReportAlertsHandler`. This pattern eliminates the DZ-48 race where multiple `@Processor(REPORTS)` classes silently dropped jobs to a competitive-consumer winner.

### `exam-scheduling`

- `scheduling:exam-solve` (constant `EXAM_SOLVE_JOB`)
- **Source**: `ExamSolverOrchestrationService.startSolve` (POST trigger from `apps/api/src/modules/scheduling/exam-solver-orchestration.service.ts`) enqueues onto the `exam-scheduling` queue.
- **Payload**: `{ tenant_id: string; solve_job_id: string; exam_session_id: string }` (extends `TenantJobPayload`).
- **Processor**: `ExamSolverProcessor` (`apps/worker/src/processors/scheduling/exam-solver.processor.ts`) → `ExamSolverRunner extends TenantAwareJob`.
- **Queue defaults**: `lockDuration=600_000`, `stalledInterval=60_000`, `maxStalledCount=2`; `removeOnComplete=50`, `removeOnFail=100`. Outer transaction timeout raised to 600s to cover the worst-case sidecar budget (450s solver + slack).
- **Side effects**: claims the `exam_solve_jobs` row (`queued → running`), POSTs a `ExamSolverInput` to the CP-SAT exam sidecar (`SOLVER_PY_URL` default `http://localhost:5557`), heartbeats every 60s by extending the BullMQ lock and bumping `exam_solve_jobs.updated_at`, then in a fresh tx replaces all `exam_slots` for the session and writes `exam_slot_rooms` + `exam_invigilations` per assignment. Always replaces, never merges. On failure marks the run `failed` with `failure_reason`.
- **Cross-module note**: separate queue from `scheduling` so the long exam solve cannot starve timetable work.

### `scheduling`

- `scheduling:solve-v2`
- `scheduling:reap-stale-runs`
- **Sources**: `SchedulingRunsService.triggerRun` enqueues `scheduling:solve-v2` after a `POST /v1/scheduling/runs/trigger`. `scheduling:reap-stale-runs` is registered as a minute-interval cron in `CronSchedulerService` (SCHED-029) and also runs on worker startup via the `SchedulingStaleReaperJob`.
- **Out-of-band cancellation path** (Stage 9.5.1 post-close amendment): `scheduling:solve-v2` jobs POST a `SolverInputV2` to the CP-SAT sidecar at `POST {SOLVER_PY_URL}/solve` with an `X-Request-Id` header matching the `run_id`. When the worker's `AbortController` fires (HTTP timeout reached), `packages/shared/src/scheduler/cp-sat-client.ts` issues a **fire-and-forget** `DELETE {SOLVER_PY_URL}/solve/{run_id}` before rethrowing `CP_SAT_UNREACHABLE`. The sidecar's in-process registry (keyed on the request id) raises a `threading.Event` cancel flag; `EarlyStopCallback` halts CP-SAT on its next solution callback with `early_stop_reason="cancelled"`. Without this hook an abandoned solve keeps computing to completion and blocks the next request — which is the exact failure mode NHQS smoke reproduced during Stage 9.5.1. Operators debugging a stuck solve can also fire the DELETE manually against the sidecar URL.
- **Cross-module note**: the worker's outer `TenantAwareJob` transaction has a raised timeout ceiling (3780 s) to avoid Prisma `Transaction already closed` errors at long budget settings — see `docs/architecture/danger-zones.md` → DZ-Scheduling-1.

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

### `notifications` (inbox-owned jobs on the shared `notifications` queue)

- `inbox:dispatch-channels`
- **Source**: `InboxChannelDispatcher.fanOut` (impl 06) — enqueued by `ConversationsService.sendMessage` and `ConversationsService.createConversation` after a successful interactive-transaction commit
- **Payload**: `{ tenant_id, conversation_id, message_id, sender_user_id, channels[], disable_fallback, audience_user_ids? }`
- **Side effects**: fan a message onto the opt-in extra channels (`sms`, `email`, `whatsapp`) by creating `Notification` rows and handing off to `communications:dispatch-notifications`. The inbox itself is NOT a channel fanned out here — inbox delivery is synchronous on the initial write (every recipient has a `conversation_participants` row created inside the transaction)
- **Idempotency**: keyed on `(conversation_id, message_id, channel)` — re-enqueues are no-ops

- `inbox:fallback-check`
- **Source**: cron registered in `CronSchedulerService.registerInboxCronJobs` every 15 minutes (impl 07; `repeat: { pattern: '*/15 * * * *' }`)
- **Payload**: `{}` (cross-tenant scan)
- **Side effects**: iterates tenants with `tenant_settings_inbox.fallback_enabled = true`, enqueues one `inbox:fallback-scan-tenant` job per tenant
- **Guard**: skips tenants with `messaging_enabled = false`

- `inbox:fallback-scan-tenant`
- **Source**: enqueued by `inbox:fallback-check` per tenant, or manually by the debug `POST /v1/inbox/settings/fallback/test` endpoint (not yet implemented — see impl 15 follow-up)
- **Payload**: `{ tenant_id }`
- **Side effects**: scans `messages` where `created_at < now() - fallback_after_hours` and the sender/scope matches the configured fallback class (admin broadcast vs teacher message), filters out recipients who already opened the inbox (`message_reads` row), creates `Notification` rows for the remaining recipients on the configured channels, stamps `messages.fallback_dispatched_at` so the message is not re-evaluated
- **Idempotency**: `fallback_dispatched_at` acts as a once-only marker; the scan also skips messages with `disable_fallback = true`

### `safeguarding`

- `safeguarding:scan-message`
- **Source**: `ConversationsService.sendMessage` enqueues one per inbound message (impl 08) — ALWAYS fires, regardless of sender role, when `tenant_settings_inbox.safeguarding_scan_enabled = true`
- **Payload**: `{ tenant_id, conversation_id, message_id, sender_user_id, body }`
- **Side effects**: loads `safeguarding_keywords` for the tenant (cached 5 min), runs a case-insensitive word-boundary match against the message body, and when a match is found: creates a `message_flags` row (`review_state = 'pending'`, `severity = MAX(matched.severity)`, `matched_keywords[] = [...]`), writes an `oversight_access_log` entry tagged `flag_created`, and enqueues `safeguarding:notify-reviewers`
- **Retention**: does NOT store message body on the flag row — privacy. The body is re-read from `messages` when the admin opens the flag, and the `SafeguardingAlertsWidget` never renders it
- **Idempotency**: unique index on `(message_id)` so re-scans are no-ops

- `safeguarding:notify-reviewers`
- **Source**: enqueued by `safeguarding:scan-message` when a flag is created
- **Payload**: `{ tenant_id, flag_id, severity }`
- **Side effects**: resolves the set of users in the tenant with `inbox.oversight.read` via `RbacReadFacade.findMembershipsWithPermissionAndUser` (admin tier — owner, principal, vice principal), and creates `Notification` rows on the configured severity-routed channels. High-severity flags escalate via email even if the admin's usual channel preference is inbox-only
- **Cache**: the reviewer set is resolved at flag time, not cached — role changes propagate immediately

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

### Wellbeing notification dispatch chain (rebuild Impl 04)

behaviour / pastoral / safeguarding / staff-wellbeing service (post-commit) -> `WellbeingNotificationsService.dispatch(event, recipients)` -> in-app inbox `Notification.create` (always-on) + per-event channel lookup via `tenant_notification_preferences.wellbeing_channels` -> optional email / SMS / WhatsApp stub providers (throw `PROVIDER_NOT_WIRED`, swallowed by `safeDispatch`). Event keys: `incident.logged`, `incident.escalated`, `concern.raised`, `concern.acknowledged`, `sanction.scheduled`, `sanction.served`, `sla.breach`, `critical.declared`, `appeal.submitted`, `appeal.decided`, `recognition.awarded`, `document.sent_to_parent`, `amendment.sent`, `reminder.acknowledgement`, + 4 more. **Workers currently bypass this chain**: `BehaviourExclusionDeadlineCheckProcessor` and `BehaviourAckRemindersProcessor` write in-app notifications directly because they don't import `WellbeingNotificationsModule`. Downstream per-tenant email/SMS/WhatsApp fan-out won't fire for worker-originated events until the worker wires this in (impl 07 follow-up).

### Behaviour document lifecycle (rebuild Impl 06 + 20)

API `POST /behaviour/documents` -> creates `behaviour_documents` row in `generating` -> enqueues `pdf:render` -> PDF renders + S3 upload -> `behaviour:document-ready` callback marks `status: draft_doc` + stores signed URL metadata -> admin hits `/:id/finalise` -> status `finalised` -> admin hits `/:id/send` -> fans out to parents per channel -> post-commit `WellbeingNotificationsService.dispatch({ event: 'document.sent_to_parent' })` writes in-app rows. Dispatch failure is logged but does not roll back the `sent_doc` transition. Preview uses separate 1h signed URL; download uses 15 min signed URL.

### Behaviour exclusion lifecycle (rebuild Impl 07)

Named endpoints: `/issue-notice` (`initiated → notice_issued`, auto-generates document via `BehaviourDocumentService.autoGenerateDocument`), `/schedule-hearing` (`notice_issued → hearing_scheduled`), `/record-hearing` (`hearing_scheduled → hearing_held`), `/finalise`, `/overturn`. Each fires a post-commit `WellbeingNotificationsService.dispatch` for the active parent users of the student. Two cron-driven processors feed this: `behaviour:exclusion-deadline-check` (iterates open exclusion cases, creates `appeal_review` tasks and `sla.breach` in-app notifications when statutory deadlines pass) and `behaviour:ack-reminders` (writes `reminder.acknowledgement` in-app for unacknowledged records). **Neither job is registered directly in `CronSchedulerService`.** Both are dispatched per-tenant by `BehaviourCronDispatchProcessor` (`apps/worker/src/processors/behaviour/cron-dispatch.processor.ts`) inside the hourly `behaviour:cron-dispatch-daily` fan-out: `behaviour:ack-reminders` enqueues for each tenant when its local time is `09:00`, and `behaviour:exclusion-deadline-check` enqueues for every active behaviour-enabled tenant when the current UTC hour is `0`, `6`, `12`, or `18`. Per-tenant jobIds use the `daily:` / `6h:` prefix patterns in that processor (e.g. `daily:behaviour:ack-reminders:{tenant_id}`, `6h:behaviour:exclusion-deadline-check:{tenant_id}:{utcHour}`).

### Inbox fan-out chain

`ConversationsService.sendMessage` (interactive RLS tx) writes `messages` + `message_reads` snapshot + `conversation_participants` rows -> commit -> enqueues `safeguarding:scan-message` (always) + `inbox:dispatch-channels` (if extra channels ticked) -> `inbox:dispatch-channels` creates `Notification` rows on `sms`/`email`/`whatsapp` and hands off to `communications:dispatch-notifications` -> every 15 minutes `inbox:fallback-check` fans out to `inbox:fallback-scan-tenant` per tenant -> `inbox:fallback-scan-tenant` escalates unread messages past the window to the configured fallback channels and stamps `messages.fallback_dispatched_at`. Safeguarding flags land via `safeguarding:scan-message` -> `safeguarding:notify-reviewers` -> `Notification` rows for admin-tier users.

### Parent delivery chain

domain code writes notification rows -> `notifications:dispatch-queued` or direct `communications:dispatch-notifications` -> provider dispatch -> retries via `communications:retry-failed-notifications`

---

## Live Drift And Risk Notes

### Homework dual-dispatch mismatch — ✅ RESOLVED 2026-04-18 (Wave 2)

- `homework:digest-homework` and `homework:completion-reminder` processors now branch on `tenant_id` presence: direct cron (empty payload) iterates `Tenant.findMany({ status: 'active' })` and runs per-tenant; behaviour-dispatch path (with explicit `tenant_id`) runs for that tenant only. Both paths are now valid.

### Processor-exists vs dispatcher-exists is not the same thing

As of the 2026-05-13 audit pass, the following processors exist without an obvious in-repo enqueue or cron-registration path for their jobs:

- `communications:stale-inquiry-detection`

That does not prove the flow is unused operationally, but the dispatch path is not discoverable from current application or worker code and should not be assumed active without further verification.

(Previously this list also contained the four `attendance:*` jobs, `finance:overdue-detection`, and `scheduling:reap-stale-runs` — all of those are now confirmed live cron-driven, see the Repeatable Jobs section above.)

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

---

## Budgeting

The Budgeting module owns one queue (`budgeting`) with three job types, all
gated by the `BudgetingQueueDispatcher` `@Processor` that routes by job name
to avoid the DZ-48 race (sibling processors on the same queue racing to
claim each other's work).

### budgeting:variance-refresh

- **Queue**: `budgeting`
- **Schedule**: cron — daily at 02:00 in tenant timezone (registered per-tenant
  by `budgeting:variance-refresh-bootstrap` on worker startup)
- **Payload**: `{ tenant_id }`
- **Trigger**: cron only; manual trigger via the variance dashboard's
  "Refresh now" button enqueues with the same payload
- **Side effects**: rewrites `variance_cache` rows for the tenant's active
  models (`status='published'`, `fiscal_year_start <= now <= fiscal_year_end`).
  Idempotent — wipes the model's cache rows and rewrites them per refresh.
  Wrapped in `createRlsClient(...).$transaction()`.
- **Fan-out**: cron iterates active tenants; per-tenant work iterates active
  models inside the tenant's RLS context.

### budgeting:variance-refresh-bootstrap

- **Queue**: `budgeting`
- **Schedule**: cross-tenant cron at `50 1 * * *` (so all tenants are
  registered before the 02:00 wave fires)
- **Payload**: `{}`
- **Trigger**: `CronSchedulerService`
- **Side effects**: iterates active tenants and registers per-tenant
  `budgeting:variance-refresh` repeatables at 02:00 in `tenant.timezone`.
  Idempotent across runs (BullMQ deduplicates by `jobId`).

### budgeting:board-pack-render

- **Queue**: `budgeting`
- **Schedule**: on-demand
- **Payload**: `{ tenant_id, snapshot_id, format: 'pdf' | 'excel' | 'all' }`
- **Trigger**:
  - `POST /v1/budgeting/financial-models/:id/snapshots/:sid/exports/regenerate`
    enqueues with `format: 'all'`
  - `SnapshotsService.publish` enqueues automatically post-publish so the
    board pack is ready by the time a user asks for it
  - `GET …/exports/(pdf|excel)` enqueues lazily if the snapshot has no
    `pdf_object_key` / `excel_object_key` yet
- **Side effects**: renders PDF (Puppeteer + branded HTML template) and/or
  Excel (multi-sheet exceljs workbook) and uploads to
  `tenants/${tenantId}/budgeting/snapshots/${snapshotId}/board-pack-v${N}.{pdf,xlsx}`
  in Hetzner object storage; updates the snapshot row's `pdf_object_key`,
  `excel_object_key`, and `rendered_at`. Snapshot rows are otherwise
  immutable — these three fields are the only mutations allowed post-publish.
- **Render time**: typically 5–30s; large models (5k+ line items) can take
  60–90s. Async via this queue so the API thread isn't blocked.

### budgeting:shareable-link-cleanup

- **Queue**: `budgeting`
- **Schedule**: cron — daily at 03:00 UTC (cross-tenant)
- **Payload**: `{}`
- **Trigger**: cron only
- **Side effects**: hard-deletes `shareable_links` rows where
  `expires_at < now() - 30 days`. Per `modeling/PLAN.md §11.2`, links that
  have been expired for more than 30 days are not retrievable in the audit
  trail (the password hash is wiped at the same time).
- **Fan-out**: single cross-tenant query; doesn't iterate tenants explicitly
  (the `expires_at` filter is global).

## Inbound Webhook Flow (Communications Overhaul Impl 06)

Three new public endpoints receive provider events and update notification status. **Per-tenant signature verification is mandatory** (`danger-zones.md` DZ-Comms-3).

### Routes

- `POST /v1/webhooks/communications/email/:tenantId` — Resend events.
- `POST /v1/webhooks/communications/sms/:tenantId` — Twilio status callback (SMS).
- `POST /v1/webhooks/communications/whatsapp/:tenantId` — Twilio status callback (WhatsApp).

### Flow per request

1. Lookup tenant config row by `:tenantId` path param. Decrypt `webhook_secret_encrypted`.
2. Verify signature: Resend uses `Svix-Signature` (HMAC-SHA256 of `{svix_id}.{svix_timestamp}.{body}`). Twilio uses `X-Twilio-Signature` (HMAC-SHA1 of URL + sorted form params, signed with the tenant's `twilio_auth_token`). On signature failure: write `notification_webhook_events` with `signature_verified=false`, return 401.
3. On success: write `notification_webhook_events` with `signature_verified=true`, full payload preserved as JSON.
4. Resolve the matching `notification` row by `provider_message_id` (Resend `email_id` / Twilio `MessageSid`). If no match: log + return 200 (event preserved for replay).
5. Update `notification.status` per the event type (see `notification.status` state machine in `state-machines.md`).
6. On hard bounce or complaint: insert row into `notification_suppression_list` with `reason='hard_bounce'` or `reason='complaint'`. Future sends to this recipient are skipped.
7. For WhatsApp inbound: also update `whatsapp_service_windows.last_inbound_at = now()` and `expires_at = now() + 24h`.

### Failure modes

- Missing `webhook_secret`: every event for the tenant is rejected. See DZ-Comms-3.
- Provider signature mismatch (e.g. tenant rotated their auth token without updating the webhook secret): events queue up in `notification_webhook_events` with `signature_verified=false` and never advance the matching `notification.status`. Operator can replay once the secret is fixed.
- Notification not found: event preserved in `notification_webhook_events` for forensics. Status update is skipped.

## Cache Invalidation Pub/Sub (Communications Overhaul Impl 04)

`CommsCacheBusService` wraps a Redis pub/sub channel `comms:config-changed` with a fixed payload shape:

```json
{ "tenant_id": "<uuid>", "channel": "email | sms | whatsapp" }
```

### Publishers

- `EmailConfigService.upsertConfig` / `deleteConfig`
- `SmsConfigService.upsertConfig` / `deleteConfig`
- `WhatsAppConfigService.upsertConfig` / `deleteConfig`

### Subscribers (one per process)

- API process — invalidates the per-tenant client cache held inside `ResendEmailProvider`, `TwilioSmsProvider`, `TwilioWhatsAppProvider`.
- Worker processes — same; the worker mirrors the providers.

### Failure modes

If Redis is unhealthy at the moment of a credential rotation, the publish silently no-ops. The cache TTL (30-min idle eviction) eventually evicts the stale client. See DZ-Comms-1.
