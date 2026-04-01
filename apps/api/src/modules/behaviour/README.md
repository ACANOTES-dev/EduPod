# Behaviour

## Purpose

Manages the full student behaviour lifecycle: incident logging, sanctions, appeals, exclusions, safeguarding concerns, recognition/awards, interventions, and parent notifications. The largest and most complex module in the codebase (~214 endpoints across 17 controllers).

## Public API (Exports)

- `BehaviourService` — incident CRUD, quick-log
- `BehaviourConfigService` — categories, templates, module settings
- `BehaviourStudentsService` — student behaviour profiles and history views
- `BehaviourScopeService` — resolves which students a user can see based on role/class scope
- `BehaviourHistoryService` — entity history audit trail (exported for PolicyEngineModule via forwardRef)
- `SafeguardingService` — safeguarding concern top-level operations
- `SafeguardingConcernsService` — concern CRUD and state transitions
- `BehaviourSanctionsService` — sanction lifecycle
- `BehaviourExportService` — data export
- `BehaviourAnalyticsService` — analytics queries against materialized views

## Inbound Dependencies (What this module imports)

- `AuthModule` — guards, permission cache
- `ApprovalsModule` — approval request creation from automated policy actions
- `ChildProtectionModule` — CP record linking from safeguarding concerns
- `GdprModule` — AI tokenisation (`GdprTokenService`), GDPR consent gating (`ConsentService`), AI audit (`AiAuditService`)
- `PastoralModule` — cross-module concern sync
- `SequenceModule` — incident/sanction/appeal/exclusion sequence numbers
- `PdfRenderingModule` — Puppeteer PDF generation for behaviour documents
- `S3Module` — S3 storage for generated documents and attachments
- `PolicyEngineModule` — policy evaluation engine (via `forwardRef`)
- BullMQ queues: `notifications`, `behaviour`, `search-sync`

## Outbound Consumers (Who imports this module)

- No external NestJS module imports BehaviourModule directly
- Worker processors (evaluate-policy, notify-concern, attendance-pattern-detection) enqueue `early-warning:compute-student` jobs as side effects

## BullMQ Queues

**Queue: `behaviour`** (3 retries, 5s exponential)

- `behaviour:evaluate-policy` — runs policy engine after incident creation
- `behaviour:check-awards` — checks point thresholds for award eligibility
- `behaviour:suspension-return` — handles scheduled suspension return actions
- `behaviour:detect-patterns` — detects repeat behaviour patterns
- `behaviour:task-reminders` — reminds staff of outstanding behaviour tasks
- `behaviour:break-glass-expiry` — expires timed safeguarding break-glass grants
- `behaviour:guardian-restriction-check` — enforces guardian communication restrictions
- `behaviour:attachment-scan` — virus/content scan for uploaded attachments
- `behaviour:retention-check` — monthly GDPR retention enforcement
- `behaviour:partition-maintenance` — creates new table partitions
- `behaviour:refresh-mv-student-summary`, `behaviour:refresh-mv-benchmarks`, `behaviour:refresh-mv-exposure-rates` — materialized view refreshes
- `safeguarding:critical-escalation` — escalation chain for critical safeguarding concerns
- `safeguarding:sla-check` — SLA breach detection for safeguarding concerns
- Cron dispatchers: `behaviour:cron-dispatch-daily`, `behaviour:cron-dispatch-sla`, `behaviour:cron-dispatch-monthly`

**Queue: `notifications`** — parent notifications, sanction notices, appeal outcomes, correction notices, digest

## Cross-Module Prisma Reads

Reads directly (not via service injection): `students`, `student_parents`, `class_staff`, `class_enrolments`, `academic_years`, `academic_periods`, `subjects`, `rooms`, `schedules`, `tenant_settings`, `users`, `staff_profiles`, `parents`, `year_groups`, `notifications`, `behaviour_publication_approvals`

## Key Danger Zones

- **DZ-13**: Incident status `converted_to_safeguarding` must be projected as `closed` at every surface — API, exports, parent portal, search index. Always call `projectIncidentStatus()`.
- **DZ-14**: Parent notification send-gate: negative incidents may silently stay at `pending` if `parent_description` is missing.
- **DZ-15**: Last-student-participant constraint enforced at DB level (`trg_prevent_last_student_participant`). Never drop this trigger.
- **DZ-16**: Scope resolution depends on `ClassStaff` and `ClassEnrolment` being current.
- **DZ-17**: Appeal decision cascades across 6 tables in one transaction — timeout risk on complex decisions.
- **DZ-18**: Exclusion cases and appeals auto-set legal holds, blocking GDPR anonymisation.
- **DZ-19**: Puppeteer PDF runs inside API transaction — holds DB connection for 1-5 seconds.
- **DZ-22**: Partition maintenance uses `$executeRawUnsafe` — table names must always come from constants, never user input.
- **DZ-24**: Check-awards processor can create duplicate awards under true concurrency for `unlimited` repeat mode.
