# P8 Results — Approvals, Compliance, Analytics, Exports

## Summary

Phase 8 delivered cross-domain approval execution callbacks (Mode A auto-execute for announcements, invoices, payroll), a real audit log implementation replacing the P0 no-op interceptor, compliance/GDPR tooling (access export, erasure, anonymisation), a bulk CSV import engine for 6 entity types, search index status tracking with nightly reconciliation, 6 new analytics report endpoints and pages, parent engagement tracking instrumentation, and a reports hub consolidating all reports. The audit log interceptor now captures all POST/PUT/PATCH/DELETE mutations with sanitized metadata (sensitive fields redacted). The approval system dispatches background callback jobs for Mode A action types when approvals are granted.

## Database Migrations

- **Migration**: `20260316260000_add_p8_audit_compliance_import_search`
- **Tables created**:
  - `audit_logs` — 9 columns (`id`, `tenant_id` nullable, `actor_user_id`, `entity_type`, `entity_id`, `action`, `metadata_json`, `ip_address`, `created_at`); append-only (no `updated_at`); dual RLS policy (allows NULL tenant_id for platform-level actions)
  - `compliance_requests` — 12 columns (`id`, `tenant_id`, `request_type`, `subject_type`, `subject_id`, `requested_by_user_id`, `status`, `classification`, `decision_notes`, `export_file_key`, `created_at`, `updated_at`); standard RLS
  - `import_jobs` — 9 columns (`id`, `tenant_id`, `import_type`, `file_key`, `status`, `summary_json`, `created_by_user_id`, `created_at`, `updated_at`); standard RLS
  - `search_index_status` — 6 columns (`id`, `tenant_id`, `entity_type`, `entity_id`, `index_status`, `updated_at`); standard RLS; unique constraint on `(tenant_id, entity_type, entity_id)`
- **Enums created**: `ComplianceRequestType` (access_export, erasure, rectification), `ComplianceSubjectType` (parent, student, household, user), `ComplianceRequestStatus` (submitted, classified, approved, rejected, completed), `ComplianceClassification` (erase, anonymise, retain_legal_basis), `ImportType` (students, parents, staff, fees, exam_results, staff_compensation), `ImportStatus` (uploaded, validated, processing, completed, failed), `SearchIndexStatusEnum` (pending, indexed, search_failed)
- **RLS policies**: 4 total — dual policy on `audit_logs` (NULL tenant_id OR matching tenant), standard isolation on `compliance_requests`, `import_jobs`, `search_index_status`
- **Triggers**: `set_updated_at` on `compliance_requests`, `import_jobs`, `search_index_status`
- **Indexes**: `idx_audit_logs_tenant_entity`, `idx_audit_logs_tenant_actor`, `idx_audit_logs_created`, `idx_compliance_requests_tenant`, `idx_import_jobs_tenant`, `idx_search_index_status_unique` (unique), `idx_search_index_status_pending`

## API Endpoints

### Audit Log

| Method | Path                       | Permission       | Description                                                                         |
| ------ | -------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| GET    | `/api/v1/audit-logs`       | `analytics.view` | List tenant-scoped audit logs with filters (entity_type, actor, action, date range) |
| GET    | `/api/v1/admin/audit-logs` | `tenants.view`   | Platform admin: list all audit logs cross-tenant with tenant_id filter              |

### Engagement Tracking

| Method | Path                       | Permission    | Description                                               |
| ------ | -------------------------- | ------------- | --------------------------------------------------------- |
| POST   | `/api/v1/engagement/track` | authenticated | Track parent/user engagement events (page views, actions) |

### Compliance

| Method | Path                                       | Permission          | Description                                                             |
| ------ | ------------------------------------------ | ------------------- | ----------------------------------------------------------------------- |
| POST   | `/api/v1/compliance-requests`              | `compliance.manage` | Create a new compliance request (access_export, erasure, rectification) |
| GET    | `/api/v1/compliance-requests`              | `compliance.view`   | List compliance requests with status filter, paginated                  |
| GET    | `/api/v1/compliance-requests/:id`          | `compliance.view`   | Get single compliance request detail                                    |
| POST   | `/api/v1/compliance-requests/:id/classify` | `compliance.manage` | Classify a submitted request (erase/anonymise/retain_legal_basis)       |
| POST   | `/api/v1/compliance-requests/:id/approve`  | `compliance.manage` | Approve a classified request                                            |
| POST   | `/api/v1/compliance-requests/:id/reject`   | `compliance.manage` | Reject a submitted or classified request                                |
| POST   | `/api/v1/compliance-requests/:id/execute`  | `compliance.manage` | Execute an approved request (triggers export/anonymisation)             |
| GET    | `/api/v1/compliance-requests/:id/export`   | `compliance.view`   | Get export file key for completed access_export requests                |

### Imports

| Method | Path                          | Permission        | Description                                                                    |
| ------ | ----------------------------- | ----------------- | ------------------------------------------------------------------------------ |
| POST   | `/api/v1/imports/upload`      | `settings.manage` | Upload CSV file (multipart, max 10MB), creates import_job, enqueues validation |
| GET    | `/api/v1/imports`             | `settings.manage` | List import jobs with status filter, paginated                                 |
| GET    | `/api/v1/imports/template`    | `settings.manage` | Download CSV template for a given import_type                                  |
| GET    | `/api/v1/imports/:id`         | `settings.manage` | Get single import job with full summary                                        |
| POST   | `/api/v1/imports/:id/confirm` | `settings.manage` | Confirm a validated import for processing                                      |

### Reports

| Method | Path                                            | Permission       | Description                                                                      |
| ------ | ----------------------------------------------- | ---------------- | -------------------------------------------------------------------------------- |
| GET    | `/api/v1/reports/promotion-rollover`            | `analytics.view` | Promotion/rollover statistics for an academic year                               |
| GET    | `/api/v1/reports/fee-generation-runs`           | `finance.view`   | Fee generation run history with totals                                           |
| GET    | `/api/v1/reports/write-offs`                    | `finance.view`   | Write-off report with entries and discount totals                                |
| GET    | `/api/v1/reports/notification-delivery`         | `analytics.view` | Notification delivery summary by channel and template                            |
| GET    | `/api/v1/reports/student-export/:studentId`     | `students.view`  | Full student export pack (profile, attendance, grades, report cards, enrolments) |
| GET    | `/api/v1/reports/household-export/:householdId` | `finance.view`   | Full household export pack (profile, invoices, payments)                         |

## Services

| Service                   | Path                                                        | Responsibilities                                                                                                                                               |
| ------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuditLogService`         | `apps/api/src/modules/audit-log/audit-log.service.ts`       | Non-blocking audit log writes, tenant-scoped list with actor name, platform-level cross-tenant list, engagement tracking                                       |
| `ComplianceService`       | `apps/api/src/modules/compliance/compliance.service.ts`     | CRUD for compliance requests, state machine (submitted->classified->approved->completed/rejected), subject validation, execution dispatch                      |
| `AccessExportService`     | `apps/api/src/modules/compliance/access-export.service.ts`  | Exports subject data (parent, student, household, user) as JSON to S3; includes profile, linked entities, attendance, grades, invoices, payments               |
| `AnonymisationService`    | `apps/api/src/modules/compliance/anonymisation.service.ts`  | Anonymises PII for parent, student, household, staff; handles report card and payslip snapshot payloads; idempotent                                            |
| `ImportService`           | `apps/api/src/modules/imports/import.service.ts`            | Upload CSV to S3, create import_job, enqueue validation/processing, list/get jobs, download templates, confirm imports                                         |
| `ImportValidationService` | `apps/api/src/modules/imports/import-validation.service.ts` | CSV parsing, header validation, row-level required field checks, date/email/number format validation, duplicate detection                                      |
| `ImportProcessingService` | `apps/api/src/modules/imports/import-processing.service.ts` | Processes validated rows per import type (students, parents, staff, fees, exam_results, staff_compensation), creates DB records in RLS transaction, S3 cleanup |
| `ReportsService`          | `apps/api/src/modules/reports/reports.service.ts`           | Promotion rollover, fee generation runs, write-offs, notification delivery, student export pack, household export pack                                         |

## Frontend

| Route                                     | Page File                                                                   | Description                                  |
| ----------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------- |
| `/{locale}/reports`                       | `apps/web/src/app/[locale]/(school)/reports/page.tsx`                       | Reports hub — links to all available reports |
| `/{locale}/reports/promotion-rollover`    | `apps/web/src/app/[locale]/(school)/reports/promotion-rollover/page.tsx`    | Promotion/rollover statistics report         |
| `/{locale}/reports/fee-generation`        | `apps/web/src/app/[locale]/(school)/reports/fee-generation/page.tsx`        | Fee generation runs report                   |
| `/{locale}/reports/write-offs`            | `apps/web/src/app/[locale]/(school)/reports/write-offs/page.tsx`            | Write-offs and discounts report              |
| `/{locale}/reports/notification-delivery` | `apps/web/src/app/[locale]/(school)/reports/notification-delivery/page.tsx` | Notification delivery analytics              |
| `/{locale}/reports/student-export`        | `apps/web/src/app/[locale]/(school)/reports/student-export/page.tsx`        | Student export pack viewer                   |
| `/{locale}/reports/workload`              | `apps/web/src/app/[locale]/(school)/reports/workload/page.tsx`              | Staff workload report                        |
| `/{locale}/settings/audit-log`            | `apps/web/src/app/[locale]/(school)/settings/audit-log/page.tsx`            | Tenant audit log viewer                      |
| `/{locale}/settings/compliance`           | `apps/web/src/app/[locale]/(school)/settings/compliance/page.tsx`           | Compliance request management                |
| `/{locale}/settings/imports`              | `apps/web/src/app/[locale]/(school)/settings/imports/page.tsx`              | Bulk CSV import management                   |
| `/{locale}/admin/audit-log`               | `apps/web/src/app/[locale]/(platform)/admin/audit-log/page.tsx`             | Platform admin cross-tenant audit log        |

## Background Jobs

| Job Name                     | Queue           | Processor File                                                                          | Description                                                                                                               |
| ---------------------------- | --------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `communications:on-approval` | `notifications` | `apps/worker/src/processors/communications/announcement-approval-callback.processor.ts` | Mode A callback: publishes announcement and sets published_at when approval is granted                                    |
| `finance:on-approval`        | `finance`       | `apps/worker/src/processors/finance/invoice-approval-callback.processor.ts`             | Mode A callback: issues invoice (status -> issued, sets issue_date) when approval is granted                              |
| `payroll:on-approval`        | `payroll`       | `apps/worker/src/processors/payroll/approval-callback.processor.ts`                     | Mode A callback: recalculates payroll entries, generates payslips with sequence numbers, finalises payroll run            |
| `imports:validate`           | `imports`       | `apps/worker/src/processors/imports/import-validation.processor.ts`                     | Validates uploaded CSV: header check, required fields, format validation, duplicate detection against DB                  |
| `imports:process`            | `imports`       | `apps/worker/src/processors/imports/import-processing.processor.ts`                     | Processes validated import rows: creates records per type (students, parents), S3 cleanup after completion                |
| `imports:file-cleanup`       | `imports`       | `apps/worker/src/processors/imports/import-file-cleanup.processor.ts`                   | Cross-tenant cleanup: deletes S3 files for completed/failed imports and stale jobs older than 24h                         |
| `compliance:execute`         | `imports`       | `apps/worker/src/processors/compliance/compliance-execution.processor.ts`               | Executes approved compliance requests: access export (S3 upload), erasure (anonymisation), rectification (mark completed) |
| `search:index-entity`        | `search-sync`   | `apps/worker/src/processors/search-index.processor.ts`                                  | Single-entity search index upsert/delete (stub: Meilisearch integration deferred)                                         |
| `search:full-reindex`        | `search-sync`   | `apps/worker/src/processors/search-reindex.processor.ts`                                | Full tenant reindex: batched processing of students, parents, staff, households (stub: Meilisearch deferred)              |

## Files Created

### Backend — API modules

- `apps/api/src/modules/audit-log/audit-log.module.ts`
- `apps/api/src/modules/audit-log/audit-log.controller.ts`
- `apps/api/src/modules/audit-log/audit-log.service.ts`
- `apps/api/src/modules/audit-log/engagement.controller.ts`
- `apps/api/src/modules/compliance/compliance.module.ts`
- `apps/api/src/modules/compliance/compliance.controller.ts`
- `apps/api/src/modules/compliance/compliance.service.ts`
- `apps/api/src/modules/compliance/access-export.service.ts`
- `apps/api/src/modules/compliance/anonymisation.service.ts`
- `apps/api/src/modules/imports/imports.module.ts`
- `apps/api/src/modules/imports/import.controller.ts`
- `apps/api/src/modules/imports/import.service.ts`
- `apps/api/src/modules/imports/import-validation.service.ts`
- `apps/api/src/modules/imports/import-processing.service.ts`
- `apps/api/src/modules/reports/reports.module.ts`
- `apps/api/src/modules/reports/reports.controller.ts`
- `apps/api/src/modules/reports/reports.service.ts`

### Backend — Worker processors

- `apps/worker/src/processors/communications/announcement-approval-callback.processor.ts`
- `apps/worker/src/processors/finance/invoice-approval-callback.processor.ts`
- `apps/worker/src/processors/payroll/approval-callback.processor.ts`
- `apps/worker/src/processors/imports/import-validation.processor.ts`
- `apps/worker/src/processors/imports/import-processing.processor.ts`
- `apps/worker/src/processors/imports/import-file-cleanup.processor.ts`
- `apps/worker/src/processors/compliance/compliance-execution.processor.ts`
- `apps/worker/src/processors/search-index.processor.ts`
- `apps/worker/src/processors/search-reindex.processor.ts`

### Frontend — Pages

- `apps/web/src/app/[locale]/(school)/reports/page.tsx`
- `apps/web/src/app/[locale]/(school)/reports/promotion-rollover/page.tsx`
- `apps/web/src/app/[locale]/(school)/reports/fee-generation/page.tsx`
- `apps/web/src/app/[locale]/(school)/reports/write-offs/page.tsx`
- `apps/web/src/app/[locale]/(school)/reports/notification-delivery/page.tsx`
- `apps/web/src/app/[locale]/(school)/reports/student-export/page.tsx`
- `apps/web/src/app/[locale]/(school)/reports/workload/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/audit-log/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/compliance/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/imports/page.tsx`
- `apps/web/src/app/[locale]/(platform)/admin/audit-log/page.tsx`

### Shared package

- `packages/shared/src/types/audit-log.ts`
- `packages/shared/src/types/compliance.ts`
- `packages/shared/src/types/import.ts`
- `packages/shared/src/types/report.ts`
- `packages/shared/src/schemas/audit-log.schema.ts`
- `packages/shared/src/schemas/compliance.schema.ts`
- `packages/shared/src/schemas/import.schema.ts`
- `packages/shared/src/schemas/report.schema.ts`

### Database

- `packages/prisma/migrations/20260316260000_add_p8_audit_compliance_import_search/post_migrate.sql`

## Files Modified

- **`packages/prisma/schema.prisma`** — Added 7 enums (`ComplianceRequestType`, `ComplianceSubjectType`, `ComplianceRequestStatus`, `ComplianceClassification`, `ImportType`, `ImportStatus`, `SearchIndexStatusEnum`) and 4 models (`AuditLog`, `ComplianceRequest`, `ImportJob`, `SearchIndexStatus`) with relations to `Tenant` and `User`
- **`packages/shared/src/index.ts`** — Added exports for all 8 new schema and type files (audit-log, compliance, import, report)
- **`apps/api/src/app.module.ts`** — Registered `AuditLogModule`, `ComplianceModule`, `ImportsModule`, `ReportsModule` in the application module imports
- **`apps/api/src/common/interceptors/audit-log.interceptor.ts`** — Replaced P0 no-op interceptor with full implementation: captures POST/PUT/PATCH/DELETE mutations, extracts entity type/ID from URL path, sanitizes sensitive fields (password, token, secret, etc.), writes via AuditLogService fire-and-forget
- **`apps/worker/src/worker.module.ts`** — Registered all new processors (`ImportValidationProcessor`, `ImportProcessingProcessor`, `ImportFileCleanupProcessor`, `ComplianceExecutionProcessor`, `AnnouncementApprovalCallbackProcessor`, `InvoiceApprovalCallbackProcessor`, `PayrollApprovalCallbackProcessor`, `SearchIndexProcessor`, `SearchReindexProcessor`)
- **`apps/worker/src/base/queue.constants.ts`** — Added `IMPORTS: 'imports'` queue name constant

## Known Limitations

- Audit log partitioning deferred to production operations
- Parent engagement is instrumentation only (event tracking via `/api/v1/engagement/track`) — scoring dashboard deferred
- Compliance access export stores file key but S3 upload may fail in non-AWS environments (stores key reference regardless)
- Import processing is best-effort per row — partial failures are recorded in `summary_json`; `staff`, `fees`, `exam_results`, `staff_compensation` processing is implemented in `ImportProcessingService` (API-side) but the worker-side processor currently only implements `students` and `parents` row processing
- Search index processors are stub implementations — Meilisearch integration deferred; document building and batching logic is complete
- Workload report page exists as a frontend route but the corresponding API endpoint lives in the existing scheduling/timetable module rather than the reports module

## Deviations from Plan

- `SearchIndexStatusEnum` uses `search_failed` instead of `failed` to avoid Prisma enum name collision with `ImportStatus.failed`
- Compliance execution processor runs on the `imports` queue (shared, low-volume) rather than a dedicated `compliance` queue, as planned
- The audit log interceptor is registered as a global `APP_INTERCEPTOR` via `AuditLogModule` (marked `@Global()`) rather than being registered per-module — this ensures all mutations across all modules are captured
- Payroll approval callback includes full payroll recalculation and payslip generation (sequence numbers via `tenant_sequences`), making it the most complex of the three approval callbacks
