# Phase 6B Implementation Plan — Payroll

---

## Section 1 — Overview

Phase 6B delivers the complete payroll module: staff compensation management (salaried and per-class models), monthly payroll runs with school-wide working days, real-time calculation preview, immutable snapshot finalisation, approval-gated finalisation for non-principal users, payslip generation (individual and mass-export PDF), staff payment history, and payroll analytics (cost trend chart, YTD summary, bonus analysis). After this phase, the principal can run monthly payroll and generate payslips for all staff.

**Dependencies on prior phases**:
- **Phase 0 (P0)**: Core infrastructure — Prisma, RLS middleware (`apps/api/src/common/middleware/rls.middleware.ts`), tenant resolution, auth guards, permission guards, module-enabled guard, audit log interceptor, PdfRenderingService, BullMQ worker base classes
- **Phase 1 (P1)**: RBAC system — permissions already seeded (`packages/shared/src/constants/permissions.ts` includes all `payroll.*` permissions), system roles (`school_owner` has all payroll permissions), approval workflows (`ApprovalRequestsService.checkAndCreateIfNeeded()`)
- **Phase 2 (P2)**: `staff_profiles` table (with bank detail encryption columns), `users` table, staff profiles service and controller
- **Phase 4B**: `schedules` table with `teacher_staff_id`, `effective_start_date`, `effective_end_date` — used for auto-populating per-class teacher class counts
- **Phase 5 (P5)**: `attendance_sessions` table with `schedule_id` — session generation pattern in worker (`apps/worker/src/processors/attendance-session-generation.processor.ts`)
- **Phase 6 (P6)**: Finance patterns — `tenant_sequences` table (with `payslip` type already defined), sequence number generation with `SELECT...FOR UPDATE`, Puppeteer PDF templates, `tenant_branding.payslip_prefix`

**Prior services/modules this phase imports or extends**:
- `PrismaService` (from `modules/prisma/`)
- `ApprovalRequestsService` (from `modules/approvals/`)
- `PdfRenderingService` (from `modules/pdf-rendering/`)
- `StaffProfilesService` (from `modules/staff-profiles/`) — for staff lookups
- `SchedulesService` (from `modules/schedules/`) — for class count auto-population
- `ConfigurationService` (from `modules/configuration/`) — for tenant settings access
- `TenantAwareJob` base class (from `apps/worker/src/base/tenant-aware-job.ts`)
- `QUEUE_NAMES.PAYROLL` (from `apps/worker/src/base/queue.constants.ts`)

---

## Section 2 — Database Changes

### 2.1 New Enum: `CompensationType`

```sql
CREATE TYPE "CompensationType" AS ENUM ('salaried', 'per_class');
```

Prisma:
```prisma
enum CompensationType {
  salaried
  per_class
}
```

### 2.2 New Enum: `PayrollRunStatus`

```sql
CREATE TYPE "PayrollRunStatus" AS ENUM ('draft', 'pending_approval', 'finalised', 'cancelled');
```

Prisma:
```prisma
enum PayrollRunStatus {
  draft
  pending_approval
  finalised
  cancelled
}
```

### 2.3 Table: `staff_compensation`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, `gen_random_uuid()` |
| tenant_id | UUID | NOT NULL, FK → tenants |
| staff_profile_id | UUID | NOT NULL, FK → staff_profiles |
| compensation_type | CompensationType | NOT NULL |
| base_salary | NUMERIC(12,2) | NULL |
| per_class_rate | NUMERIC(12,2) | NULL |
| assigned_class_count | INT | NULL |
| bonus_class_rate | NUMERIC(12,2) | NULL |
| bonus_day_multiplier | NUMERIC(5,2) | NOT NULL, DEFAULT 1.0 |
| effective_from | DATE | NOT NULL |
| effective_to | DATE | NULL |
| created_by_user_id | UUID | NOT NULL, FK → users |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now(), @updatedAt |

**Indexes**:
- `idx_staff_compensation_tenant_staff` on `(tenant_id, staff_profile_id)`
- `idx_staff_compensation_active` — UNIQUE on `(tenant_id, staff_profile_id) WHERE effective_to IS NULL`

**RLS**: Standard tenant isolation policy.

**set_updated_at() trigger**: Yes — has `updated_at`.

**Foreign keys**:
- `tenant_id` → `tenants.id` (CASCADE)
- `staff_profile_id` → `staff_profiles.id` (CASCADE)
- `created_by_user_id` → `users.id` (SET NULL)

**Validation rules** (enforced at API layer via Zod):
- If `compensation_type = 'salaried'`: `base_salary` required, `per_class_rate`/`assigned_class_count`/`bonus_class_rate` must be NULL
- If `compensation_type = 'per_class'`: `per_class_rate`/`assigned_class_count`/`bonus_class_rate` required, `base_salary` must be NULL
- `bonus_day_multiplier` defaults to 1.0; only semantically meaningful for salaried staff
- Only one active record (`effective_to IS NULL`) per `staff_profile_id` per tenant

**Seed data**: None required.

### 2.4 Table: `payroll_runs`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, `gen_random_uuid()` |
| tenant_id | UUID | NOT NULL, FK → tenants |
| period_label | VARCHAR(100) | NOT NULL |
| period_month | SMALLINT | NOT NULL, CHECK (1–12) |
| period_year | SMALLINT | NOT NULL |
| total_working_days | SMALLINT | NOT NULL |
| status | PayrollRunStatus | NOT NULL, DEFAULT 'draft' |
| total_basic_pay | NUMERIC(14,2) | NOT NULL, DEFAULT 0 |
| total_bonus_pay | NUMERIC(14,2) | NOT NULL, DEFAULT 0 |
| total_pay | NUMERIC(14,2) | NOT NULL, DEFAULT 0 |
| headcount | INT | NOT NULL, DEFAULT 0 |
| created_by_user_id | UUID | NOT NULL, FK → users |
| finalised_by_user_id | UUID | NULL, FK → users |
| finalised_at | TIMESTAMPTZ | NULL |
| approval_request_id | UUID | NULL, FK → approval_requests |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now(), @updatedAt |

**Indexes**:
- `idx_payroll_runs_tenant` on `(tenant_id)`
- `idx_payroll_runs_period` — UNIQUE on `(tenant_id, period_month, period_year) WHERE status != 'cancelled'`
- `idx_payroll_runs_tenant_status` on `(tenant_id, status)`

**RLS**: Standard tenant isolation policy.

**set_updated_at() trigger**: Yes.

**Foreign keys**:
- `tenant_id` → `tenants.id` (CASCADE)
- `created_by_user_id` → `users.id` (SET NULL)
- `finalised_by_user_id` → `users.id` (SET NULL)
- `approval_request_id` → `approval_requests.id` (SET NULL)

**Seed data**: None required.

### 2.5 Table: `payroll_entries`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, `gen_random_uuid()` |
| tenant_id | UUID | NOT NULL, FK → tenants |
| payroll_run_id | UUID | NOT NULL, FK → payroll_runs |
| staff_profile_id | UUID | NOT NULL, FK → staff_profiles |
| compensation_type | CompensationType | NOT NULL |
| snapshot_base_salary | NUMERIC(12,2) | NULL |
| snapshot_per_class_rate | NUMERIC(12,2) | NULL |
| snapshot_assigned_class_count | INT | NULL |
| snapshot_bonus_class_rate | NUMERIC(12,2) | NULL |
| snapshot_bonus_day_multiplier | NUMERIC(5,2) | NULL |
| days_worked | SMALLINT | NULL |
| classes_taught | INT | NULL |
| auto_populated_class_count | INT | NULL |
| basic_pay | NUMERIC(12,2) | NOT NULL, DEFAULT 0 |
| bonus_pay | NUMERIC(12,2) | NOT NULL, DEFAULT 0 |
| total_pay | NUMERIC(12,2) | NOT NULL, DEFAULT 0 |
| notes | VARCHAR(1000) | NULL |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT now(), @updatedAt |

**Indexes**:
- `idx_payroll_entries_run` on `(tenant_id, payroll_run_id)`
- `idx_payroll_entries_unique` — UNIQUE on `(tenant_id, payroll_run_id, staff_profile_id)`
- `idx_payroll_entries_staff` on `(tenant_id, staff_profile_id)`

**RLS**: Standard tenant isolation policy.

**set_updated_at() trigger**: Yes.

**Foreign keys**:
- `tenant_id` → `tenants.id` (CASCADE)
- `payroll_run_id` → `payroll_runs.id` (CASCADE)
- `staff_profile_id` → `staff_profiles.id` (CASCADE)

**Seed data**: None required.

### 2.6 Table: `payslips`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, `gen_random_uuid()` |
| tenant_id | UUID | NOT NULL, FK → tenants |
| payroll_entry_id | UUID | NOT NULL, UNIQUE FK → payroll_entries |
| payslip_number | VARCHAR(50) | NOT NULL |
| template_locale | VARCHAR(10) | NOT NULL |
| issued_at | TIMESTAMPTZ | NOT NULL |
| issued_by_user_id | UUID | NULL, FK → users |
| snapshot_payload_json | JSONB | NOT NULL |
| render_version | VARCHAR(50) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT now() |

**No `updated_at`** — payslips are immutable/append-only.

**Indexes**:
- `idx_payslips_number` — UNIQUE on `(tenant_id, payslip_number)`
- `idx_payslips_entry` on `(payroll_entry_id)`

**RLS**: Standard tenant isolation policy.

**set_updated_at() trigger**: No — append-only.

**Foreign keys**:
- `tenant_id` → `tenants.id` (CASCADE)
- `payroll_entry_id` → `payroll_entries.id` (CASCADE)
- `issued_by_user_id` → `users.id` (SET NULL)

**Seed data**: None required.

### 2.7 Post-Migration SQL (RLS Policies)

Add to the migration's `post_migrate.sql`:

```sql
-- staff_compensation
ALTER TABLE staff_compensation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_compensation_tenant_isolation ON staff_compensation;
CREATE POLICY staff_compensation_tenant_isolation ON staff_compensation
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_runs
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_runs_tenant_isolation ON payroll_runs;
CREATE POLICY payroll_runs_tenant_isolation ON payroll_runs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_entries
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_entries_tenant_isolation ON payroll_entries;
CREATE POLICY payroll_entries_tenant_isolation ON payroll_entries
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payslips
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payslips_tenant_isolation ON payslips;
CREATE POLICY payslips_tenant_isolation ON payslips
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- set_updated_at triggers (payslips excluded — append-only)
CREATE TRIGGER set_staff_compensation_updated_at BEFORE UPDATE ON staff_compensation
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_payroll_runs_updated_at BEFORE UPDATE ON payroll_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_payroll_entries_updated_at BEFORE UPDATE ON payroll_entries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

## Section 3 — API Endpoints

All endpoints are under `/api/v1/payroll/...` and guarded with `@ModuleEnabled('payroll')`.

### 3.1 Staff Compensation Endpoints

#### `GET /api/v1/payroll/compensation`
- **Permission**: `payroll.view`
- **Query params**: `page`, `pageSize`, `compensation_type?`, `staff_profile_id?`, `active_only?` (boolean, default true)
- **Response**: `{ data: StaffCompensationListItem[], meta: { page, pageSize, total } }`
  - `StaffCompensationListItem`: compensation record + joined `staff_profile.user.first_name`, `last_name`, `staff_number`, `department`, `employment_type`
- **Business logic**: Query `staff_compensation` with optional filters. If `active_only=true`, filter `WHERE effective_to IS NULL`. Join to `staff_profiles` → `users` for display names.
- **Service method**: `CompensationService.listCompensation()`

#### `GET /api/v1/payroll/compensation/:id`
- **Permission**: `payroll.view`
- **Response**: `{ data: StaffCompensationDetail }`
- **Business logic**: Fetch single compensation record with staff profile details.
- **Error cases**: `COMPENSATION_NOT_FOUND` (404)
- **Service method**: `CompensationService.getCompensation()`

#### `POST /api/v1/payroll/compensation`
- **Permission**: `payroll.manage_compensation`
- **Request schema**:
  ```typescript
  {
    staff_profile_id: z.string().uuid(),
    compensation_type: z.enum(['salaried', 'per_class']),
    base_salary: z.number().positive().multipleOf(0.01).nullable(),
    per_class_rate: z.number().positive().multipleOf(0.01).nullable(),
    assigned_class_count: z.number().int().min(0).nullable(),
    bonus_class_rate: z.number().nonnegative().multipleOf(0.01).nullable(),
    bonus_day_multiplier: z.number().min(0.01).max(10).multipleOf(0.01).default(1.0),
    effective_from: z.string().date(),  // ISO date string YYYY-MM-DD
  }
  ```
- **Response**: `{ data: StaffCompensation }` (201)
- **Business logic**:
  1. Validate compensation type constraints (salaried requires base_salary, per_class requires per_class_rate/assigned_class_count/bonus_class_rate)
  2. Check staff_profile_id exists and belongs to tenant
  3. Find any existing active compensation (`effective_to IS NULL`) for this staff
  4. If found: set its `effective_to = effective_from - 1 day`
  5. Create new compensation record with `effective_to = NULL`
  6. All within a single interactive transaction
- **Error cases**:
  - `STAFF_PROFILE_NOT_FOUND` (404) — invalid staff_profile_id
  - `INVALID_COMPENSATION_FIELDS` (400) — wrong fields for compensation type
  - `EFFECTIVE_DATE_CONFLICT` (400) — effective_from is before or equal to existing record's effective_from
- **Service method**: `CompensationService.createCompensation()`

#### `PUT /api/v1/payroll/compensation/:id`
- **Permission**: `payroll.manage_compensation`
- **Request schema**: Same as create but without `staff_profile_id` (cannot change staff). Includes `expected_updated_at` for optimistic concurrency.
- **Response**: `{ data: StaffCompensation }`
- **Business logic**:
  1. Fetch existing record
  2. Verify optimistic concurrency (`expected_updated_at` matches)
  3. If compensation type changed or effective_from changed: close current record, create new one (same as create flow)
  4. If only rates changed: update in place (only allowed if no finalised payroll run references this record's snapshot)
- **Error cases**:
  - `COMPENSATION_NOT_FOUND` (404)
  - `CONCURRENT_MODIFICATION` (409)
  - `COMPENSATION_REFERENCED_BY_FINALISED_RUN` (400) — cannot edit if snapshotted in a finalised run (create new record instead)
- **Service method**: `CompensationService.updateCompensation()`

#### `POST /api/v1/payroll/compensation/bulk-import`
- **Permission**: `payroll.manage_compensation`
- **Request**: `multipart/form-data` with CSV file
- **Response**: `{ data: { imported: number, skipped: number, errors: ImportError[] } }`
- **Business logic**: Parse CSV (columns: `staff_number`, `compensation_type`, `base_salary`, `per_class_rate`, `assigned_class_count`, `bonus_class_rate`, `bonus_day_multiplier`, `effective_from`). Match staff by `staff_number` within tenant. Create compensation records. Auto-close prior active records.
- **Error cases**: `INVALID_CSV_FORMAT` (400), `STAFF_NOT_FOUND` per row (collected, not blocking)
- **Service method**: `CompensationService.bulkImport()`

### 3.2 Payroll Run Endpoints

#### `GET /api/v1/payroll/runs`
- **Permission**: `payroll.view`
- **Query params**: `page`, `pageSize`, `status?`, `period_year?`, `sort?`, `order?`
- **Response**: `{ data: PayrollRunListItem[], meta: { page, pageSize, total } }`
- **Business logic**: List payroll runs. Exclude cancelled from default view unless `status=cancelled` explicitly requested. Include creator user name.
- **Service method**: `PayrollRunsService.listRuns()`

#### `GET /api/v1/payroll/runs/:id`
- **Permission**: `payroll.view`
- **Response**: `{ data: PayrollRunDetail }` — includes all entries with staff names
- **Business logic**: Fetch run with entries joined to staff_profiles → users. Include summary totals.
- **Error cases**: `PAYROLL_RUN_NOT_FOUND` (404)
- **Service method**: `PayrollRunsService.getRun()`

#### `POST /api/v1/payroll/runs`
- **Permission**: `payroll.create_run`
- **Request schema**:
  ```typescript
  {
    period_label: z.string().min(1).max(100),
    period_month: z.number().int().min(1).max(12),
    period_year: z.number().int().min(2020).max(2100),
    total_working_days: z.number().int().min(1).max(31),
  }
  ```
- **Response**: `{ data: PayrollRun }` (201)
- **Business logic**:
  1. Check no active (non-cancelled) run exists for this month/year
  2. Create run in `draft` status
  3. Find all staff with active compensation records (`effective_to IS NULL` and `employment_status = 'active'`)
  4. For each staff: create a payroll entry, snapshotting their current compensation rates
  5. If `tenant_settings.payroll.autoPopulateClassCounts = true`: for per-class staff, count schedule entries for the month and set `classes_taught` and `auto_populated_class_count`
  6. Return created run
- **Error cases**:
  - `DUPLICATE_PAYROLL_RUN` (409) — active run already exists for this month
  - `NO_ACTIVE_STAFF` (400) — no staff with active compensation (warning, not blocking — still creates run with 0 entries)
- **Service method**: `PayrollRunsService.createRun()`

#### `PATCH /api/v1/payroll/runs/:id`
- **Permission**: `payroll.create_run`
- **Request schema**:
  ```typescript
  {
    period_label: z.string().min(1).max(100).optional(),
    total_working_days: z.number().int().min(1).max(31).optional(),
    expected_updated_at: z.string().datetime(),
  }
  ```
- **Response**: `{ data: PayrollRun }`
- **Business logic**: Only allowed when `status = 'draft'`. If `total_working_days` changed, recalculate all salaried entries. Check optimistic concurrency.
- **Error cases**:
  - `PAYROLL_RUN_NOT_FOUND` (404)
  - `PAYROLL_RUN_NOT_DRAFT` (400) — cannot edit non-draft run
  - `CONCURRENT_MODIFICATION` (409)
- **Service method**: `PayrollRunsService.updateRun()`

#### `POST /api/v1/payroll/runs/:id/refresh-entries`
- **Permission**: `payroll.create_run`
- **Response**: `{ data: { added: number, updated: number, removed: number } }`
- **Business logic**:
  1. Run must be in `draft` status
  2. Find all active staff with active compensation
  3. For each: if entry exists, re-snapshot rates from current compensation; if not, create new entry
  4. Remove entries for staff no longer active or without compensation
  5. Re-auto-populate class counts if setting enabled
  6. Recalculate all entries
- **Error cases**: `PAYROLL_RUN_NOT_DRAFT` (400)
- **Service method**: `PayrollRunsService.refreshEntries()`

#### `POST /api/v1/payroll/runs/:id/trigger-session-generation`
- **Permission**: `payroll.create_run`
- **Response**: `{ data: { job_id: string, status: 'running' } }`
- **Business logic**:
  1. Run must be in `draft` status
  2. Enqueue BullMQ job `payroll:generate-sessions` with `{ tenant_id, payroll_run_id }`
  3. Job generates attendance sessions for all dates in the payroll month (skipping closures), then counts per-teacher sessions and updates `classes_taught` + `auto_populated_class_count` on payroll entries
  4. Return job ID for polling
- **Error cases**: `PAYROLL_RUN_NOT_DRAFT` (400)
- **Service method**: `PayrollRunsService.triggerSessionGeneration()`

#### `GET /api/v1/payroll/runs/:id/session-generation-status`
- **Permission**: `payroll.view`
- **Response**: `{ data: { status: 'running' | 'completed' | 'failed', updated_entry_count: number, started_at: string } }`
- **Business logic**: Check Redis key `payroll:session-gen:{run_id}` for job status. Key set by worker job, TTL 300s.
- **Service method**: `PayrollRunsService.getSessionGenerationStatus()`

#### `POST /api/v1/payroll/runs/:id/finalise`
- **Permission**: `payroll.finalise_run`
- **Request schema**:
  ```typescript
  {
    expected_updated_at: z.string().datetime(),
  }
  ```
- **Response**: `{ data: PayrollRun }` (if approved directly) or `{ data: { status: 'pending_approval', approval_request_id: string } }` (if approval needed)
- **Business logic**:
  1. Run must be in `draft` status
  2. Validate ALL entries have required inputs (salaried: `days_worked` not null; per-class: `classes_taught` not null). Error: `PAYROLL_INCOMPLETE_ENTRIES` with list of incomplete staff names
  3. Check optimistic concurrency
  4. Determine if user has `school_owner` role (direct authority)
  5. Call `ApprovalRequestsService.checkAndCreateIfNeeded()` with `action_type = 'payroll_finalise'`, `target_entity_type = 'payroll_run'`, `target_entity_id = run.id`, `hasDirectAuthority = isSchoolOwner`
  6. If approval needed: set run status to `pending_approval`, store `approval_request_id`, return pending response
  7. If approved: execute finalisation (see `executeFinalisation()` below)
- **Error cases**:
  - `PAYROLL_RUN_NOT_DRAFT` (400)
  - `PAYROLL_INCOMPLETE_ENTRIES` (400)
  - `CONCURRENT_MODIFICATION` (409)
- **Service method**: `PayrollRunsService.finalise()`

#### `POST /api/v1/payroll/runs/:id/cancel`
- **Permission**: `payroll.create_run`
- **Response**: `{ data: PayrollRun }`
- **Business logic**: Only allowed in `draft` or `pending_approval` status. Set status to `cancelled`. If `pending_approval`, also cancel the linked approval request.
- **Error cases**:
  - `PAYROLL_RUN_NOT_FOUND` (404)
  - `PAYROLL_RUN_CANNOT_CANCEL` (400) — already finalised or cancelled
- **Service method**: `PayrollRunsService.cancelRun()`

### 3.3 Payroll Entry Endpoints

#### `PATCH /api/v1/payroll/entries/:id`
- **Permission**: `payroll.create_run`
- **Request schema**:
  ```typescript
  {
    days_worked: z.number().int().min(0).max(60).nullable().optional(),
    classes_taught: z.number().int().min(0).max(500).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    expected_updated_at: z.string().datetime(),
  }
  ```
- **Response**: `{ data: PayrollEntryWithCalculation }` — includes recalculated basic_pay, bonus_pay, total_pay
- **Business logic**:
  1. Entry's run must be in `draft` status
  2. Validate field matches compensation type: `days_worked` only for salaried, `classes_taught` only for per_class
  3. Recalculate pay using the appropriate formula (see Section 4 for formulas)
  4. Return entry with updated calculations
- **Error cases**:
  - `PAYROLL_ENTRY_NOT_FOUND` (404)
  - `PAYROLL_RUN_NOT_DRAFT` (400)
  - `INVALID_FIELD_FOR_COMPENSATION_TYPE` (400)
  - `CONCURRENT_MODIFICATION` (409)
- **Service method**: `PayrollEntriesService.updateEntry()`

#### `POST /api/v1/payroll/entries/:id/calculate`
- **Permission**: `payroll.view`
- **Request schema**:
  ```typescript
  {
    days_worked: z.number().int().min(0).max(60).nullable().optional(),
    classes_taught: z.number().int().min(0).max(500).nullable().optional(),
  }
  ```
- **Response**: `{ data: { basic_pay: number, bonus_pay: number, total_pay: number, daily_rate?: number } }`
- **Business logic**: Pure calculation preview — does NOT persist. Uses the entry's snapshot values + provided inputs. Returns the computed pay breakdown. Used for real-time preview in the UI before saving.
- **Service method**: `CalculationService.previewCalculation()`

### 3.4 Payslip Endpoints

#### `GET /api/v1/payroll/payslips`
- **Permission**: `payroll.view`
- **Query params**: `page`, `pageSize`, `payroll_run_id?`, `staff_profile_id?`
- **Response**: `{ data: PayslipListItem[], meta: { page, pageSize, total } }`
- **Service method**: `PayslipsService.listPayslips()`

#### `GET /api/v1/payroll/payslips/:id`
- **Permission**: `payroll.view`
- **Response**: `{ data: PayslipDetail }`
- **Service method**: `PayslipsService.getPayslip()`

#### `GET /api/v1/payroll/payslips/:id/pdf`
- **Permission**: `payroll.generate_payslips`
- **Query params**: `locale?` (default: from payslip's `template_locale`)
- **Response**: PDF stream (`Content-Type: application/pdf`)
- **Business logic**: Fetch payslip's `snapshot_payload_json`, render via `PdfRenderingService.renderPdf('payslip', locale, payload, branding)`. Stream to client.
- **Error cases**: `PAYSLIP_NOT_FOUND` (404)
- **Service method**: `PayslipsService.renderPayslipPdf()`

#### `POST /api/v1/payroll/runs/:id/mass-export`
- **Permission**: `payroll.generate_payslips`
- **Request schema**:
  ```typescript
  {
    locale: z.enum(['en', 'ar']).default('en'),
  }
  ```
- **Response**: `{ data: { job_id: string, status: 'queued' } }`
- **Business logic**: Run must be finalised. Enqueue BullMQ job `payroll:mass-export-payslips` with `{ tenant_id, payroll_run_id, locale, requested_by_user_id }`. Returns job ID for polling.
- **Error cases**: `PAYROLL_RUN_NOT_FINALISED` (400)
- **Service method**: `PayslipsService.triggerMassExport()`

#### `GET /api/v1/payroll/runs/:id/mass-export-status`
- **Permission**: `payroll.generate_payslips`
- **Response**: `{ data: { status: 'queued' | 'running' | 'completed' | 'failed', progress?: number, download_url?: string } }`
- **Business logic**: Check Redis key `payroll:mass-export:{run_id}` for job status. When completed, the PDF is temporarily stored and a signed download URL is returned (5-minute expiry).
- **Service method**: `PayslipsService.getMassExportStatus()`

### 3.5 Payroll Reports/Analytics Endpoints

#### `GET /api/v1/payroll/reports/cost-trend`
- **Permission**: `payroll.view_reports`
- **Query params**: `academic_year?` (defaults to current), `period_year?`
- **Response**: `{ data: CostTrendPoint[] }`
  ```typescript
  {
    period_month: number,
    period_year: number,
    period_label: string,
    total_basic_pay: number,
    total_bonus_pay: number,
    total_pay: number,
    headcount: number,
  }[]
  ```
- **Business logic**: Query all finalised runs for the specified year, ordered by month. Return aggregated data points.
- **Service method**: `PayrollReportsService.getCostTrend()`

#### `GET /api/v1/payroll/reports/ytd-summary`
- **Permission**: `payroll.view_reports`
- **Query params**: `period_year?` (defaults to current year)
- **Response**: `{ data: YtdStaffSummary[], meta: { page, pageSize, total } }`
  ```typescript
  {
    staff_profile_id: string,
    staff_name: string,
    compensation_type: string,
    ytd_basic: number,
    ytd_bonus: number,
    ytd_total: number,
  }[]
  ```
- **Business logic**: Aggregate all payroll entries across finalised runs in the given year, grouped by staff_profile_id. Join to staff_profiles → users for names.
- **Service method**: `PayrollReportsService.getYtdSummary()`

#### `GET /api/v1/payroll/reports/bonus-analysis`
- **Permission**: `payroll.view_reports`
- **Query params**: `period_year?`
- **Response**: `{ data: BonusAnalysisItem[] }`
  ```typescript
  {
    staff_profile_id: string,
    staff_name: string,
    compensation_type: string,
    months_with_bonus: number,
    total_bonus_amount: number,
    avg_bonus_per_month: number,
  }[]
  ```
- **Business logic**: Query all payroll entries with `bonus_pay > 0` from finalised runs in the given year. Group by staff, compute aggregates.
- **Service method**: `PayrollReportsService.getBonusAnalysis()`

#### `GET /api/v1/payroll/reports/monthly-summary/:runId`
- **Permission**: `payroll.view_reports`
- **Response**: `{ data: MonthlySummaryItem[] }`
  ```typescript
  {
    staff_name: string,
    compensation_type: string,
    basic_pay: number,
    bonus_pay: number,
    total_pay: number,
  }[]
  ```
  Plus `totals: { headcount, total_basic_pay, total_bonus_pay, total_pay }`
- **Business logic**: Fetch all entries for the given run with staff names. Single query with JOIN.
- **Service method**: `PayrollReportsService.getMonthlySummary()`

#### `GET /api/v1/payroll/reports/monthly-summary/:runId/export`
- **Permission**: `payroll.view_reports`
- **Query params**: `format` (`csv` or `pdf`)
- **Response**: CSV or PDF stream
- **Business logic**: Same data as monthly summary, rendered as CSV (comma-delimited with header row) or PDF via Puppeteer.
- **Service method**: `PayrollReportsService.exportMonthlySummary()`

#### `GET /api/v1/payroll/reports/ytd-summary/export`
- **Permission**: `payroll.view_reports`
- **Query params**: `period_year?`, `format` (`csv` or `pdf`)
- **Response**: CSV or PDF stream
- **Service method**: `PayrollReportsService.exportYtdSummary()`

### 3.6 Payroll Dashboard Endpoint

#### `GET /api/v1/payroll/dashboard`
- **Permission**: `payroll.view`
- **Response**:
  ```typescript
  {
    data: {
      current_run: PayrollRunSummary | null,  // latest draft or most recent finalised
      stats: {
        total_pay_this_month: number,
        headcount: number,
        total_bonus: number,
      },
      cost_trend: CostTrendPoint[],  // last 6 months
      incomplete_entries: {
        staff_name: string,
        compensation_type: string,
        missing_field: 'days_worked' | 'classes_taught',
      }[],
    }
  }
  ```
- **Business logic**: Composite query — latest run + stats from latest finalised run + cost trend (last 6 finalised runs) + incomplete entries from current draft.
- **Service method**: `PayrollDashboardService.getDashboard()`

### 3.7 Staff Payment History Endpoint

#### `GET /api/v1/payroll/staff/:staffProfileId/history`
- **Permission**: `payroll.view`
- **Query params**: `page`, `pageSize`
- **Response**: `{ data: StaffPaymentHistoryItem[], meta: { page, pageSize, total } }`
  ```typescript
  {
    payroll_entry_id: string,
    period_label: string,
    period_month: number,
    period_year: number,
    basic_pay: number,
    bonus_pay: number,
    total_pay: number,
    payslip_id: string | null,
  }[]
  ```
- **Business logic**: Query payroll_entries for this staff, only from finalised runs, ordered by period_year desc, period_month desc. Join to payslips for payslip_id.
- **Service method**: `PayrollReportsService.getStaffPaymentHistory()`

---

## Section 4 — Service Layer

### 4.1 CompensationService

- **Class**: `CompensationService`
- **Module**: `PayrollModule`
- **File**: `apps/api/src/modules/payroll/compensation.service.ts`
- **Dependencies**: `PrismaService`, `StaffProfilesService`

**Public methods**:

| Method | Signature | Responsibility |
|--------|-----------|----------------|
| `listCompensation` | `(tenantId: string, filters: ListCompensationFilters) → Promise<PaginatedResult<CompensationListItem>>` | Query compensation records with pagination, join staff names |
| `getCompensation` | `(tenantId: string, id: string) → Promise<CompensationDetail>` | Fetch single record with staff details |
| `createCompensation` | `(tenantId: string, userId: string, dto: CreateCompensationDto) → Promise<StaffCompensation>` | Validate type constraints, close prior active record, create new. All in interactive tx |
| `updateCompensation` | `(tenantId: string, id: string, dto: UpdateCompensationDto) → Promise<StaffCompensation>` | Optimistic concurrency check, update or create-new depending on changes |
| `bulkImport` | `(tenantId: string, userId: string, csvBuffer: Buffer) → Promise<BulkImportResult>` | Parse CSV, validate rows, create compensation records in batch |
| `getActiveCompensation` | `(tenantId: string, staffProfileId: string) → Promise<StaffCompensation \| null>` | Find the active record (effective_to IS NULL) for a given staff member |

**createCompensation step-by-step**:
1. Validate `staff_profile_id` exists in tenant
2. Validate compensation type field constraints
3. Inside interactive transaction:
   a. Find existing active compensation for staff (`WHERE tenant_id = X AND staff_profile_id = Y AND effective_to IS NULL`)
   b. If found and `effective_from <= new.effective_from`: set `effective_to = new.effective_from - 1 day`
   c. If found and `effective_from > new.effective_from`: throw `EFFECTIVE_DATE_CONFLICT`
   d. Create new record with `effective_to = NULL`
4. Return created record

### 4.2 PayrollRunsService

- **Class**: `PayrollRunsService`
- **Module**: `PayrollModule`
- **File**: `apps/api/src/modules/payroll/payroll-runs.service.ts`
- **Dependencies**: `PrismaService`, `CompensationService`, `CalculationService`, `ApprovalRequestsService`, `PayslipsService`, `ConfigurationService`

**Public methods**:

| Method | Signature | Responsibility |
|--------|-----------|----------------|
| `listRuns` | `(tenantId, filters) → Promise<PaginatedResult<PayrollRunListItem>>` | List runs with pagination and filters |
| `getRun` | `(tenantId, runId) → Promise<PayrollRunDetail>` | Get run with all entries and staff names |
| `createRun` | `(tenantId, userId, dto) → Promise<PayrollRun>` | Create run, auto-populate entries from active staff |
| `updateRun` | `(tenantId, runId, dto) → Promise<PayrollRun>` | Edit draft run metadata (period_label, total_working_days) |
| `refreshEntries` | `(tenantId, runId) → Promise<RefreshResult>` | Re-snapshot rates, add new staff, remove inactive |
| `triggerSessionGeneration` | `(tenantId, runId) → Promise<{ job_id }>` | Enqueue BullMQ job for session generation |
| `getSessionGenerationStatus` | `(tenantId, runId) → Promise<SessionGenStatus>` | Check Redis for job status |
| `finalise` | `(tenantId, runId, userId, dto) → Promise<PayrollRun \| ApprovalPending>` | Validate completeness, check approval, execute finalisation |
| `executeFinalisation` | `(tenantId, runId, userId) → Promise<PayrollRun>` | (called by finalise or approval callback) Freeze entries, compute totals, generate payslips |
| `cancelRun` | `(tenantId, runId) → Promise<PayrollRun>` | Cancel draft/pending run |

**createRun step-by-step**:
1. Check no active run exists for month/year: `findFirst({ where: { tenant_id, period_month, period_year, status: { not: 'cancelled' } } })`
2. If found: throw `DUPLICATE_PAYROLL_RUN`
3. Load tenant settings for `autoPopulateClassCounts`
4. Interactive transaction:
   a. Create payroll_run in `draft` status
   b. Query all staff with active compensation: `staff_compensation WHERE tenant_id = X AND effective_to IS NULL`, joined to `staff_profiles WHERE employment_status = 'active'`
   c. For each staff: create payroll_entry with snapshotted rates from compensation record
   d. If `autoPopulateClassCounts = true` and entry is per_class: query schedules for teacher in this month, set `classes_taught` and `auto_populated_class_count`
   e. Calculate pay for entries with inputs using `CalculationService`
5. Return run

**executeFinalisation step-by-step** (called after approval or for direct finalisation):
1. Interactive transaction:
   a. Lock run row: `findFirst({ where: { id: runId, tenant_id } })` — verify still in `draft` or `pending_approval`
   b. Recalculate all entries one final time
   c. Sum across all entries: `total_basic_pay`, `total_bonus_pay`, `total_pay`, `headcount`
   d. Update run: `status = 'finalised'`, `finalised_by_user_id`, `finalised_at = now()`, totals
   e. If approval request exists: update approval request status to `executed`
   f. Generate payslips for all entries (see `PayslipsService.generatePayslipsForRun()`)
2. Return finalised run

### 4.3 PayrollEntriesService

- **Class**: `PayrollEntriesService`
- **Module**: `PayrollModule`
- **File**: `apps/api/src/modules/payroll/payroll-entries.service.ts`
- **Dependencies**: `PrismaService`, `CalculationService`

**Public methods**:

| Method | Signature | Responsibility |
|--------|-----------|----------------|
| `updateEntry` | `(tenantId, entryId, dto) → Promise<PayrollEntryWithCalculation>` | Update input fields, recalculate, persist |

**updateEntry step-by-step**:
1. Fetch entry with its payroll_run
2. Verify run is in `draft` status
3. Check optimistic concurrency
4. Validate field/type match (days_worked only for salaried, classes_taught only for per_class)
5. Call `CalculationService.calculate()` with entry snapshot + new input
6. Update entry with new inputs + calculated values
7. Return updated entry

### 4.4 CalculationService

- **Class**: `CalculationService`
- **Module**: `PayrollModule`
- **File**: `apps/api/src/modules/payroll/calculation.service.ts`
- **Dependencies**: None (pure computation)

**Public methods**:

| Method | Signature | Responsibility |
|--------|-----------|----------------|
| `calculate` | `(entry: CalcInput) → CalcResult` | Compute basic_pay, bonus_pay, total_pay from snapshot + inputs |
| `previewCalculation` | `(entryId, tenantId, dto) → CalcResult` | Load entry, compute without persisting |

**Salaried calculation** (`compensation_type = 'salaried'`):
```
daily_rate = ROUND(snapshot_base_salary / total_working_days, 4)

IF days_worked <= total_working_days:
    basic_pay = ROUND(daily_rate × days_worked, 2)
    bonus_pay = 0
ELSE:
    basic_pay = ROUND(snapshot_base_salary, 2)
    bonus_pay = ROUND(daily_rate × snapshot_bonus_day_multiplier × (days_worked - total_working_days), 2)

total_pay = ROUND(basic_pay + bonus_pay, 2)
```

**Per-class calculation** (`compensation_type = 'per_class'`):
```
IF classes_taught <= snapshot_assigned_class_count:
    basic_pay = ROUND(classes_taught × snapshot_per_class_rate, 2)
    bonus_pay = 0
ELSE:
    basic_pay = ROUND(snapshot_assigned_class_count × snapshot_per_class_rate, 2)
    bonus_pay = ROUND((classes_taught - snapshot_assigned_class_count) × snapshot_bonus_class_rate, 2)

total_pay = ROUND(basic_pay + bonus_pay, 2)
```

**Rounding**: Use `Number(value.toFixed(N))` for intermediate (4dp) and final (2dp) values. All inputs are already NUMERIC from DB. No floating-point issues at this scale.

### 4.5 PayslipsService

- **Class**: `PayslipsService`
- **Module**: `PayrollModule`
- **File**: `apps/api/src/modules/payroll/payslips.service.ts`
- **Dependencies**: `PrismaService`, `PdfRenderingService`, `ConfigurationService`

**Public methods**:

| Method | Signature | Responsibility |
|--------|-----------|----------------|
| `listPayslips` | `(tenantId, filters) → Promise<PaginatedResult<PayslipListItem>>` | List payslips with pagination |
| `getPayslip` | `(tenantId, payslipId) → Promise<PayslipDetail>` | Get single payslip with snapshot data |
| `renderPayslipPdf` | `(tenantId, payslipId, locale?) → Promise<Buffer>` | Render individual payslip PDF |
| `generatePayslipsForRun` | `(tenantId, runId, userId, tx) → Promise<void>` | Generate all payslips for a finalised run (called within finalisation tx) |
| `triggerMassExport` | `(tenantId, runId, locale, userId) → Promise<{ job_id }>` | Enqueue mass export job |
| `getMassExportStatus` | `(tenantId, runId) → Promise<MassExportStatus>` | Check Redis for export job status |

**generatePayslipsForRun step-by-step** (runs within the finalisation transaction):
1. Fetch all entries for this run with staff_profiles → users + tenant branding
2. For each entry:
   a. Generate payslip number: `SELECT current_value FROM tenant_sequences WHERE tenant_id = X AND sequence_type = 'payslip' FOR UPDATE` → increment → format as `{payslip_prefix}-{YYYYMM}-{padded_sequence}`
   b. Build `snapshot_payload_json` from entry data + staff profile + tenant branding
   c. Create payslip record
3. All within the same transaction (passed as `tx` param)

**snapshot_payload_json construction**:
```typescript
{
  staff: {
    full_name: `${user.first_name} ${user.last_name}`,
    staff_number: staffProfile.staff_number,
    department: staffProfile.department,
    job_title: staffProfile.job_title,
    employment_type: staffProfile.employment_type,
    bank_name: staffProfile.bank_name,
    bank_account_last4: decrypt(staffProfile.bank_account_number_encrypted)?.slice(-4) ?? null,
    bank_iban_last4: decrypt(staffProfile.bank_iban_encrypted)?.slice(-4) ?? null,
  },
  period: {
    label: run.period_label,
    month: run.period_month,
    year: run.period_year,
    total_working_days: run.total_working_days,
  },
  compensation: {
    type: entry.compensation_type,
    base_salary: entry.snapshot_base_salary,
    per_class_rate: entry.snapshot_per_class_rate,
    assigned_class_count: entry.snapshot_assigned_class_count,
    bonus_class_rate: entry.snapshot_bonus_class_rate,
    bonus_day_multiplier: entry.snapshot_bonus_day_multiplier,
  },
  inputs: {
    days_worked: entry.days_worked,
    classes_taught: entry.classes_taught,
  },
  calculations: {
    basic_pay: entry.basic_pay,
    bonus_pay: entry.bonus_pay,
    total_pay: entry.total_pay,
  },
  school: {
    name: branding.school_name_display ?? tenant.name,
    name_ar: branding.school_name_ar,
    logo_url: branding.logo_url,
    currency_code: tenant.currency_code,
  },
}
```

### 4.6 PayrollReportsService

- **Class**: `PayrollReportsService`
- **Module**: `PayrollModule`
- **File**: `apps/api/src/modules/payroll/payroll-reports.service.ts`
- **Dependencies**: `PrismaService`, `PdfRenderingService`

**Public methods**:

| Method | Signature | Responsibility |
|--------|-----------|----------------|
| `getCostTrend` | `(tenantId, year?) → Promise<CostTrendPoint[]>` | Aggregate finalised runs by month for chart |
| `getYtdSummary` | `(tenantId, year?, page?, pageSize?) → Promise<PaginatedResult<YtdStaffSummary>>` | Per-staff YTD totals |
| `getBonusAnalysis` | `(tenantId, year?) → Promise<BonusAnalysisItem[]>` | Staff bonus frequency/totals |
| `getMonthlySummary` | `(tenantId, runId) → Promise<MonthlySummaryResult>` | Single run's entries with staff names and totals |
| `exportMonthlySummary` | `(tenantId, runId, format) → Promise<Buffer>` | CSV or PDF export |
| `exportYtdSummary` | `(tenantId, year?, format) → Promise<Buffer>` | CSV or PDF export |
| `getStaffPaymentHistory` | `(tenantId, staffProfileId, page?, pageSize?) → Promise<PaginatedResult<StaffPaymentHistoryItem>>` | Per-staff history across finalised runs |

### 4.7 PayrollDashboardService

- **Class**: `PayrollDashboardService`
- **Module**: `PayrollModule`
- **File**: `apps/api/src/modules/payroll/payroll-dashboard.service.ts`
- **Dependencies**: `PrismaService`, `PayrollReportsService`

**Public methods**:

| Method | Signature | Responsibility |
|--------|-----------|----------------|
| `getDashboard` | `(tenantId) → Promise<PayrollDashboardData>` | Composite: latest run, stats, cost trend, incomplete entries |

---

## Section 5 — Frontend Pages and Components

**All pages under**: `apps/web/src/app/[locale]/(school)/payroll/`

### 5.1 Payroll Dashboard Page

- **File**: `apps/web/src/app/[locale]/(school)/payroll/page.tsx`
- **Route**: `/[locale]/payroll`
- **Type**: Client component (`'use client'`)
- **Data**: Calls `GET /api/v1/payroll/dashboard`
- **UI**:
  - PageHeader: "Payroll" with action buttons: "New Payroll Run" / "Continue Draft"
  - StatCard row: Total Pay This Month, Headcount, Total Bonus
  - Payroll Cost Trend mini-chart (Recharts AreaChart, last 6 months)
  - Current/Latest Run status card with quick actions
  - Incomplete entries warning list (staff missing inputs)
  - Quick links: "Export All Payslips", "Staff Payment Histories"
- **Role visibility**: Users with `payroll.view` permission

### 5.2 Compensation Management Page

- **File**: `apps/web/src/app/[locale]/(school)/payroll/compensation/page.tsx`
- **Route**: `/[locale]/payroll/compensation`
- **Type**: Client component
- **Data**: Calls `GET /api/v1/payroll/compensation`
- **UI**:
  - PageHeader: "Staff Compensation" with actions: "Add Compensation", "Bulk Import"
  - DataTable: Staff Name | Type (Salaried/Per-Class) | Rate/Salary | Bonus Config | Effective From | Actions
  - Filter by compensation type
  - Warning badges for staff missing bank details
  - StatusBadge for compensation type
- **Role visibility**: `payroll.manage_compensation`

### 5.3 Compensation Create/Edit Dialog

- **File**: `apps/web/src/app/[locale]/(school)/payroll/compensation/_components/compensation-form.tsx`
- **Type**: Client component (Dialog/Sheet)
- **UI**:
  - Select: Staff member (searchable, filtered to active staff without active compensation for create)
  - RadioGroup: Compensation type (Salaried / Per-Class)
  - Conditional fields:
    - Salaried: Base Salary, Bonus Day Multiplier
    - Per-Class: Per-Class Rate, Assigned Class Count, Bonus Class Rate
  - Date input: Effective From
- **API**: `POST /api/v1/payroll/compensation` or `PUT /api/v1/payroll/compensation/:id`

### 5.4 Compensation Bulk Import Dialog

- **File**: `apps/web/src/app/[locale]/(school)/payroll/compensation/_components/bulk-import-dialog.tsx`
- **Type**: Client component (Dialog)
- **UI**: File upload zone, CSV template download link, import progress, results summary (imported/skipped/errors)
- **API**: `POST /api/v1/payroll/compensation/bulk-import`

### 5.5 Payroll Runs List Page

- **File**: `apps/web/src/app/[locale]/(school)/payroll/runs/page.tsx`
- **Route**: `/[locale]/payroll/runs`
- **Type**: Client component
- **Data**: `GET /api/v1/payroll/runs`
- **UI**:
  - PageHeader: "Payroll Runs" with action: "New Payroll Run"
  - DataTable: Period | Status | Headcount | Total Pay | Created | Actions
  - StatusBadge for run status (draft=amber, pending_approval=blue, finalised=green, cancelled=gray)
  - Filter by status, year
  - Click row → navigate to run detail
- **Role visibility**: `payroll.view`

### 5.6 Create Payroll Run Dialog

- **File**: `apps/web/src/app/[locale]/(school)/payroll/runs/_components/create-run-dialog.tsx`
- **Type**: Client component (Dialog)
- **UI**: Period Label, Month/Year selects, Total Working Days input
- **API**: `POST /api/v1/payroll/runs`

### 5.7 Payroll Run Detail Page (Draft Editing + Summary)

- **File**: `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/page.tsx`
- **Route**: `/[locale]/payroll/runs/:id`
- **Type**: Client component
- **Data**: `GET /api/v1/payroll/runs/:id`
- **UI**:
  - PageHeader: `{period_label}` with StatusBadge and actions (Refresh Entries, Finalise, Cancel, Export Payslips)
  - Run metadata card: Period, Total Working Days (editable in draft), Headcount, Totals
  - **Entries table** (the main working area):
    - Columns: Staff Name | Type | Rate/Salary | Days Worked / Classes Taught | Basic Pay | Bonus Pay | Total Pay | Notes
    - Inline editing: `days_worked` (salaried) or `classes_taught` (per-class) input fields
    - Real-time calculation preview: on input change, call `POST /api/v1/payroll/entries/:id/calculate` and display updated values before save
    - Save button per row or auto-save on blur via `PATCH /api/v1/payroll/entries/:id`
    - Notes column: expandable text input
  - **Session generation**: For per-class entries, "Auto-populate Classes" button triggers session generation job. Poll `GET .../session-generation-status` every 10s, max 12 attempts. Show spinner/progress indicator.
  - **Summary footer**: Total Headcount | Total Basic | Total Bonus | Grand Total
  - **Finalise confirmation**: Dialog with summary review before confirming
  - Sortable by column, filterable by compensation type
- **Role visibility**: `payroll.view` (read), `payroll.create_run` (edit), `payroll.finalise_run` (finalise)

### 5.8 Staff Payment History Page

- **File**: `apps/web/src/app/[locale]/(school)/payroll/staff/[staffProfileId]/page.tsx`
- **Route**: `/[locale]/payroll/staff/:staffProfileId`
- **Type**: Client component
- **Data**: `GET /api/v1/payroll/staff/:staffProfileId/history`
- **UI**:
  - PageHeader: Staff name with breadcrumb back to payroll
  - DataTable: Month | Period Label | Basic Pay | Bonus Pay | Total Pay | Payslip (print button)
  - Print button: calls `GET /api/v1/payroll/payslips/:id/pdf`, opens in new tab
- **Role visibility**: `payroll.view`

### 5.9 Payroll Reports Page

- **File**: `apps/web/src/app/[locale]/(school)/payroll/reports/page.tsx`
- **Route**: `/[locale]/payroll/reports`
- **Type**: Client component
- **Data**: Multiple API calls for each report section
- **UI** (tabbed layout):
  - **Tab: Cost Trend** — Recharts AreaChart with interactive tooltips (month, basic, bonus, total, headcount). Toggle overlay: basic vs bonus stacked areas. Click data point → navigate to that run's summary.
  - **Tab: YTD Summary** — DataTable with staff name, type, YTD basic/bonus/total. Export to CSV/PDF buttons.
  - **Tab: Bonus Analysis** — DataTable with staff name, type, months with bonus, total bonus, avg bonus/month. Sorted by total bonus desc.
- **Role visibility**: `payroll.view_reports`

### 5.10 Translation Keys

Add keys to `messages/en.json` and `messages/ar.json` under `payroll` namespace:
- `payroll.title`, `payroll.compensation`, `payroll.runs`, `payroll.reports`, etc.
- `payroll.dashboard.totalPay`, `payroll.dashboard.headcount`, `payroll.dashboard.totalBonus`
- `payroll.status.draft`, `payroll.status.pending_approval`, `payroll.status.finalised`, `payroll.status.cancelled`
- `payroll.type.salaried`, `payroll.type.per_class`
- All form labels, table headers, error messages, confirmation dialogs

---

## Section 6 — Background Jobs

### 6.1 Job: `payroll:generate-sessions`

- **Queue**: `QUEUE_NAMES.PAYROLL`
- **Processor file**: `apps/worker/src/processors/payroll/session-generation.processor.ts`
- **Trigger**: `POST /api/v1/payroll/runs/:id/trigger-session-generation`
- **Payload**:
  ```typescript
  {
    tenant_id: string,
    payroll_run_id: string,
  }
  ```
- **Processing logic**:
  1. Set RLS context (via TenantAwareJob base)
  2. Fetch run to get period_month, period_year
  3. Write Redis key `payroll:session-gen:{run_id}` = `{ status: 'running', updated_entry_count: 0, started_at: now() }` with TTL 600s
  4. For each per-class staff entry in the run:
     a. Query schedules for this teacher active in the payroll month
     b. Count unique schedule entries (each schedule = one recurring class per week)
     c. Calculate total sessions: for each schedule, count how many weekday occurrences fall in the month, minus school closures on those dates
     d. Update entry's `classes_taught` and `auto_populated_class_count` with the count
     e. Recalculate entry pay
  5. Update Redis key: `{ status: 'completed', updated_entry_count: N }`
  6. On failure: update Redis key: `{ status: 'failed' }`
- **Retry**: 1 retry with 30s backoff
- **Timeout**: 5 minutes (300_000 ms)

### 6.2 Job: `payroll:mass-export-payslips`

- **Queue**: `QUEUE_NAMES.PAYROLL`
- **Processor file**: `apps/worker/src/processors/payroll/mass-export.processor.ts`
- **Trigger**: `POST /api/v1/payroll/runs/:id/mass-export`
- **Payload**:
  ```typescript
  {
    tenant_id: string,
    payroll_run_id: string,
    locale: 'en' | 'ar',
    requested_by_user_id: string,
  }
  ```
- **Processing logic**:
  1. Set RLS context
  2. Write Redis key `payroll:mass-export:{run_id}` = `{ status: 'running', progress: 0 }`
  3. Fetch all payslips for this run
  4. Fetch tenant branding
  5. For each payslip:
     a. Render HTML from `snapshot_payload_json` using payslip template
     b. Collect HTML pages
     c. Update Redis progress
  6. Render consolidated PDF with Puppeteer (all pages in one browser context, page breaks between payslips)
  7. Upload PDF to S3: `/{tenant_id}/temp/payroll-exports/{run_id}-{timestamp}.pdf` with 1-hour expiry lifecycle
  8. Update Redis: `{ status: 'completed', download_url: presigned_s3_url }`
  9. On failure: `{ status: 'failed' }`
- **Retry**: 1 retry with 60s backoff
- **Timeout**: 5 minutes (300_000 ms)

### 6.3 Approval Callback Job: `payroll:on-approval`

- **Queue**: `QUEUE_NAMES.PAYROLL`
- **Processor file**: `apps/worker/src/processors/payroll/approval-callback.processor.ts`
- **Trigger**: When `approval_requests` status transitions to `approved` with `action_type = 'payroll_finalise'`
- **Payload**:
  ```typescript
  {
    tenant_id: string,
    approval_request_id: string,
    target_entity_id: string,  // payroll_run.id
    approver_user_id: string,
  }
  ```
- **Processing logic**:
  1. Set RLS context
  2. Fetch payroll run, verify status is `pending_approval`
  3. Call `PayrollRunsService.executeFinalisation()` with the approver as the finalising user
  4. Update approval request to `executed`
- **Retry**: 2 retries with 30s backoff

---

## Section 7 — Implementation Order

### Step 1: Database Migration & Enums
- Add `CompensationType` and `PayrollRunStatus` enums to Prisma schema
- Add `StaffCompensation`, `PayrollRun`, `PayrollEntry`, `Payslip` models to Prisma schema
- Add relations to existing models (Tenant, StaffProfile, User, ApprovalRequest)
- Run `prisma migrate dev --name add-payroll-tables`
- Create `post_migrate.sql` with RLS policies and triggers

### Step 2: Shared Types & Zod Schemas
- Add payroll Zod schemas to `packages/shared/src/schemas/payroll.schema.ts`
- Add payroll types to `packages/shared/src/types/payroll.ts`
- Add `payslipSnapshotPayloadSchema` Zod schema for JSONB validation
- Export from `packages/shared/src/index.ts`

### Step 3: Calculation Service (pure logic, no dependencies)
- Create `apps/api/src/modules/payroll/calculation.service.ts`
- Implement salaried and per-class calculation formulas
- Unit test with exact expected outputs covering all edge cases

### Step 4: Compensation Service
- Create `apps/api/src/modules/payroll/compensation.service.ts`
- CRUD operations with effective date management
- Bulk import from CSV
- Depends on: PrismaService, StaffProfilesService

### Step 5: Compensation Controller
- Create `apps/api/src/modules/payroll/compensation.controller.ts`
- Wire up all compensation endpoints
- Permission guards: `payroll.view`, `payroll.manage_compensation`

### Step 6: Payslips Service
- Create `apps/api/src/modules/payroll/payslips.service.ts`
- Payslip generation with sequence numbers
- Individual PDF rendering
- Mass export trigger

### Step 7: Payroll Entries Service
- Create `apps/api/src/modules/payroll/payroll-entries.service.ts`
- Entry update with recalculation
- Preview calculation endpoint

### Step 8: Payroll Runs Service
- Create `apps/api/src/modules/payroll/payroll-runs.service.ts`
- Full lifecycle: create, update, refresh, finalise, cancel
- Approval integration
- Depends on: CompensationService, CalculationService, PayslipsService, ApprovalRequestsService

### Step 9: Payroll Reports Service
- Create `apps/api/src/modules/payroll/payroll-reports.service.ts`
- Cost trend, YTD summary, bonus analysis, monthly summary, staff history
- CSV and PDF export

### Step 10: Payroll Dashboard Service
- Create `apps/api/src/modules/payroll/payroll-dashboard.service.ts`
- Composite dashboard endpoint

### Step 11: Payroll Controllers (Runs, Entries, Payslips, Reports, Dashboard)
- Create `apps/api/src/modules/payroll/payroll-runs.controller.ts`
- Create `apps/api/src/modules/payroll/payroll-entries.controller.ts`
- Create `apps/api/src/modules/payroll/payslips.controller.ts`
- Create `apps/api/src/modules/payroll/payroll-reports.controller.ts`
- Create `apps/api/src/modules/payroll/payroll-dashboard.controller.ts`
- Wire up all endpoints with guards

### Step 12: Payroll Module Registration
- Create `apps/api/src/modules/payroll/payroll.module.ts`
- Register in `AppModule`
- Import dependencies: PrismaModule, ApprovalsModule, PdfRenderingModule, StaffProfilesModule, ConfigurationModule

### Step 13: Payslip PDF Templates
- Create `apps/api/src/modules/pdf-rendering/templates/payslip-en.template.ts`
- Create `apps/api/src/modules/pdf-rendering/templates/payslip-ar.template.ts`
- Register in `PdfRenderingService` TEMPLATES map
- Snapshot tests for both locales

### Step 14: BullMQ Worker Jobs
- Create `apps/worker/src/processors/payroll/session-generation.processor.ts`
- Create `apps/worker/src/processors/payroll/mass-export.processor.ts`
- Create `apps/worker/src/processors/payroll/approval-callback.processor.ts`
- Register processors in worker module

### Step 15: Frontend — Translation Keys
- Add payroll translation keys to `messages/en.json` and `messages/ar.json`

### Step 16: Frontend — Payroll Dashboard Page
- Create `apps/web/src/app/[locale]/(school)/payroll/page.tsx`
- StatCards, cost trend mini-chart, current run status, incomplete entries

### Step 17: Frontend — Compensation Management
- Create compensation list page + create/edit form + bulk import dialog

### Step 18: Frontend — Payroll Runs List + Create Dialog
- Create runs list page + create run dialog

### Step 19: Frontend — Payroll Run Detail (Draft Editing + Summary)
- Create run detail page with inline entry editing, real-time calculation, session generation polling, finalise workflow

### Step 20: Frontend — Staff Payment History
- Create staff payment history page with payslip print links

### Step 21: Frontend — Reports Page
- Create reports page with tabs: cost trend chart, YTD summary, bonus analysis
- Export to CSV/PDF functionality

### Step 22: Frontend — Navigation Integration
- Add payroll to sidebar navigation under OPERATIONS section
- Add payroll routes to navigation config

---

## Section 8 — Files to Create

### Backend (`apps/api/src/modules/payroll/`)
1. `apps/api/src/modules/payroll/payroll.module.ts`
2. `apps/api/src/modules/payroll/compensation.service.ts`
3. `apps/api/src/modules/payroll/compensation.controller.ts`
4. `apps/api/src/modules/payroll/payroll-runs.service.ts`
5. `apps/api/src/modules/payroll/payroll-runs.controller.ts`
6. `apps/api/src/modules/payroll/payroll-entries.service.ts`
7. `apps/api/src/modules/payroll/payroll-entries.controller.ts`
8. `apps/api/src/modules/payroll/payslips.service.ts`
9. `apps/api/src/modules/payroll/payslips.controller.ts`
10. `apps/api/src/modules/payroll/calculation.service.ts`
11. `apps/api/src/modules/payroll/payroll-reports.service.ts`
12. `apps/api/src/modules/payroll/payroll-reports.controller.ts`
13. `apps/api/src/modules/payroll/payroll-dashboard.service.ts`
14. `apps/api/src/modules/payroll/payroll-dashboard.controller.ts`
15. `apps/api/src/modules/payroll/dto/create-compensation.dto.ts`
16. `apps/api/src/modules/payroll/dto/update-compensation.dto.ts`
17. `apps/api/src/modules/payroll/dto/create-payroll-run.dto.ts`
18. `apps/api/src/modules/payroll/dto/update-payroll-run.dto.ts`
19. `apps/api/src/modules/payroll/dto/update-payroll-entry.dto.ts`
20. `apps/api/src/modules/payroll/dto/calculate-entry.dto.ts`

### PDF Templates
21. `apps/api/src/modules/pdf-rendering/templates/payslip-en.template.ts`
22. `apps/api/src/modules/pdf-rendering/templates/payslip-ar.template.ts`

### Worker Processors
23. `apps/worker/src/processors/payroll/session-generation.processor.ts`
24. `apps/worker/src/processors/payroll/mass-export.processor.ts`
25. `apps/worker/src/processors/payroll/approval-callback.processor.ts`

### Shared Packages
26. `packages/shared/src/schemas/payroll.schema.ts`
27. `packages/shared/src/types/payroll.ts`

### Prisma Migration
28. `packages/prisma/migrations/{timestamp}_add-payroll-tables/migration.sql` (auto-generated)
29. `packages/prisma/migrations/{timestamp}_add-payroll-tables/post_migrate.sql`

### Frontend Pages
30. `apps/web/src/app/[locale]/(school)/payroll/page.tsx` (dashboard)
31. `apps/web/src/app/[locale]/(school)/payroll/layout.tsx`
32. `apps/web/src/app/[locale]/(school)/payroll/compensation/page.tsx`
33. `apps/web/src/app/[locale]/(school)/payroll/compensation/_components/compensation-form.tsx`
34. `apps/web/src/app/[locale]/(school)/payroll/compensation/_components/bulk-import-dialog.tsx`
35. `apps/web/src/app/[locale]/(school)/payroll/runs/page.tsx`
36. `apps/web/src/app/[locale]/(school)/payroll/runs/_components/create-run-dialog.tsx`
37. `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/page.tsx`
38. `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/_components/entries-table.tsx`
39. `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/_components/finalise-dialog.tsx`
40. `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/_components/run-metadata-card.tsx`
41. `apps/web/src/app/[locale]/(school)/payroll/staff/[staffProfileId]/page.tsx`
42. `apps/web/src/app/[locale]/(school)/payroll/reports/page.tsx`
43. `apps/web/src/app/[locale]/(school)/payroll/reports/_components/cost-trend-chart.tsx`
44. `apps/web/src/app/[locale]/(school)/payroll/reports/_components/ytd-summary-table.tsx`
45. `apps/web/src/app/[locale]/(school)/payroll/reports/_components/bonus-analysis-table.tsx`

---

## Section 9 — Files to Modify

### Prisma Schema
1. **`packages/prisma/schema.prisma`** — Add `CompensationType` enum, `PayrollRunStatus` enum, `StaffCompensation` model, `PayrollRun` model, `PayrollEntry` model, `Payslip` model. Add relations to `Tenant`, `StaffProfile`, `User`, `ApprovalRequest` models.

### Backend
2. **`apps/api/src/app.module.ts`** — Import and register `PayrollModule`
3. **`apps/api/src/modules/pdf-rendering/pdf-rendering.service.ts`** — Add `payslip` to TEMPLATES map, import payslip template functions
4. **`apps/api/src/modules/approvals/approval-requests.service.ts`** — Add callback hook mechanism: when approval status changes to `approved` with `action_type = 'payroll_finalise'`, enqueue `payroll:on-approval` BullMQ job (or use event emitter pattern if already established)

### Worker
5. **`apps/worker/src/main.ts`** (or equivalent module registration) — Register payroll queue processors
6. **`apps/worker/src/base/queue.constants.ts`** — `PAYROLL` queue already defined, no change needed

### Shared
7. **`packages/shared/src/index.ts`** — Export new payroll schemas and types

### Frontend
8. **`messages/en.json`** — Add `payroll.*` translation keys
9. **`messages/ar.json`** — Add `payroll.*` translation keys (Arabic translations)
10. **Navigation config** (wherever sidebar items are defined) — Add payroll menu items under OPERATIONS section

---

## Section 10 — Key Context for Executor

### Pattern References (with file paths)

1. **RLS middleware pattern**: `apps/api/src/common/middleware/rls.middleware.ts`
   - Use `createRlsClient(prisma, { tenant_id })` to get RLS-scoped client
   - ALL tenant-scoped queries must use `prismaWithRls.$transaction(async (tx) => { ... })`

2. **Controller pattern**: `apps/api/src/modules/staff-profiles/staff-profiles.controller.ts`
   - Thin controllers with decorators: `@RequiresPermission()`, `@ModuleEnabled()`, `@CurrentTenant()`, `@CurrentUser()`
   - Uses `ZodValidationPipe` for request body validation

3. **Service with RLS pattern**: `apps/api/src/modules/staff-profiles/staff-profiles.service.ts`
   - Services create RLS client per request, use interactive transactions
   - Throw typed HttpException subclasses

4. **Approval integration**: `apps/api/src/modules/approvals/approval-requests.service.ts`
   - Call `checkAndCreateIfNeeded(tenantId, actionType, entityType, entityId, requesterId, hasDirectAuthority)`
   - Returns `{ approved: true }` or `{ approved: false, request_id }`

5. **PDF rendering**: `apps/api/src/modules/pdf-rendering/pdf-rendering.service.ts`
   - Template functions return HTML string, registered in TEMPLATES map
   - Example templates: `apps/api/src/modules/pdf-rendering/templates/report-card-en.template.ts`

6. **BullMQ worker pattern**: `apps/worker/src/processors/attendance-session-generation.processor.ts`
   - Extend `TenantAwareJob`, implement `processJob(data, tx)`
   - Processor class with `@Processor(QUEUE_NAMES.X)` decorator

7. **Frontend list page**: `apps/web/src/app/[locale]/(school)/staff/page.tsx`
   - Client component with `useCallback` data fetch, `useEffect` dependency tracking
   - Uses `apiClient`, `DataTable`, `PageHeader` components

8. **Frontend form**: `apps/web/src/app/[locale]/(school)/staff/_components/staff-form.tsx`
   - Controlled inputs with `useState`, sections, validation on submit

9. **Sequence generation**: `tenant_sequences` table with `SELECT...FOR UPDATE`
   - Format: `{prefix}-{YYYYMM}-{padded_sequence}` (e.g., `PSL-202603-000001`)
   - Branding prefix: `tenant_branding.payslip_prefix` (default `PSL`)

### Gotchas & Edge Cases

1. **Division by zero**: `total_working_days` must be >= 1. API validation rejects 0. The `CalculationService` should also guard against this defensively.

2. **Partial unique index for payroll runs**: Prisma doesn't natively support `WHERE` clauses in `@@unique`. Use `@@index` in Prisma + raw SQL in `post_migrate.sql` for the actual unique partial index:
   ```sql
   CREATE UNIQUE INDEX idx_payroll_runs_period ON payroll_runs(tenant_id, period_month, period_year) WHERE status != 'cancelled';
   ```
   In the Prisma schema, add a regular `@@index` for query performance but NOT `@@unique` (which would be unconditional).

3. **Partial unique index for staff_compensation**: Same pattern:
   ```sql
   CREATE UNIQUE INDEX idx_staff_compensation_active ON staff_compensation(tenant_id, staff_profile_id) WHERE effective_to IS NULL;
   ```

4. **Monetary rounding**: All intermediate calculations use 4 decimal places. Final values round to 2dp. Use `Number(value.toFixed(N))` — safe at this scale since all values are well within float64 safe range. For the DB, Prisma returns `Decimal` objects from NUMERIC columns — convert to `Number` for calculation, round, then store.

5. **Payslip generation in finalisation transaction**: Payslips are generated INSIDE the same transaction as finalisation. This is critical — if payslip generation fails, the run should NOT be marked as finalised. The sequence number locking (`SELECT...FOR UPDATE` on `tenant_sequences`) works within the interactive transaction.

6. **Bank detail decryption for payslips**: During payslip snapshot generation, bank details need to be decrypted to extract last 4 digits. This happens within the finalisation transaction. The decryption key is fetched from AWS Secrets Manager (cached in memory). If decryption fails, the payslip should still generate with `null` bank detail fields — not blocking.

7. **Auto-populate class counts**: The session generation job counts schedule entries for a teacher in the payroll month. A "schedule entry" is a recurring weekly slot. The count should be: number of unique schedule records active during the month (NOT the number of individual date occurrences). The spec says "count of schedule entries where `teacher_staff_id` matches and `effective_start_date <= last_day_of_month AND (effective_end_date IS NULL OR effective_end_date >= first_day_of_month)`". This is a count of distinct schedules, not sessions.

8. **Approval callback**: When an approval request is approved via the approvals module, the payroll module needs to be notified to execute finalisation. The cleanest pattern is: the approvals service emits a BullMQ job to `QUEUE_NAMES.PAYROLL` with job name `payroll:on-approval` when the approval status transitions to `approved` and the `action_type` is `payroll_finalise`. The payroll worker processor then calls `PayrollRunsService.executeFinalisation()`.

9. **Cancelled run frees month**: The unique constraint on `(tenant_id, period_month, period_year)` uses `WHERE status != 'cancelled'`, so cancelling a run allows creating a new one for the same month.

10. **Immutability after finalisation**: Once a run is finalised, NO updates are allowed to the run, its entries, or its payslips. All PATCH/update endpoints must verify `status = 'draft'` before proceeding.

11. **Frontend RTL**: ALL Tailwind classes must use logical properties: `ms-`, `me-`, `ps-`, `pe-`, `text-start`, `text-end`, `rounded-s-`, `rounded-e-`, `border-s-`, `border-e-`. Never `ml-`, `mr-`, `pl-`, `pr-`, `text-left`, `text-right`, etc.

12. **Recharts for cost trend chart**: Use `AreaChart` with `Area` components for basic/bonus stacked areas. Use `Tooltip` for hover data. Use `onClick` on data points for drill-through navigation. Import from `recharts` (already in deps).

13. **Mass export temp file**: The consolidated PDF is stored temporarily in S3 under `/{tenant_id}/temp/payroll-exports/` with a lifecycle rule for 1-hour expiry. The download URL is a presigned S3 URL.

### Cross-Module Wiring

- **PayrollModule** imports: `PrismaModule`, `ApprovalsModule` (for `ApprovalRequestsService`), `PdfRenderingModule` (for rendering), `StaffProfilesModule` (for staff lookups), `ConfigurationModule` (for tenant settings), `SchedulesModule` (for class count queries)
- **PayrollModule** exports: `PayrollRunsService` (for approval callback in worker)
- **AppModule** registers `PayrollModule`
- **Worker** registers payroll queue processors
- **PdfRenderingService** updated to include payslip templates

---

## Validation Checklist

- [x] Every table in the phase instruction file has a corresponding entry in Section 2:
  - `staff_compensation` → Section 2.3
  - `payroll_runs` → Section 2.4
  - `payroll_entries` → Section 2.5
  - `payslips` → Section 2.6
- [x] Every functional requirement has at least one endpoint in Section 3:
  - 4.12.1 (Compensation CRUD) → 3.1 endpoints
  - 4.12.2 (Create Run) → POST /runs
  - 4.12.3 (Edit Salaried) → PATCH /entries/:id
  - 4.12.4 (Edit Per-Class + auto-populate) → PATCH /entries/:id + trigger-session-generation
  - 4.12.5 (Summary Review) → GET /runs/:id
  - 4.12.6 (Finalisation) → POST /runs/:id/finalise
  - 4.12.7 (Payslip Generation) → payslips endpoints + mass-export
  - 4.12.8 (Staff History) → GET /staff/:id/history
  - 4.12.9 (Mid-Month Rate Change) → POST /runs/:id/refresh-entries
  - 4.12.10 (Cancellation) → POST /runs/:id/cancel
  - 4.19.11 (Monthly Summary Report) → GET /reports/monthly-summary/:runId
  - 4.19.12 (Cost Trend) → GET /reports/cost-trend
  - 4.19.13 (Staff Payment History) → GET /staff/:id/history
  - 4.19.14 (YTD Summary) → GET /reports/ytd-summary
  - 4.19.15 (Bonus Analysis) → GET /reports/bonus-analysis
  - Dashboard → GET /dashboard
- [x] Every endpoint has a service method in Section 4
- [x] Every service method is reachable from a controller or job processor
- [x] No tables, endpoints, or features planned that aren't in the phase spec
- [x] Implementation order in Section 7 has no forward dependencies
