# P8 Implementation Plan — Approvals, Compliance, Analytics, Exports

---

## Section 1 — Overview

Phase 8 delivers cross-domain approval execution callbacks (auto-execute for Mode A actions), the real audit log implementation (replacing the P0 no-op interceptor), compliance/GDPR tooling (access export, erasure, anonymisation), the bulk CSV import engine, search index status tracking with nightly reconciliation, all remaining analytics reports from Section 4.19, parent engagement scoring instrumentation, and export pack generation.

**Dependencies on prior phases (services/modules this phase imports or extends):**

| Module                         | What exists                                                                                                          | What P8 does                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Approvals** (P1)             | `approval_workflows`, `approval_requests`, CRUD, `checkAndCreateIfNeeded()`, self-approval prevention                | Adds Mode A auto-execution callback dispatch in `approve()`, adds callback processors for announcements and invoices          |
| **Admissions** (P3/P5)         | `applications.service.ts` with `review()` and approval integration, `getAnalytics()` funnel endpoint                 | Adds import processor for students, promotion/rollover report                                                                 |
| **Finance** (P6)               | Invoices, payments, refunds, fee generation, household statements, finance dashboard                                 | Adds invoice approval callback processor, fee generation run report, write-off/scholarship report, import processors for fees |
| **Payroll** (P6b)              | Payroll runs/entries/payslips, 5 report endpoints + frontend, approval callback processor (exists but not triggered) | Wires payroll callback trigger from approve(), import processor for staff compensation                                        |
| **Communications** (P7)        | Announcements with approval integration, notifications with delivery status tracking                                 | Adds announcement approval callback processor, notification delivery audit report                                             |
| **Attendance** (P4a)           | Attendance service with `getExceptions()` endpoint + frontend                                                        | Report already complete, linked from reports hub                                                                              |
| **Scheduling** (P4b)           | Workload report at `/v1/scheduling-dashboard/workload` + frontend                                                    | Report already complete, linked from reports hub                                                                              |
| **Students** (P3)              | Allergy report at `/v1/students/allergy-report` + frontend                                                           | Report already complete, linked from reports hub                                                                              |
| **Search** (P3)                | Meilisearch client, PostgreSQL fallback, search-index.service, search controller                                     | Adds `search_index_status` table, enhances nightly reindex with reconciliation                                                |
| **PDF Rendering** (P5/P6/P6b)  | 6 bilingual template pairs (report-card, transcript, invoice, receipt, household-statement, payslip)                 | Reuses for export pack PDF generation                                                                                         |
| **S3** (P0)                    | Upload, download, presignedUrl, delete                                                                               | Used for import file storage and export pack generation                                                                       |
| **Audit Log Interceptor** (P0) | No-op scaffold in `common/interceptors/audit-log.interceptor.ts`                                                     | Replaces with real implementation that writes to `audit_logs` table                                                           |

---

## Section 2 — Database Changes

### 2.1 New Table: `audit_logs`

**Append-only. No `updated_at`. No `set_updated_at` trigger.**

| Column          | Type           | Constraints                                                                                         |
| --------------- | -------------- | --------------------------------------------------------------------------------------------------- |
| `id`            | `UUID`         | PK, `@default(dbgenerated("gen_random_uuid()"))`                                                    |
| `tenant_id`     | `UUID`         | NULL, FK → `tenants` (ON DELETE CASCADE). NULL = platform-level action                              |
| `actor_user_id` | `UUID`         | NULL, FK → `users` (ON DELETE SET NULL). NULL = system action                                       |
| `entity_type`   | `VARCHAR(100)` | NOT NULL                                                                                            |
| `entity_id`     | `UUID`         | NULL                                                                                                |
| `action`        | `VARCHAR(100)` | NOT NULL                                                                                            |
| `metadata_json` | `JSONB`        | NOT NULL, `@default("{}")`                                                                          |
| `ip_address`    | `String`       | NULL, stored as text (Prisma does not support INET natively; raw SQL migration creates INET column) |
| `created_at`    | `TIMESTAMPTZ`  | NOT NULL, `@default(now())`                                                                         |

**RLS**: Dual-policy pattern (nullable `tenant_id`):

```sql
-- Tenant-scoped rows
CREATE POLICY audit_logs_tenant_isolation ON audit_logs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Platform-scoped rows (NULL tenant_id) — accessible only when no tenant context is set
CREATE POLICY audit_logs_platform_access ON audit_logs
  FOR SELECT
  USING (tenant_id IS NULL AND current_setting('app.current_tenant_id', true) IS NULL);
```

**Indexes**:

- `idx_audit_logs_tenant_entity` ON `audit_logs(tenant_id, entity_type, entity_id)`
- `idx_audit_logs_tenant_actor` ON `audit_logs(tenant_id, actor_user_id)`
- `idx_audit_logs_created` ON `audit_logs(tenant_id, created_at)`

**Seed data**: None required.

**Note**: Monthly partitioning by `created_at` is deferred to production operations. The initial migration creates the table without partitioning. Partitioning can be added via a future migration without application code changes.

---

### 2.2 New Table: `compliance_requests`

| Column                 | Type                       | Constraints                                      |
| ---------------------- | -------------------------- | ------------------------------------------------ |
| `id`                   | `UUID`                     | PK, `@default(dbgenerated("gen_random_uuid()"))` |
| `tenant_id`            | `UUID`                     | NOT NULL, FK → `tenants` (ON DELETE CASCADE)     |
| `request_type`         | `ComplianceRequestType`    | NOT NULL                                         |
| `subject_type`         | `ComplianceSubjectType`    | NOT NULL                                         |
| `subject_id`           | `UUID`                     | NOT NULL                                         |
| `requested_by_user_id` | `UUID`                     | NOT NULL, FK → `users` (ON DELETE CASCADE)       |
| `status`               | `ComplianceRequestStatus`  | NOT NULL, `@default(submitted)`                  |
| `classification`       | `ComplianceClassification` | NULL                                             |
| `decision_notes`       | `TEXT`                     | NULL                                             |
| `created_at`           | `TIMESTAMPTZ`              | NOT NULL, `@default(now())`                      |
| `updated_at`           | `TIMESTAMPTZ`              | NOT NULL, `@default(now())`, `@updatedAt`        |

**New enums**:

```prisma
enum ComplianceRequestType {
  access_export
  erasure
  rectification
}

enum ComplianceSubjectType {
  parent
  student
  household
  user
}

enum ComplianceRequestStatus {
  submitted
  classified
  approved
  rejected
  completed
}

enum ComplianceClassification {
  erase
  anonymise
  retain_legal_basis
}
```

**RLS**: Standard tenant isolation policy.

**`set_updated_at` trigger**: Yes.

**Indexes**:

- `idx_compliance_requests_tenant` ON `compliance_requests(tenant_id, status)`

**Seed data**: None required.

---

### 2.3 New Table: `import_jobs`

| Column               | Type           | Constraints                                      |
| -------------------- | -------------- | ------------------------------------------------ |
| `id`                 | `UUID`         | PK, `@default(dbgenerated("gen_random_uuid()"))` |
| `tenant_id`          | `UUID`         | NOT NULL, FK → `tenants` (ON DELETE CASCADE)     |
| `import_type`        | `ImportType`   | NOT NULL                                         |
| `file_key`           | `TEXT`         | NULL (S3 key; purged after processing)           |
| `status`             | `ImportStatus` | NOT NULL, `@default(uploaded)`                   |
| `summary_json`       | `JSONB`        | NOT NULL, `@default("{}")`                       |
| `created_by_user_id` | `UUID`         | NOT NULL, FK → `users` (ON DELETE CASCADE)       |
| `created_at`         | `TIMESTAMPTZ`  | NOT NULL, `@default(now())`                      |
| `updated_at`         | `TIMESTAMPTZ`  | NOT NULL, `@default(now())`, `@updatedAt`        |

**New enums**:

```prisma
enum ImportType {
  students
  parents
  staff
  fees
  exam_results
  staff_compensation
}

enum ImportStatus {
  uploaded
  validated
  processing
  completed
  failed
}
```

**RLS**: Standard tenant isolation policy.

**`set_updated_at` trigger**: Yes.

**Indexes**:

- `idx_import_jobs_tenant` ON `import_jobs(tenant_id, status)`

**`summary_json` Zod schema**:

```typescript
const importSummarySchema = z.object({
  total_rows: z.number().default(0),
  successful: z.number().default(0),
  failed: z.number().default(0),
  warnings: z.number().default(0),
  errors: z
    .array(
      z.object({
        row: z.number(),
        field: z.string(),
        error: z.string(),
      }),
    )
    .default([]),
  warnings_list: z
    .array(
      z.object({
        row: z.number(),
        field: z.string(),
        warning: z.string(),
      }),
    )
    .default([]),
});
```

**Seed data**: None required.

---

### 2.4 New Table: `search_index_status`

| Column         | Type                | Constraints                                      |
| -------------- | ------------------- | ------------------------------------------------ |
| `id`           | `UUID`              | PK, `@default(dbgenerated("gen_random_uuid()"))` |
| `tenant_id`    | `UUID`              | NOT NULL, FK → `tenants` (ON DELETE CASCADE)     |
| `entity_type`  | `VARCHAR(100)`      | NOT NULL                                         |
| `entity_id`    | `UUID`              | NOT NULL                                         |
| `index_status` | `SearchIndexStatus` | NOT NULL, `@default(pending)`                    |
| `updated_at`   | `TIMESTAMPTZ`       | NOT NULL, `@default(now())`, `@updatedAt`        |

**New enum**:

```prisma
enum SearchIndexStatus {
  pending
  indexed
  failed
}
```

**RLS**: Standard tenant isolation policy.

**`set_updated_at` trigger**: Yes.

**Unique constraint**: `@@unique([tenant_id, entity_type, entity_id])`

**Indexes**:

- `idx_search_index_status_pending` ON `search_index_status(tenant_id, index_status) WHERE index_status = 'pending'`

**Seed data**: None required.

---

### 2.5 Summary of All Schema Changes

| Change      | Table                      | Detail                                                           |
| ----------- | -------------------------- | ---------------------------------------------------------------- |
| CREATE      | `audit_logs`               | New table, dual RLS, no updated_at                               |
| CREATE      | `compliance_requests`      | New table, standard RLS, with updated_at                         |
| CREATE      | `import_jobs`              | New table, standard RLS, with updated_at                         |
| CREATE      | `search_index_status`      | New table, standard RLS, unique constraint                       |
| CREATE ENUM | `ComplianceRequestType`    | access_export, erasure, rectification                            |
| CREATE ENUM | `ComplianceSubjectType`    | parent, student, household, user                                 |
| CREATE ENUM | `ComplianceRequestStatus`  | submitted, classified, approved, rejected, completed             |
| CREATE ENUM | `ComplianceClassification` | erase, anonymise, retain_legal_basis                             |
| CREATE ENUM | `ImportType`               | students, parents, staff, fees, exam_results, staff_compensation |
| CREATE ENUM | `ImportStatus`             | uploaded, validated, processing, completed, failed               |
| CREATE ENUM | `SearchIndexStatus`        | pending, indexed, failed                                         |

---

## Section 3 — API Endpoints

### 3.1 Audit Log Endpoints

#### `GET /api/v1/audit-logs`

- **Permission**: `analytics.view`
- **Query schema**:
  ```typescript
  {
    entity_type?: string,
    actor_user_id?: string (UUID),
    action?: string,
    start_date?: string (ISO date),
    end_date?: string (ISO date),
    page: number (default 1),
    pageSize: number (default 20, max 100),
  }
  ```
- **Response**: `{ data: AuditLogEntry[], meta: { page, pageSize, total } }`
- **Business logic**: Query `audit_logs` filtered by tenant_id (from request context), apply filters, paginate. Include actor user name via join.
- **Error cases**: None beyond standard auth/permission errors.
- **Service method**: `AuditLogService.list()`

#### `GET /api/v1/admin/audit-logs` (Platform Admin)

- **Permission**: `tenants.view`
- **Query schema**: Same as above plus optional `tenant_id` filter.
- **Response**: Same shape. Includes tenant name in response.
- **Business logic**: Platform-level query without RLS tenant filter. Optional tenant_id filter.
- **Service method**: `AuditLogService.listPlatform()`

---

### 3.2 Compliance Endpoints

#### `POST /api/v1/compliance-requests`

- **Permission**: `compliance.manage`
- **Request schema**:
  ```typescript
  {
    request_type: 'access_export' | 'erasure' | 'rectification',
    subject_type: 'parent' | 'student' | 'household' | 'user',
    subject_id: string (UUID),
  }
  ```
- **Response**: `{ data: ComplianceRequest }` (201)
- **Business logic**: Validate subject exists in tenant. Create compliance_request with status `submitted`. Write audit log entry.
- **Error cases**: `SUBJECT_NOT_FOUND` (404), `DUPLICATE_REQUEST` (409) if active request exists for same subject.
- **Service method**: `ComplianceService.create()`

#### `GET /api/v1/compliance-requests`

- **Permission**: `compliance.view`
- **Query schema**: `{ status?, page, pageSize }`
- **Response**: `{ data: ComplianceRequest[], meta: { page, pageSize, total } }`
- **Service method**: `ComplianceService.list()`

#### `GET /api/v1/compliance-requests/:id`

- **Permission**: `compliance.view`
- **Response**: `{ data: ComplianceRequest }` with requester details.
- **Service method**: `ComplianceService.get()`

#### `POST /api/v1/compliance-requests/:id/classify`

- **Permission**: `compliance.manage`
- **Request schema**:
  ```typescript
  {
    classification: 'erase' | 'anonymise' | 'retain_legal_basis',
    decision_notes?: string (max 2000),
  }
  ```
- **Response**: `{ data: ComplianceRequest }` (200)
- **Business logic**: Status `submitted` → `classified`. Set classification and notes.
- **Error cases**: `INVALID_STATUS` (400) if not `submitted`.
- **Service method**: `ComplianceService.classify()`

#### `POST /api/v1/compliance-requests/:id/approve`

- **Permission**: `compliance.manage`
- **Request schema**: `{ decision_notes?: string }`
- **Response**: `{ data: ComplianceRequest }` (200)
- **Business logic**: Status `classified` → `approved`.
- **Error cases**: `INVALID_STATUS` (400) if not `classified`.
- **Service method**: `ComplianceService.approve()`

#### `POST /api/v1/compliance-requests/:id/reject`

- **Permission**: `compliance.manage`
- **Request schema**: `{ decision_notes?: string }`
- **Response**: `{ data: ComplianceRequest }` (200)
- **Business logic**: Status `classified` or `submitted` → `rejected`.
- **Service method**: `ComplianceService.reject()`

#### `POST /api/v1/compliance-requests/:id/execute`

- **Permission**: `compliance.manage`
- **Response**: `{ data: ComplianceRequest }` (200)
- **Business logic**: Status `approved` → `completed`. Enqueues background job for the actual work:
  - `access_export`: Collect all subject data, generate JSON export, store in S3, return presigned URL.
  - `erasure`/`rectification` with `anonymise` classification: Run anonymisation engine.
  - `erasure` with `erase` classification: Same as anonymise (finance/legal records retained).
- **Error cases**: `INVALID_STATUS` (400) if not `approved`.
- **Service method**: `ComplianceService.execute()`

#### `GET /api/v1/compliance-requests/:id/export`

- **Permission**: `compliance.view`
- **Response**: Presigned S3 URL for the generated export file.
- **Business logic**: Only valid for `access_export` requests in `completed` status.
- **Error cases**: `EXPORT_NOT_AVAILABLE` (404) if not access_export or not completed.
- **Service method**: `ComplianceService.getExportUrl()`

---

### 3.3 Import Endpoints

#### `POST /api/v1/imports/upload`

- **Permission**: `settings.manage`
- **Request**: Multipart form data with `file` (CSV) and `import_type` field.
- **Response**: `{ data: ImportJob }` (201)
- **Business logic**: Validate file is CSV. Upload to S3 at `{tenant_id}/imports/{job_id}.csv`. Create import_job with status `uploaded`. Enqueue validation job.
- **Error cases**: `INVALID_FILE_TYPE` (400), `FILE_TOO_LARGE` (400) if > 10MB.
- **Service method**: `ImportService.upload()`

#### `GET /api/v1/imports`

- **Permission**: `settings.manage`
- **Query schema**: `{ status?, page, pageSize }`
- **Response**: `{ data: ImportJob[], meta: { page, pageSize, total } }`
- **Service method**: `ImportService.list()`

#### `GET /api/v1/imports/:id`

- **Permission**: `settings.manage`
- **Response**: `{ data: ImportJob }` with full summary_json.
- **Service method**: `ImportService.get()`

#### `POST /api/v1/imports/:id/confirm`

- **Permission**: `settings.manage`
- **Response**: `{ data: ImportJob }` (200)
- **Business logic**: Status `validated` → `processing`. Enqueue processing job.
- **Error cases**: `INVALID_STATUS` (400) if not `validated`, `VALIDATION_HAS_ERRORS` (400) if summary has fatal errors.
- **Service method**: `ImportService.confirm()`

#### `GET /api/v1/imports/:id/template`

- **Permission**: `settings.manage`
- **Query**: `import_type` (required)
- **Response**: CSV file download with headers matching the expected import format.
- **Business logic**: Generate template CSV with header row and 1-2 example rows.
- **Service method**: `ImportService.getTemplate()`

---

### 3.4 Report Endpoints

#### `GET /api/v1/reports/promotion-rollover`

- **Permission**: `analytics.view`
- **Query**: `{ academic_year_id: UUID }`
- **Response**: `{ data: { promoted: number, held_back: number, graduated: number, withdrawn: number, details: PromotionDetail[] } }`
- **Business logic**: Query students by year group transitions in the academic year. Aggregate counts by promotion action.
- **Service method**: `ReportsService.promotionRollover()`

#### `GET /api/v1/reports/fee-generation-runs`

- **Permission**: `finance.view`
- **Query**: `{ academic_year_id?: UUID, page, pageSize }`
- **Response**: `{ data: FeeGenerationRunSummary[], meta }`
- **Business logic**: Query `audit_logs` where `action = 'fee_generation_confirm'` and `entity_type = 'fee_generation'`. Extract summary from `metadata_json`.
- **Service method**: `ReportsService.feeGenerationRuns()`

#### `GET /api/v1/reports/write-offs`

- **Permission**: `finance.view`
- **Query**: `{ start_date?: string, end_date?: string, page, pageSize }`
- **Response**: `{ data: WriteOffEntry[], meta, totals: { total_written_off: number, total_discounts: number } }`
- **Business logic**: Query invoices with status `written_off` in date range. Query discount/scholarship applications in date range.
- **Service method**: `ReportsService.writeOffs()`

#### `GET /api/v1/reports/write-offs/export`

- **Permission**: `finance.view`
- **Query**: Same as above plus `format: 'csv' | 'pdf'`
- **Response**: File download.
- **Service method**: `ReportsService.exportWriteOffs()`

#### `GET /api/v1/reports/notification-delivery`

- **Permission**: `analytics.view`
- **Query**: `{ start_date?, end_date?, channel?: 'email' | 'whatsapp' | 'in_app', template_key?, page, pageSize }`
- **Response**: `{ data: NotificationDeliverySummary, details: NotificationDeliveryDetail[] }`
  - Summary: delivery rates by channel, total sent, total delivered, total failed.
  - Details: per-template breakdown with failure reasons.
- **Business logic**: Aggregate `notifications` table by channel, status, template_key in date range.
- **Service method**: `ReportsService.notificationDelivery()`

#### `GET /api/v1/reports/student-export/:studentId`

- **Permission**: `students.view`
- **Response**: JSON export pack or file download.
- **Business logic**: Collect student profile, attendance records, grades, report cards, class enrolments. Generate downloadable JSON/CSV archive.
- **Error cases**: `STUDENT_NOT_FOUND` (404).
- **Service method**: `ReportsService.studentExportPack()`

#### `GET /api/v1/reports/household-export/:householdId`

- **Permission**: `finance.view`
- **Response**: JSON export pack or file download.
- **Business logic**: Collect household data, linked students, financial history, payment records.
- **Error cases**: `HOUSEHOLD_NOT_FOUND` (404).
- **Service method**: `ReportsService.householdExportPack()`

---

### 3.5 Approval Execution Callback (No new endpoints — modifies existing `approve()`)

When `approve()` is called for a Mode A action type, it now dispatches a callback job:

| Action Type            | Mode             | Callback                                           |
| ---------------------- | ---------------- | -------------------------------------------------- |
| `announcement_publish` | A (auto-execute) | Enqueue `communications:on-approval` job           |
| `invoice_issue`        | A (auto-execute) | Enqueue `finance:on-approval` job                  |
| `payroll_finalise`     | A (auto-execute) | Enqueue `payroll:on-approval` job (already exists) |
| `application_accept`   | B (manual)       | No callback — user manually triggers               |
| `payment_refund`       | B (manual)       | No callback — user manually triggers               |

---

### 3.6 Parent Engagement Tracking (No new endpoints — instrumentation in existing modules)

Add tracking hooks in existing services that write audit log entries for parent actions:

| Event             | Where to instrument                                       | Audit log fields                                                  |
| ----------------- | --------------------------------------------------------- | ----------------------------------------------------------------- |
| Parent login      | `AuthService.login()`                                     | entity_type='user', action='parent_login'                         |
| Payment made      | `PaymentsService.create()`                                | entity_type='payment', action='payment_created' (already tracked) |
| Announcement read | `NotificationsService.markRead()`                         | entity_type='notification', action='notification_read'            |
| Invoice viewed    | Frontend: track via API call when parent views invoice    | entity_type='invoice', action='invoice_viewed'                    |
| Grade viewed      | Frontend: track via API call when parent views grades     | entity_type='gradebook', action='grades_viewed'                   |
| Attendance viewed | Frontend: track via API call when parent views attendance | entity_type='attendance', action='attendance_viewed'              |

Add a lightweight tracking endpoint:

#### `POST /api/v1/engagement/track`

- **Permission**: Authenticated (any role)
- **Request schema**: `{ event_type: string, entity_type?: string, entity_id?: string }`
- **Response**: `{ ok: true }` (200)
- **Business logic**: Write audit log entry with actor as current user, ip from request. Fire-and-forget (non-blocking).
- **Service method**: `AuditLogService.track()`

---

## Section 4 — Service Layer

### 4.1 `AuditLogService`

- **Class**: `AuditLogService`
- **Module**: `AuditLogModule` (new module under `apps/api/src/modules/audit-log/`)
- **File**: `apps/api/src/modules/audit-log/audit-log.service.ts`
- **Dependencies**: `PrismaService`

**Public methods**:

| Method           | Signature                                                                                                                                                                                            | Responsibility                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `write()`        | `(tenantId: string \| null, actorUserId: string \| null, entityType: string, entityId: string \| null, action: string, metadata: Record<string, unknown>, ipAddress: string \| null): Promise<void>` | Write a single audit log entry. Used by the interceptor and manual tracking. Non-blocking — catches and logs errors but never throws. |
| `list()`         | `(tenantId: string, filters: AuditLogFilters): Promise<PaginatedResponse<AuditLogEntry>>`                                                                                                            | List audit logs for a tenant with filters (entity_type, actor, date range, action). Includes actor user name via join.                |
| `listPlatform()` | `(filters: PlatformAuditLogFilters): Promise<PaginatedResponse<AuditLogEntry>>`                                                                                                                      | List audit logs across tenants or platform-level. For platform admin.                                                                 |
| `track()`        | `(tenantId: string, userId: string, eventType: string, entityType: string \| null, entityId: string \| null, ip: string): Promise<void>`                                                             | Lightweight tracking entry. Used by the engagement tracking endpoint.                                                                 |

---

### 4.2 `ComplianceService`

- **Class**: `ComplianceService`
- **Module**: `ComplianceModule` (new module under `apps/api/src/modules/compliance/`)
- **File**: `apps/api/src/modules/compliance/compliance.service.ts`
- **Dependencies**: `PrismaService`, `S3Service`, `AuditLogService`

**Public methods**:

| Method           | Signature                                                | Responsibility                                                               |
| ---------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `create()`       | `(tenantId, userId, dto): Promise<ComplianceRequest>`    | Validate subject exists. Create request with status `submitted`.             |
| `list()`         | `(tenantId, filters): Promise<PaginatedResponse>`        | List compliance requests with optional status filter.                        |
| `get()`          | `(tenantId, requestId): Promise<ComplianceRequest>`      | Get single request with requester details.                                   |
| `classify()`     | `(tenantId, requestId, dto): Promise<ComplianceRequest>` | Transition `submitted` → `classified`. Set classification.                   |
| `approve()`      | `(tenantId, requestId, dto): Promise<ComplianceRequest>` | Transition `classified` → `approved`.                                        |
| `reject()`       | `(tenantId, requestId, dto): Promise<ComplianceRequest>` | Transition `submitted`/`classified` → `rejected`.                            |
| `execute()`      | `(tenantId, requestId): Promise<ComplianceRequest>`      | Transition `approved` → `completed`. Enqueue background job for actual work. |
| `getExportUrl()` | `(tenantId, requestId): Promise<string>`                 | Return presigned S3 URL for completed access_export.                         |

---

### 4.3 `AnonymisationService`

- **Class**: `AnonymisationService`
- **Module**: `ComplianceModule`
- **File**: `apps/api/src/modules/compliance/anonymisation.service.ts`
- **Dependencies**: `PrismaService`

**Public methods**:

| Method                 | Signature                                                          | Responsibility                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anonymiseSubject()`   | `(tenantId, subjectType, subjectId): Promise<AnonymisationResult>` | Main entry point. Dispatches to entity-specific handlers. Idempotent and resumable.                                                                       |
| `anonymiseParent()`    | `(tenantId, parentId, tx): Promise<void>`                          | Replace parent first_name/last_name/email/phone with `ANONYMISED-{uuid}`. Anonymise parent in invoice metadata, payslip snapshots, communication records. |
| `anonymiseStudent()`   | `(tenantId, studentId, tx): Promise<void>`                         | Replace student first_name/last_name/student_number with `ANONYMISED-{uuid}`. Anonymise in grades, attendance, report card snapshots. Retain records.     |
| `anonymiseHousehold()` | `(tenantId, householdId, tx): Promise<void>`                       | Replace household_name with `ANONYMISED-{uuid}`. Anonymise billing parent details. Retain financial records.                                              |
| `anonymiseStaff()`     | `(tenantId, staffProfileId, tx): Promise<void>`                    | Anonymise staff profile fields (job_title, department, bank details). Anonymise in payroll entries and payslip snapshots. Retain financial records.       |

**Anonymisation rules** (from spec):

- Finance records: personal identifiers anonymised (`ANONYMISED-{uuid}`), records retained
- Payroll records: staff identifier anonymised in `payroll_entries` and `payslips.snapshot_payload_json`
- Grades and attendance: student identifier anonymised, records retained
- Report cards: `snapshot_payload_json` student name anonymised
- Audit logs: retained as-is (actor shows anonymised name via join)
- Process is idempotent — each entity type processed independently, can resume on failure

---

### 4.4 `AccessExportService`

- **Class**: `AccessExportService`
- **Module**: `ComplianceModule`
- **File**: `apps/api/src/modules/compliance/access-export.service.ts`
- **Dependencies**: `PrismaService`, `S3Service`

**Public methods**:

| Method                | Signature                                                        | Responsibility                                                                     |
| --------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `exportSubjectData()` | `(tenantId, subjectType, subjectId): Promise<{ s3Key: string }>` | Collect all subject-visible data. Generate JSON file. Upload to S3. Return S3 key. |

**Export scope by subject type**:

- **Parent**: Parent profile, linked students (names only), household membership, communication preferences, inquiry messages (parent's own), announcement views.
- **Student**: Student profile, attendance records, grades, report card snapshots, class enrolments, application data (if from admissions).
- **Household**: Household profile, linked parents/students, invoices, payments, receipts, financial statements.
- **User**: User profile, all membership tenants, login history (from audit logs).

**Excludes**: Internal audit log entries, admin notes, system metadata, staff performance data.

---

### 4.5 `ImportService`

- **Class**: `ImportService`
- **Module**: `ImportModule` (new module under `apps/api/src/modules/imports/`)
- **File**: `apps/api/src/modules/imports/import.service.ts`
- **Dependencies**: `PrismaService`, `S3Service`, `ImportValidationService`, BullMQ queue injection

**Public methods**:

| Method          | Signature                                                  | Responsibility                                                                             |
| --------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `upload()`      | `(tenantId, userId, file, importType): Promise<ImportJob>` | Upload CSV to S3. Create import_job record. Enqueue `imports:validate` job.                |
| `list()`        | `(tenantId, filters): Promise<PaginatedResponse>`          | List import jobs with optional status filter.                                              |
| `get()`         | `(tenantId, jobId): Promise<ImportJob>`                    | Get single import job with full summary.                                                   |
| `confirm()`     | `(tenantId, jobId): Promise<ImportJob>`                    | Validate status is `validated`. Enqueue `imports:process` job. Set status to `processing`. |
| `getTemplate()` | `(importType): Buffer`                                     | Generate CSV template with headers for the import type.                                    |

---

### 4.6 `ImportValidationService`

- **Class**: `ImportValidationService`
- **Module**: `ImportModule`
- **File**: `apps/api/src/modules/imports/import-validation.service.ts`
- **Dependencies**: `PrismaService`, `S3Service`

**Public methods**:

| Method       | Signature                          | Responsibility                                                                                                                                                                                  |
| ------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validate()` | `(tenantId, jobId): Promise<void>` | Download CSV from S3. Parse rows. Validate each row against schema for import_type. Detect duplicates. Update import_job with summary_json and status `validated` (or `failed` if unparseable). |

**Validation per import type**:

- **students**: Required: first_name, last_name. Optional: student_number (detect duplicate), date_of_birth, year_group_name (lookup), nationality, gender. Duplicate detection: match on (first_name + last_name + date_of_birth) within tenant.
- **parents**: Required: first_name, last_name, email. Optional: phone, household_name (lookup/create). Duplicate detection: match on email within tenant.
- **staff**: Required: first_name, last_name, email. Optional: job_title, department, employment_type. Duplicate detection: match on email.
- **fees**: Required: fee_structure_name (lookup), household_name (lookup), amount. Duplicate detection: match on (fee_structure + household).
- **exam_results**: Required: student_number (lookup), subject_name (lookup), score. Optional: grade, assessment_name.
- **staff_compensation**: Required: staff_number (lookup), compensation_type, amount. Optional: effective_from, per_class_rate, bonus_class_rate.

---

### 4.7 `ImportProcessingService`

- **Class**: `ImportProcessingService`
- **Module**: `ImportModule`
- **File**: `apps/api/src/modules/imports/import-processing.service.ts`
- **Dependencies**: `PrismaService`, `S3Service`, `SearchIndexService`

**Public methods**:

| Method      | Signature                          | Responsibility                                                                                                                                                                                                                 |
| ----------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `process()` | `(tenantId, jobId): Promise<void>` | Download CSV. Process each valid row: create/update records in DB. Update summary_json with final counts. Set status `completed` or `failed`. Delete S3 file on completion. Enqueue search index updates for created entities. |

**Processing logic per type**: Each type creates records using the appropriate existing service or direct Prisma calls within an RLS transaction. Rows that fail individually do not block other rows — errors are collected in summary_json.

---

### 4.8 `ReportsService`

- **Class**: `ReportsService`
- **Module**: `ReportsModule` (new module under `apps/api/src/modules/reports/`)
- **File**: `apps/api/src/modules/reports/reports.service.ts`
- **Dependencies**: `PrismaService`, `PdfRenderingService`, `S3Service`

**Public methods**:

| Method                   | Signature                                                                  | Responsibility                                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `promotionRollover()`    | `(tenantId, academicYearId): Promise<PromotionRolloverReport>`             | Query students grouped by year group. Count by promotion action (promoted, held_back, graduated, withdrawn) based on student status transitions and class enrolment history in the academic year. |
| `feeGenerationRuns()`    | `(tenantId, filters): Promise<PaginatedResponse<FeeGenerationRunSummary>>` | Query `audit_logs` where action='fee_generation_confirm'. Extract summary stats from metadata_json. Return list of past generation runs with counts and amounts.                                  |
| `writeOffs()`            | `(tenantId, filters): Promise<WriteOffReport>`                             | Query invoices with status `written_off` in date range. Query applied discounts/scholarships. Aggregate by period, amount, reason.                                                                |
| `exportWriteOffs()`      | `(tenantId, filters, format): Promise<Buffer>`                             | Same data as writeOffs(), formatted as CSV or PDF.                                                                                                                                                |
| `notificationDelivery()` | `(tenantId, filters): Promise<NotificationDeliveryReport>`                 | Aggregate `notifications` table by channel, status, template_key. Compute delivery rates, failure reasons.                                                                                        |
| `studentExportPack()`    | `(tenantId, studentId): Promise<ExportPack>`                               | Collect student profile, attendance, grades, report cards. Generate JSON or ZIP archive.                                                                                                          |
| `householdExportPack()`  | `(tenantId, householdId): Promise<ExportPack>`                             | Collect household data, financial history. Generate JSON or ZIP archive.                                                                                                                          |

---

### 4.9 Modified: `ApprovalRequestsService` (approval execution callbacks)

**File**: `apps/api/src/modules/approvals/approval-requests.service.ts`
**New dependency**: BullMQ queue injections for `notifications`, `finance`, `payroll` queues.

**Modified method: `approve()`** — After setting status to `approved`, dispatch callback for Mode A actions:

```typescript
// After updating status to 'approved':
const MODE_A_ACTIONS: Record<string, { queue: string; jobName: string }> = {
  announcement_publish: { queue: 'notifications', jobName: 'communications:on-approval' },
  invoice_issue: { queue: 'finance', jobName: 'finance:on-approval' },
  payroll_finalise: { queue: 'payroll', jobName: 'payroll:on-approval' },
};

const callback = MODE_A_ACTIONS[request.action_type];
if (callback) {
  await this[callback.queue].add(callback.jobName, {
    tenant_id: tenantId,
    approval_request_id: requestId,
    target_entity_id: request.target_entity_id,
    approver_user_id: approverUserId,
  });
}
```

---

### 4.10 Enhanced: `SearchIndexService`

**File**: `apps/api/src/modules/search/search-index.service.ts`
**New dependency**: `PrismaService` (to write `search_index_status`)

**Modified methods**:

| Method           | Change                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `indexEntity()`  | After successful Meilisearch indexing, upsert `search_index_status` to `indexed`. On failure, set to `failed`. |
| `removeEntity()` | Delete corresponding `search_index_status` row.                                                                |

**New method**:

| Method        | Signature                              | Responsibility                                                                                    |
| ------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `reconcile()` | `(tenantId): Promise<ReconcileResult>` | Compare DB entities against `search_index_status`. Re-index any missing or failed. Return counts. |

---

## Section 5 — Frontend Pages and Components

### 5.1 Reports Hub Page

- **File**: `apps/web/src/app/[locale]/(school)/reports/page.tsx`
- **Route**: `/{locale}/reports`
- **Component type**: Client component
- **Data fetching**: None (static navigation page)
- **Key UI elements**: Grid of report cards, each linking to a specific report. Cards grouped by domain (Academic, Financial, Operational, Payroll).
- **API endpoints**: None
- **Role visibility**: Users with `analytics.view` permission

**Report cards linking to**:

- Promotion/Rollover Report → `/reports/promotion-rollover`
- Fee Generation Runs → `/reports/fee-generation`
- Household Statement → `/finance/statements` (existing)
- Teacher Workload → `/reports/workload` (existing)
- Admissions Funnel → `/admissions/analytics` (existing)
- Attendance Exceptions → `/attendance/exceptions` (existing)
- Student Export Pack → `/reports/student-export`
- Write-Off/Scholarship → `/reports/write-offs`
- Notification Delivery → `/reports/notification-delivery`
- Allergy Report → `/students/allergy-report` (existing)
- Monthly Payroll Summary → `/payroll/reports` (existing)
- Payroll Cost Trend → `/payroll/reports` (existing)
- Staff Payment History → `/payroll/reports` (existing)
- YTD Staff Cost Summary → `/payroll/reports` (existing)
- Bonus Analysis → `/payroll/reports` (existing)

---

### 5.2 Promotion/Rollover Report Page

- **File**: `apps/web/src/app/[locale]/(school)/reports/promotion-rollover/page.tsx`
- **Route**: `/{locale}/reports/promotion-rollover`
- **Component type**: Client component
- **Data fetching**: `GET /api/v1/reports/promotion-rollover?academic_year_id={id}`
- **Key UI elements**: Academic year selector dropdown. Summary stat cards (promoted, held_back, graduated, withdrawn). Detailed table by year group.
- **Role visibility**: Users with `analytics.view`

---

### 5.3 Fee Generation Run Report Page

- **File**: `apps/web/src/app/[locale]/(school)/reports/fee-generation/page.tsx`
- **Route**: `/{locale}/reports/fee-generation`
- **Component type**: Client component
- **Data fetching**: `GET /api/v1/reports/fee-generation-runs`
- **Key UI elements**: Table of past generation runs with date, invoices created, total amount, households affected. Click to expand details.
- **Role visibility**: Users with `finance.view`

---

### 5.4 Write-Off/Scholarship Report Page

- **File**: `apps/web/src/app/[locale]/(school)/reports/write-offs/page.tsx`
- **Route**: `/{locale}/reports/write-offs`
- **Component type**: Client component
- **Data fetching**: `GET /api/v1/reports/write-offs`
- **Key UI elements**: Date range filter. Summary cards (total written off, total discounts). Table of write-offs by period. Export button (CSV/PDF).
- **Role visibility**: Users with `finance.view`

---

### 5.5 Notification Delivery Report Page

- **File**: `apps/web/src/app/[locale]/(school)/reports/notification-delivery/page.tsx`
- **Route**: `/{locale}/reports/notification-delivery`
- **Component type**: Client component
- **Data fetching**: `GET /api/v1/reports/notification-delivery`
- **Key UI elements**: Date range filter. Channel filter dropdown. Summary cards (delivery rate by channel). Bar chart of delivery status breakdown. Table of per-template delivery stats. Failure reason breakdown.
- **Charts**: Recharts bar chart for delivery rates.
- **Role visibility**: Users with `analytics.view`

---

### 5.6 Student Export Pack Page

- **File**: `apps/web/src/app/[locale]/(school)/reports/student-export/page.tsx`
- **Route**: `/{locale}/reports/student-export`
- **Component type**: Client component
- **Data fetching**: Search for student, then `GET /api/v1/reports/student-export/:studentId`
- **Key UI elements**: Student search/select. Preview of export contents. Download button.
- **Role visibility**: Users with `students.view`

---

### 5.7 Audit Log Viewer (School Admin)

- **File**: `apps/web/src/app/[locale]/(school)/settings/audit-log/page.tsx`
- **Route**: `/{locale}/settings/audit-log`
- **Component type**: Client component
- **Data fetching**: `GET /api/v1/audit-logs`
- **Key UI elements**: Filter bar (entity type dropdown, actor search, date range picker, action text filter). Paginated table showing: timestamp, actor name, action, entity type, entity ID (linkable). Detail drawer/modal on row click showing full metadata_json.
- **Role visibility**: Users with `analytics.view`

---

### 5.8 Audit Log Viewer (Platform Admin)

- **File**: `apps/web/src/app/[locale]/(platform)/admin/audit-log/page.tsx`
- **Route**: `/{locale}/admin/audit-log`
- **Component type**: Client component
- **Data fetching**: `GET /api/v1/admin/audit-logs`
- **Key UI elements**: Same as school admin but with tenant filter dropdown. Shows tenant name column.
- **Role visibility**: Users with `tenants.view`

---

### 5.9 Compliance Management Page

- **File**: `apps/web/src/app/[locale]/(school)/settings/compliance/page.tsx`
- **Route**: `/{locale}/settings/compliance`
- **Component type**: Client component
- **Data fetching**: `GET /api/v1/compliance-requests`
- **Key UI elements**: Status filter tabs (all, submitted, classified, approved, completed, rejected). Table of requests with subject info, type, status badge, dates. "New Request" button opening a form dialog. Detail view with state machine actions (classify, approve, reject, execute).
- **Role visibility**: Users with `compliance.view` (read) and `compliance.manage` (actions)

---

### 5.10 Bulk Import Page

- **File**: `apps/web/src/app/[locale]/(school)/settings/imports/page.tsx`
- **Route**: `/{locale}/settings/imports`
- **Component type**: Client component
- **Data fetching**: `GET /api/v1/imports`
- **Key UI elements**:
  1. Import type selector (students, parents, staff, fees, exam_results, staff_compensation).
  2. Download template button.
  3. File upload dropzone (CSV only, max 10MB).
  4. Validation results view: row count, errors table, warnings table.
  5. Confirm/Cancel buttons.
  6. Processing status with progress indication.
  7. Final results: success/failure counts.
  8. History table of past imports.
- **Role visibility**: Users with `settings.manage`

---

### 5.11 Sidebar Navigation Updates

**File to modify**: `apps/web/src/app/[locale]/(school)/layout.tsx`

Add to the sidebar navigation:

1. **REPORTS section**: Update to include "Reports" as a link to the reports hub (`/reports`).
2. **Settings sub-nav**: Add three new items:
   - Audit Log (`/settings/audit-log`)
   - Compliance (`/settings/compliance`)
   - Imports (`/settings/imports`)

**File to modify**: `apps/web/src/app/[locale]/(school)/settings/layout.tsx`

Add the three new settings sub-nav items.

---

## Section 6 — Background Jobs

### 6.1 Announcement Approval Callback Processor

- **Job name**: `communications:on-approval`
- **Queue**: `notifications`
- **Processor file**: `apps/worker/src/processors/communications/announcement-approval-callback.processor.ts`
- **Trigger**: Dispatched from `ApprovalRequestsService.approve()` when action_type is `announcement_publish`.
- **Payload**: `{ tenant_id, approval_request_id, target_entity_id (announcement_id), approver_user_id }`
- **Processing logic**:
  1. Fetch announcement by target_entity_id.
  2. Verify announcement is in `pending_approval` status.
  3. Call the announcement's publish execution logic (same as `executePublish()` in announcements service):
     - Update status to `published`, set `published_at`.
     - Resolve audience, create notifications, enqueue dispatch.
  4. Update approval_request status → `executed`, set `executed_at`.
- **Retry**: 3 attempts with exponential backoff.

### 6.2 Invoice Approval Callback Processor

- **Job name**: `finance:on-approval`
- **Queue**: `finance`
- **Processor file**: `apps/worker/src/processors/finance/invoice-approval-callback.processor.ts`
- **Trigger**: Dispatched from `ApprovalRequestsService.approve()` when action_type is `invoice_issue`.
- **Payload**: `{ tenant_id, approval_request_id, target_entity_id (invoice_id), approver_user_id }`
- **Processing logic**:
  1. Fetch invoice by target_entity_id.
  2. Verify invoice is in `pending_approval` status.
  3. Transition invoice to `issued` status. Set `issued_at`.
  4. Allocate invoice sequence number from `tenant_sequences`.
  5. Update approval_request status → `executed`, set `executed_at`.
- **Retry**: 3 attempts with exponential backoff.

### 6.3 Import Validation Job

- **Job name**: `imports:validate`
- **Queue**: `imports` (new queue)
- **Processor file**: `apps/worker/src/processors/imports/import-validation.processor.ts`
- **Trigger**: Enqueued from `ImportService.upload()`.
- **Payload**: `{ tenant_id, import_job_id }`
- **Processing logic**:
  1. Download CSV from S3 using file_key.
  2. Parse CSV (use `csv-parse` or `papaparse`).
  3. Validate each row against import_type schema.
  4. Detect duplicates against existing DB records.
  5. Update import_job: set summary_json with row counts, errors, warnings. Set status to `validated` (or `failed` if file is unparseable).
- **Retry**: 2 attempts.

### 6.4 Import Processing Job

- **Job name**: `imports:process`
- **Queue**: `imports`
- **Processor file**: `apps/worker/src/processors/imports/import-processing.processor.ts`
- **Trigger**: Enqueued from `ImportService.confirm()`.
- **Payload**: `{ tenant_id, import_job_id }`
- **Processing logic**:
  1. Download CSV from S3.
  2. For each valid row (skip rows with errors from validation):
     - Create record in DB within RLS transaction.
     - On per-row failure: record error in summary, continue with next row.
  3. Enqueue search index updates for created entities.
  4. Update import_job: set final summary_json, status `completed` (or `failed` if critical error).
  5. Delete S3 file.
- **Retry**: 1 attempt (processing is partially idempotent — duplicate detection prevents double-creates).

### 6.5 Import File Cleanup Job

- **Job name**: `imports:file-cleanup`
- **Queue**: `imports`
- **Processor file**: `apps/worker/src/processors/imports/import-file-cleanup.processor.ts`
- **Trigger**: Scheduled cron job (daily).
- **Payload**: `{}` (no tenant_id — runs across all tenants)
- **Processing logic**:
  1. Query import_jobs where file_key IS NOT NULL AND (status IN ('completed','failed') OR created_at < now() - 24 hours).
  2. For each: delete S3 file, set file_key to NULL.
- **Retry**: 3 attempts.

### 6.6 Compliance Execution Job

- **Job name**: `compliance:execute`
- **Queue**: `imports` (reuse queue, low volume)
- **Processor file**: `apps/worker/src/processors/compliance/compliance-execution.processor.ts`
- **Trigger**: Enqueued from `ComplianceService.execute()`.
- **Payload**: `{ tenant_id, compliance_request_id }`
- **Processing logic**:
  1. Fetch compliance_request.
  2. Based on request_type and classification:
     - `access_export`: Call `AccessExportService.exportSubjectData()`. Store S3 key in metadata.
     - `erasure` + `anonymise`: Call `AnonymisationService.anonymiseSubject()`.
     - `erasure` + `erase`: Same as anonymise (retain financial/legal records).
     - `rectification`: Mark completed (rectification is manual — the request serves as an audit trail).
  3. Update compliance_request status → `completed`.
- **Retry**: 3 attempts.

### 6.7 Enhanced Search Reindex (Nightly Reconciliation)

- **Job name**: `search:full-reindex` (already exists — enhance logic)
- **Queue**: `search-sync`
- **Processor file**: `apps/worker/src/processors/search-reindex.processor.ts` (modify existing)
- **Trigger**: Nightly cron job.
- **Enhanced logic**:
  1. For each entity type (students, parents, staff, households, invoices, applications):
     - Query all active entities from DB.
     - For each entity: check `search_index_status`. If missing or `failed`, re-index.
     - On successful index: upsert `search_index_status` to `indexed`.
     - On failure: upsert to `failed`.
  2. Remove stale entries: delete `search_index_status` rows where entity no longer exists in DB.

---

## Section 7 — Implementation Order

### Step 1: Database Migration and Seed Data

1. Add new enums to Prisma schema: `ComplianceRequestType`, `ComplianceSubjectType`, `ComplianceRequestStatus`, `ComplianceClassification`, `ImportType`, `ImportStatus`, `SearchIndexStatus`.
2. Add new models to Prisma schema: `AuditLog`, `ComplianceRequest`, `ImportJob`, `SearchIndexStatus`.
3. Generate Prisma migration: `npx prisma migrate dev --name add-p8-audit-compliance-import-search-tables`.
4. Create `post_migrate.sql` with RLS policies (standard for compliance_requests, import_jobs, search_index_status; dual-policy for audit_logs), `set_updated_at` triggers, and indexes.
5. Run migration and post-migrate.

### Step 2: Shared Types and Zod Schemas

6. Add TypeScript types: `AuditLogEntry`, `ComplianceRequest`, `ComplianceRequestType`, `ComplianceSubjectType`, `ComplianceRequestStatus`, `ComplianceClassification`, `ImportJob`, `ImportType`, `ImportStatus`, `SearchIndexStatus`, `PromotionRolloverReport`, `FeeGenerationRunSummary`, `WriteOffEntry`, `NotificationDeliverySummary`, `ExportPack`.
7. Add Zod schemas: `createComplianceRequestSchema`, `classifyComplianceRequestSchema`, `complianceDecisionSchema`, `importUploadSchema`, `auditLogFilterSchema`, `promotionRolloverQuerySchema`, `writeOffQuerySchema`, `notificationDeliveryQuerySchema`, `importSummarySchema`, `engagementTrackSchema`.

### Step 3: Backend Services (dependency order)

8. **AuditLogModule**: `AuditLogService` (write, list, listPlatform, track). Create module, register globally.
9. **AuditLogInterceptor**: Replace P0 no-op with real implementation. Wire to AuditLogService.write().
10. **ComplianceModule**: `ComplianceService`, `AnonymisationService`, `AccessExportService`. Register in app module.
11. **ImportModule**: `ImportService`, `ImportValidationService`, `ImportProcessingService`. Register BullMQ `imports` queue. Register in app module.
12. **ReportsModule**: `ReportsService` with all report methods. Register in app module.
13. **ApprovalRequestsService modification**: Add BullMQ queue injections and Mode A callback dispatch in `approve()`.
14. **SearchIndexService enhancement**: Add `search_index_status` upsert logic and `reconcile()` method.
15. **Parent engagement instrumentation**: Add tracking calls in auth, notifications modules.

### Step 4: Backend Controllers

16. **AuditLogController**: `GET /v1/audit-logs`, `GET /v1/admin/audit-logs`.
17. **ComplianceController**: All CRUD and action endpoints.
18. **ImportController**: Upload, list, get, confirm, template endpoints.
19. **ReportsController**: All report endpoints.
20. **EngagementController**: `POST /v1/engagement/track`.
21. **Fee generation audit logging**: Modify `FeeGenerationService.confirm()` to write audit log entry with summary metadata.

### Step 5: Background Job Processors

22. **Register `imports` queue** in `worker.module.ts` and `apps/api/src/app.module.ts`.
23. **Announcement approval callback processor**: `communications:on-approval`.
24. **Invoice approval callback processor**: `finance:on-approval`.
25. **Import validation processor**: `imports:validate`.
26. **Import processing processor**: `imports:process`.
27. **Import file cleanup processor**: `imports:file-cleanup`.
28. **Compliance execution processor**: `compliance:execute`.
29. **Enhanced search reindex processor**: Modify existing `search:full-reindex`.

### Step 6: Frontend Pages and Components

30. **Reports hub page**: `/reports/page.tsx` with card grid.
31. **Promotion/Rollover report page**: `/reports/promotion-rollover/page.tsx`.
32. **Fee Generation report page**: `/reports/fee-generation/page.tsx`.
33. **Write-Off/Scholarship report page**: `/reports/write-offs/page.tsx`.
34. **Notification Delivery report page**: `/reports/notification-delivery/page.tsx`.
35. **Student Export Pack page**: `/reports/student-export/page.tsx`.
36. **Audit Log viewer (school)**: `/settings/audit-log/page.tsx`.
37. **Audit Log viewer (platform)**: `/admin/audit-log/page.tsx`.
38. **Compliance management page**: `/settings/compliance/page.tsx`.
39. **Bulk Import page**: `/settings/imports/page.tsx`.
40. **Sidebar and settings layout updates**: Add new nav items.

---

## Section 8 — Files to Create

### Shared Package (`packages/shared/src/`)

```
packages/shared/src/types/audit-log.ts
packages/shared/src/types/compliance.ts
packages/shared/src/types/import.ts
packages/shared/src/types/report.ts
packages/shared/src/schemas/audit-log.schema.ts
packages/shared/src/schemas/compliance.schema.ts
packages/shared/src/schemas/import.schema.ts
packages/shared/src/schemas/report.schema.ts
packages/shared/src/schemas/engagement.schema.ts
```

### Backend — Audit Log Module (`apps/api/src/modules/audit-log/`)

```
apps/api/src/modules/audit-log/audit-log.module.ts
apps/api/src/modules/audit-log/audit-log.service.ts
apps/api/src/modules/audit-log/audit-log.controller.ts
apps/api/src/modules/audit-log/dto/audit-log-filter.dto.ts
```

### Backend — Compliance Module (`apps/api/src/modules/compliance/`)

```
apps/api/src/modules/compliance/compliance.module.ts
apps/api/src/modules/compliance/compliance.service.ts
apps/api/src/modules/compliance/compliance.controller.ts
apps/api/src/modules/compliance/anonymisation.service.ts
apps/api/src/modules/compliance/access-export.service.ts
```

### Backend — Import Module (`apps/api/src/modules/imports/`)

```
apps/api/src/modules/imports/imports.module.ts
apps/api/src/modules/imports/import.service.ts
apps/api/src/modules/imports/import.controller.ts
apps/api/src/modules/imports/import-validation.service.ts
apps/api/src/modules/imports/import-processing.service.ts
apps/api/src/modules/imports/validators/students.validator.ts
apps/api/src/modules/imports/validators/parents.validator.ts
apps/api/src/modules/imports/validators/staff.validator.ts
apps/api/src/modules/imports/validators/fees.validator.ts
apps/api/src/modules/imports/validators/exam-results.validator.ts
apps/api/src/modules/imports/validators/staff-compensation.validator.ts
```

### Backend — Reports Module (`apps/api/src/modules/reports/`)

```
apps/api/src/modules/reports/reports.module.ts
apps/api/src/modules/reports/reports.service.ts
apps/api/src/modules/reports/reports.controller.ts
```

### Backend — Engagement Tracking

```
apps/api/src/modules/audit-log/engagement.controller.ts
```

### Worker — New Processors

```
apps/worker/src/processors/communications/announcement-approval-callback.processor.ts
apps/worker/src/processors/finance/invoice-approval-callback.processor.ts
apps/worker/src/processors/imports/import-validation.processor.ts
apps/worker/src/processors/imports/import-processing.processor.ts
apps/worker/src/processors/imports/import-file-cleanup.processor.ts
apps/worker/src/processors/compliance/compliance-execution.processor.ts
```

### Database Migration

```
packages/prisma/migrations/{timestamp}_add-p8-audit-compliance-import-search-tables/migration.sql
packages/prisma/migrations/{timestamp}_add-p8-audit-compliance-import-search-tables/post_migrate.sql
```

### Frontend — Report Pages

```
apps/web/src/app/[locale]/(school)/reports/page.tsx
apps/web/src/app/[locale]/(school)/reports/promotion-rollover/page.tsx
apps/web/src/app/[locale]/(school)/reports/fee-generation/page.tsx
apps/web/src/app/[locale]/(school)/reports/write-offs/page.tsx
apps/web/src/app/[locale]/(school)/reports/notification-delivery/page.tsx
apps/web/src/app/[locale]/(school)/reports/notification-delivery/_components/delivery-chart.tsx
apps/web/src/app/[locale]/(school)/reports/student-export/page.tsx
```

### Frontend — Admin Pages

```
apps/web/src/app/[locale]/(school)/settings/audit-log/page.tsx
apps/web/src/app/[locale]/(school)/settings/compliance/page.tsx
apps/web/src/app/[locale]/(school)/settings/compliance/_components/compliance-form-dialog.tsx
apps/web/src/app/[locale]/(school)/settings/compliance/_components/compliance-detail.tsx
apps/web/src/app/[locale]/(school)/settings/imports/page.tsx
apps/web/src/app/[locale]/(school)/settings/imports/_components/import-upload.tsx
apps/web/src/app/[locale]/(school)/settings/imports/_components/import-validation-results.tsx
apps/web/src/app/[locale]/(school)/settings/imports/_components/import-history.tsx
apps/web/src/app/[locale]/(platform)/admin/audit-log/page.tsx
```

---

## Section 9 — Files to Modify

### Prisma Schema

| File                            | Changes                                                                                                                      |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `packages/prisma/schema.prisma` | Add 4 new models (AuditLog, ComplianceRequest, ImportJob, SearchIndexStatus) and 7 new enums. Add relations to Tenant, User. |

### Approval Module

| File                                                          | Changes                                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `apps/api/src/modules/approvals/approval-requests.service.ts` | Add BullMQ queue injections. Add Mode A callback dispatch in `approve()`.   |
| `apps/api/src/modules/approvals/approvals.module.ts`          | Import BullModule.registerQueue for notifications, finance, payroll queues. |

### Audit Log Interceptor

| File                                                        | Changes                                                                                                                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/common/interceptors/audit-log.interceptor.ts` | Replace P0 no-op with real implementation. Inject AuditLogService. Capture request metadata, extract entity_type/entity_id from route, write audit log entry after response. |

### Search Module

| File                                                  | Changes                                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `apps/api/src/modules/search/search-index.service.ts` | Add `search_index_status` upsert on index/remove. Add `reconcile()` method. |
| `apps/api/src/modules/search/search.module.ts`        | Import PrismaModule if not already.                                         |

### Worker Module

| File                                                     | Changes                                                  |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `apps/worker/src/worker.module.ts`                       | Register new `imports` queue. Register 6 new processors. |
| `apps/worker/src/base/queue.constants.ts`                | Add `IMPORTS: 'imports'` to QUEUE_NAMES.                 |
| `apps/worker/src/processors/search-reindex.processor.ts` | Enhance with `search_index_status` reconciliation logic. |

### App Module

| File                         | Changes                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/api/src/app.module.ts` | Import AuditLogModule, ComplianceModule, ImportModule, ReportsModule. Register BullModule for imports queue. |

### Fee Generation (Audit Logging)

| File                                                     | Changes                                                                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/finance/fee-generation.service.ts` | After `confirm()` completes, write audit log entry with `action='fee_generation_confirm'` and summary metadata. |

### Frontend Layouts

| File                                                     | Changes                                                  |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `apps/web/src/app/[locale]/(school)/layout.tsx`          | Update sidebar REPORTS section with link to reports hub. |
| `apps/web/src/app/[locale]/(school)/settings/layout.tsx` | Add Audit Log, Compliance, Imports to settings sub-nav.  |

### Translation Files

| File                        | Changes                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/web/messages/en.json` | Add translation keys for all new pages: audit-log, compliance, imports, reports, export pack. |
| `apps/web/messages/ar.json` | Add Arabic translations for all new keys.                                                     |

### Shared Package Exports

| File                                             | Changes                               |
| ------------------------------------------------ | ------------------------------------- |
| `packages/shared/src/index.ts` (or barrel files) | Export new types, schemas, constants. |

---

## Section 10 — Key Context for Executor

### Pattern: Module Creation

Follow the existing module pattern established in prior phases. Example to reference:

- **Module file**: `apps/api/src/modules/payroll/payroll.module.ts` — shows how to register services, controllers, import other modules, inject BullMQ queues.
- **Service file**: `apps/api/src/modules/payroll/payroll-runs.service.ts` — shows RLS transaction pattern, approval integration, optimistic concurrency.
- **Controller file**: `apps/api/src/modules/payroll/payroll-runs.controller.ts` — shows guards, decorators, Zod validation pipes.

### Pattern: BullMQ Job Processor

Follow the pattern in `apps/worker/src/processors/payroll/approval-callback.processor.ts`:

- Extend `WorkerHost`
- Filter by job.name
- Validate tenant_id
- Instantiate TenantAwareJob subclass
- Call execute()

### Pattern: RLS Transactions

All tenant-scoped DB operations must use interactive transactions:

```typescript
const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
await prismaWithRls.$transaction(async (tx) => {
  // All queries here
});
```

Reference: `apps/api/src/common/middleware/rls.middleware.ts`

### Pattern: Frontend Page

Follow the pattern in `apps/web/src/app/[locale]/(school)/payroll/reports/page.tsx`:

- `'use client'` directive
- `useTranslations()` for i18n
- `apiClient<T>()` for data fetching
- `PageHeader` component for title
- Skeleton loading states
- RTL-safe Tailwind (`ms-`, `me-`, `ps-`, `pe-`, `text-start`)

### Pattern: Zod Schemas in Shared Package

Follow the pattern in `packages/shared/src/schemas/approval.schema.ts`:

- Define Zod schema
- Export inferred TypeScript type

### Gotchas and Edge Cases

1. **Audit log interceptor must be non-blocking**: The interceptor should never cause a request to fail. Wrap the write in try/catch and log errors silently.

2. **Audit log entity_type/entity_id extraction**: Parse from the request URL. Convention: `v1/{resource}/{id}` → entity_type = resource, entity_id = id. For nested resources like `v1/payroll/runs/:id`, entity_type = 'payroll_run', entity_id = id.

3. **Audit log metadata_json must NOT include sensitive data**: Strip passwords, tokens, encrypted fields. Include only: request method, path, non-sensitive body fields, response status code.

4. **Dual RLS policy for audit_logs**: Platform admin reads audit_logs WITHOUT tenant context (no RLS filter). School admin reads WITH tenant context. The platform admin controller must NOT use `createRlsClient()` — it should query via plain Prisma with an explicit `WHERE tenant_id = ?` filter or no filter.

5. **Anonymisation idempotency**: Check if fields already contain `ANONYMISED-` prefix before overwriting. This makes the process safe to re-run.

6. **Anonymisation in JSONB snapshot fields**: For `payslips.snapshot_payload_json` and `report_cards.snapshot_payload_json`, parse JSON, replace name fields, write back. Use Prisma's JSON update capabilities.

7. **Import CSV parsing**: Use a streaming CSV parser to handle large files. Process in batches of 100 rows within RLS transactions.

8. **Import duplicate detection**: For students, match on (first_name + last_name + date_of_birth). For parents/staff, match on email. These are "possible duplicate" warnings, not hard blocks — the user decides during confirmation.

9. **Fee generation run report**: Uses audit_logs entries. The `FeeGenerationService.confirm()` must be modified to write an audit log entry with the summary data BEFORE P8 report page can work. This is Step 21 in the implementation order.

10. **Approval callback queues**: The `ApprovalRequestsService` needs to import and inject queues from three different modules (notifications, finance, payroll). This creates a circular dependency risk. Resolve by: (a) injecting queues via `@InjectQueue()` directly (BullMQ queues are registered at the app level, not module level), or (b) using NestJS `forwardRef()` if needed.

11. **Mode A vs Mode B enforcement**: The mapping of action_type → mode is hardcoded in the approval service. Mode A: `announcement_publish`, `invoice_issue`, `payroll_finalise`. Mode B: `application_accept`, `payment_refund`. This must NOT be configurable — it's a fixed system rule per the spec.

12. **Search index status unique constraint**: Use Prisma's `upsert` to handle the unique constraint on (tenant_id, entity_type, entity_id). This prevents duplicate rows when re-indexing.

13. **Worker queue registration**: The new `imports` queue must be registered in BOTH `apps/api/src/app.module.ts` (for enqueuing) and `apps/worker/src/worker.module.ts` (for processing).

14. **Existing payroll callback processor**: The processor at `apps/worker/src/processors/payroll/approval-callback.processor.ts` already handles `payroll:on-approval`. Verify it still works correctly after the approval service modification. The payload shape must match: `{ tenant_id, approval_request_id, target_entity_id, approver_user_id }`.

15. **Parent engagement tracking is instrumentation only**: Do NOT build a dashboard. Just ensure the tracking events are captured in audit_logs. The engagement scoring dashboard is explicitly deferred.

### Cross-Module Wiring Summary

```
ApprovalRequestsService.approve()
  ├── (Mode A) → notifications queue → communications:on-approval → AnnouncementApprovalCallbackProcessor
  ├── (Mode A) → finance queue → finance:on-approval → InvoiceApprovalCallbackProcessor
  └── (Mode A) → payroll queue → payroll:on-approval → PayrollApprovalCallbackProcessor (existing)

ImportService.upload()
  └── imports queue → imports:validate → ImportValidationProcessor

ImportService.confirm()
  └── imports queue → imports:process → ImportProcessingProcessor

ComplianceService.execute()
  └── imports queue → compliance:execute → ComplianceExecutionProcessor

AuditLogInterceptor (global)
  └── AuditLogService.write() → audit_logs table

SearchIndexService.indexEntity()
  └── search_index_status table (upsert)

FeeGenerationService.confirm()
  └── AuditLogService.write() (fee_generation_confirm event)

ReportsService.feeGenerationRuns()
  └── audit_logs table (query fee_generation_confirm events)
```

---

## Validation Checklist

- [x] Every table in the phase spec has a corresponding entry in Section 2: `audit_logs`, `compliance_requests`, `import_jobs`, `search_index_status`
- [x] Every functional requirement has at least one endpoint in Section 3:
  - 4.16 Search → Enhanced indexing + reconciliation (Section 4.10)
  - 4.18.1 Access Export → `POST /compliance-requests/:id/execute` + `GET .../export`
  - 4.18.2 Erasure/Anonymisation → `POST /compliance-requests/:id/execute`
  - 4.18.3 Audit Log Viewer → `GET /audit-logs`, `GET /admin/audit-logs`
  - 4.19.1-15 Reports → Section 3.4 + existing endpoints
  - Cross-domain approvals → Section 3.5
  - Bulk import → Section 3.3
  - Parent engagement → Section 3.6
- [x] Every endpoint has a service method in Section 4
- [x] Every service method is reachable from a controller or job processor
- [x] No tables, endpoints, or features are planned that aren't in the phase spec
- [x] Implementation order in Section 7 has no forward dependencies
