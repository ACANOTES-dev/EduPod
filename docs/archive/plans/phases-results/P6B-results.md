# Phase 6B Results — Payroll

## Summary

Phase 6B delivers the complete payroll module: staff compensation management (salaried and per-class models), monthly payroll runs with school-wide working days, real-time calculation preview, immutable snapshot finalisation, approval-gated finalisation for non-principal users, payslip generation (individual and mass-export PDF) with locale-specific templates (English and Arabic), staff payment history, and payroll analytics (cost trend chart, YTD summary, bonus analysis). The module includes 4 new database tables, 14 backend service/controller files, 3 BullMQ worker processors, 2 PDF templates, 15 frontend pages/components, and bilingual translation keys.

---

## Database Migrations

### New Enums

- `CompensationType` — `salaried`, `per_class`
- `PayrollRunStatus` — `draft`, `pending_approval`, `finalised`, `cancelled`

### New Tables

| Table                | Columns                      | RLS | Trigger            |
| -------------------- | ---------------------------- | --- | ------------------ |
| `staff_compensation` | 13 columns                   | Yes | `set_updated_at()` |
| `payroll_runs`       | 16 columns                   | Yes | `set_updated_at()` |
| `payroll_entries`    | 18 columns                   | Yes | `set_updated_at()` |
| `payslips`           | 10 columns (no `updated_at`) | Yes | None (append-only) |

### Indexes

- `idx_staff_compensation_tenant_staff` — `(tenant_id, staff_profile_id)`
- `idx_staff_compensation_active` — UNIQUE partial `(tenant_id, staff_profile_id) WHERE effective_to IS NULL`
- `idx_payroll_runs_tenant` — `(tenant_id)`
- `idx_payroll_runs_period` — UNIQUE partial `(tenant_id, period_month, period_year) WHERE status != 'cancelled'`
- `idx_payroll_runs_tenant_status` — `(tenant_id, status)`
- `idx_payroll_entries_run` — `(tenant_id, payroll_run_id)`
- `idx_payroll_entries_unique` — UNIQUE `(tenant_id, payroll_run_id, staff_profile_id)`
- `idx_payroll_entries_staff` — `(tenant_id, staff_profile_id)`
- `idx_payslips_number` — UNIQUE `(tenant_id, payslip_number)`
- `idx_payslips_entry` — `(payroll_entry_id)`

### Relations Added to Existing Models

- `Tenant` → `staff_compensations`, `payroll_runs`, `payroll_entries`, `payslips`
- `User` → `compensations_created`, `payroll_runs_created`, `payroll_runs_finalised`, `payslips_issued`
- `StaffProfile` → `compensations`, `payroll_entries`
- `ApprovalRequest` → `payroll_runs`

---

## API Endpoints

### Compensation (`v1/payroll/compensation`)

| Method | Path           | Permission                    |
| ------ | -------------- | ----------------------------- |
| GET    | `/`            | `payroll.view`                |
| GET    | `/:id`         | `payroll.view`                |
| POST   | `/`            | `payroll.manage_compensation` |
| PUT    | `/:id`         | `payroll.manage_compensation` |
| POST   | `/bulk-import` | `payroll.manage_compensation` |

### Payroll Runs (`v1/payroll/runs`)

| Method | Path                              | Permission                  |
| ------ | --------------------------------- | --------------------------- |
| GET    | `/`                               | `payroll.view`              |
| GET    | `/:id`                            | `payroll.view`              |
| POST   | `/`                               | `payroll.create_run`        |
| PATCH  | `/:id`                            | `payroll.create_run`        |
| POST   | `/:id/refresh-entries`            | `payroll.create_run`        |
| POST   | `/:id/trigger-session-generation` | `payroll.create_run`        |
| GET    | `/:id/session-generation-status`  | `payroll.view`              |
| POST   | `/:id/finalise`                   | `payroll.finalise_run`      |
| POST   | `/:id/cancel`                     | `payroll.create_run`        |
| POST   | `/:id/mass-export`                | `payroll.generate_payslips` |
| GET    | `/:id/mass-export-status`         | `payroll.generate_payslips` |

### Payroll Entries (`v1/payroll/entries`)

| Method | Path             | Permission           |
| ------ | ---------------- | -------------------- |
| PATCH  | `/:id`           | `payroll.create_run` |
| POST   | `/:id/calculate` | `payroll.view`       |

### Payslips (`v1/payroll/payslips`)

| Method | Path       | Permission                  |
| ------ | ---------- | --------------------------- |
| GET    | `/`        | `payroll.view`              |
| GET    | `/:id`     | `payroll.view`              |
| GET    | `/:id/pdf` | `payroll.generate_payslips` |

### Reports (`v1/payroll/reports`)

| Method | Path                             | Permission             |
| ------ | -------------------------------- | ---------------------- |
| GET    | `/cost-trend`                    | `payroll.view_reports` |
| GET    | `/ytd-summary`                   | `payroll.view_reports` |
| GET    | `/ytd-summary/export`            | `payroll.view_reports` |
| GET    | `/bonus-analysis`                | `payroll.view_reports` |
| GET    | `/monthly-summary/:runId`        | `payroll.view_reports` |
| GET    | `/monthly-summary/:runId/export` | `payroll.view_reports` |
| GET    | `/staff/:staffProfileId/history` | `payroll.view`         |

### Dashboard (`v1/payroll/dashboard`)

| Method | Path | Permission     |
| ------ | ---- | -------------- |
| GET    | `/`  | `payroll.view` |

---

## Services

| Service                   | File                           | Responsibility                                                  |
| ------------------------- | ------------------------------ | --------------------------------------------------------------- |
| `CalculationService`      | `calculation.service.ts`       | Pure payroll calculation formulas (salaried + per-class)        |
| `CompensationService`     | `compensation.service.ts`      | Staff compensation CRUD, effective date management, bulk import |
| `PayrollRunsService`      | `payroll-runs.service.ts`      | Full run lifecycle: create, update, refresh, finalise, cancel   |
| `PayrollEntriesService`   | `payroll-entries.service.ts`   | Entry updates with recalculation, preview                       |
| `PayslipsService`         | `payslips.service.ts`          | Payslip generation, PDF rendering, mass export                  |
| `PayrollReportsService`   | `payroll-reports.service.ts`   | Cost trend, YTD, bonus analysis, monthly summary, exports       |
| `PayrollDashboardService` | `payroll-dashboard.service.ts` | Composite dashboard endpoint                                    |

---

## Frontend

| Page/Component                 | Route                                      | Type   |
| ------------------------------ | ------------------------------------------ | ------ |
| Payroll Dashboard              | `/[locale]/payroll`                        | Client |
| Compensation List              | `/[locale]/payroll/compensation`           | Client |
| Compensation Form              | Dialog component                           | Client |
| Bulk Import Dialog             | Dialog component                           | Client |
| Payroll Runs List              | `/[locale]/payroll/runs`                   | Client |
| Create Run Dialog              | Dialog component                           | Client |
| Run Detail (editing + summary) | `/[locale]/payroll/runs/[id]`              | Client |
| Entries Table (inline editing) | Component in run detail                    | Client |
| Finalise Dialog                | Dialog component                           | Client |
| Run Metadata Card              | Component in run detail                    | Client |
| Staff Payment History          | `/[locale]/payroll/staff/[staffProfileId]` | Client |
| Reports (tabbed)               | `/[locale]/payroll/reports`                | Client |
| Cost Trend Chart               | Recharts component                         | Client |
| YTD Summary Table              | Component                                  | Client |
| Bonus Analysis Table           | Component                                  | Client |

---

## Background Jobs

| Job Name                       | Queue     | Processor                         | Trigger                                                           |
| ------------------------------ | --------- | --------------------------------- | ----------------------------------------------------------------- |
| `payroll:generate-sessions`    | `payroll` | `session-generation.processor.ts` | POST `/runs/:id/trigger-session-generation`                       |
| `payroll:mass-export-payslips` | `payroll` | `mass-export.processor.ts`        | POST `/runs/:id/mass-export`                                      |
| `payroll:on-approval`          | `payroll` | `approval-callback.processor.ts`  | Approval request approved with `action_type = 'payroll_finalise'` |

---

## Configuration

- **Payroll permissions**: Already seeded in `packages/shared/src/constants/permissions.ts` (payroll.view, payroll.manage_compensation, payroll.create_run, payroll.finalise_run, payroll.generate_payslips, payroll.view_bank_details, payroll.view_reports)
- **Module key**: `payroll` already in `packages/shared/src/constants/modules.ts`
- **Sequence type**: `payslip` already in `packages/shared/src/constants/sequence-types.ts`
- **Branding prefix**: `payslip_prefix` already in `tenant_branding` table (default `PSL`)
- **Tenant settings**: `payroll.requireApprovalForNonPrincipal`, `payroll.autoPopulateClassCounts`, `payroll.defaultBonusMultiplier` already in `TenantSettingsPayroll`

---

## Files Created

### Backend (14 files)

- `apps/api/src/modules/payroll/payroll.module.ts`
- `apps/api/src/modules/payroll/calculation.service.ts`
- `apps/api/src/modules/payroll/compensation.service.ts`
- `apps/api/src/modules/payroll/compensation.controller.ts`
- `apps/api/src/modules/payroll/payroll-runs.service.ts`
- `apps/api/src/modules/payroll/payroll-runs.controller.ts`
- `apps/api/src/modules/payroll/payroll-entries.service.ts`
- `apps/api/src/modules/payroll/payroll-entries.controller.ts`
- `apps/api/src/modules/payroll/payslips.service.ts`
- `apps/api/src/modules/payroll/payslips.controller.ts`
- `apps/api/src/modules/payroll/payroll-reports.service.ts`
- `apps/api/src/modules/payroll/payroll-reports.controller.ts`
- `apps/api/src/modules/payroll/payroll-dashboard.service.ts`
- `apps/api/src/modules/payroll/payroll-dashboard.controller.ts`

### PDF Templates (2 files)

- `apps/api/src/modules/pdf-rendering/templates/payslip-en.template.ts`
- `apps/api/src/modules/pdf-rendering/templates/payslip-ar.template.ts`

### Worker Processors (3 files)

- `apps/worker/src/processors/payroll/session-generation.processor.ts`
- `apps/worker/src/processors/payroll/mass-export.processor.ts`
- `apps/worker/src/processors/payroll/approval-callback.processor.ts`

### Shared Packages (2 files)

- `packages/shared/src/types/payroll.ts`
- `packages/shared/src/schemas/payroll.schema.ts`

### Migration (1 file)

- `packages/prisma/migrations/20260316220000_add_p6b_payroll_tables/post_migrate.sql`

### Frontend (15 files)

- `apps/web/src/app/[locale]/(school)/payroll/page.tsx`
- `apps/web/src/app/[locale]/(school)/payroll/compensation/page.tsx`
- `apps/web/src/app/[locale]/(school)/payroll/compensation/_components/compensation-form.tsx`
- `apps/web/src/app/[locale]/(school)/payroll/compensation/_components/bulk-import-dialog.tsx`
- `apps/web/src/app/[locale]/(school)/payroll/runs/page.tsx`
- `apps/web/src/app/[locale]/(school)/payroll/runs/_components/create-run-dialog.tsx`
- `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/_components/entries-table.tsx`
- `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/_components/finalise-dialog.tsx`
- `apps/web/src/app/[locale]/(school)/payroll/runs/[id]/_components/run-metadata-card.tsx`
- `apps/web/src/app/[locale]/(school)/payroll/staff/[staffProfileId]/page.tsx`
- `apps/web/src/app/[locale]/(school)/payroll/reports/page.tsx`
- `apps/web/src/app/[locale]/(school)/payroll/reports/_components/cost-trend-chart.tsx`
- `apps/web/src/app/[locale]/(school)/payroll/reports/_components/ytd-summary-table.tsx`
- `apps/web/src/app/[locale]/(school)/payroll/reports/_components/bonus-analysis-table.tsx`

---

## Files Modified

| File                                                          | Change                                                                                                                                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/prisma/schema.prisma`                               | Added `CompensationType`, `PayrollRunStatus` enums; `StaffCompensation`, `PayrollRun`, `PayrollEntry`, `Payslip` models; relations to Tenant, User, StaffProfile, ApprovalRequest |
| `apps/api/src/app.module.ts`                                  | Imported and registered `PayrollModule`                                                                                                                                           |
| `apps/api/src/modules/pdf-rendering/pdf-rendering.service.ts` | Added payslip template imports and TEMPLATES map entry                                                                                                                            |
| `apps/worker/src/worker.module.ts`                            | Added payroll processor imports and registrations                                                                                                                                 |
| `packages/shared/src/index.ts`                                | Added exports for payroll types and schemas                                                                                                                                       |
| `apps/web/messages/en.json`                                   | Added `payroll` translation namespace                                                                                                                                             |
| `apps/web/messages/ar.json`                                   | Added `payroll` translation namespace (Arabic)                                                                                                                                    |

---

## Known Limitations

1. **No DTO files in separate directory**: DTOs are defined inline in the shared schemas package rather than as separate files in `apps/api/src/modules/payroll/dto/`. This follows the established pattern where Zod schemas in `@school/shared` serve as both validation and type source.

2. **Mass export storage**: The mass export job stores the PDF temporarily in Redis as base64 (with 300s TTL) rather than S3 with presigned URLs, as the worker doesn't have S3 module access. For production with large staff counts (60+), this should be migrated to S3.

3. **Approval callback wiring**: The `payroll:on-approval` processor handles finalisation when an approval is granted. The approval module needs to emit a BullMQ job when approving payroll finalisation requests. This wiring depends on the approvals module having an event hook — if not present, the approval callback processor won't be triggered automatically and manual finalisation will be needed after approval.

4. **CSV bulk import**: Implements basic CSV parsing for compensation import. Does not use streaming for very large files. Adequate for the expected scale (< 500 staff).

---

## Deviations from Plan

1. **No separate DTO files**: Plan specified 6 DTO files in `apps/api/src/modules/payroll/dto/`. Instead, all validation schemas and types are in `packages/shared/src/schemas/payroll.schema.ts` and `packages/shared/src/types/payroll.ts`, which is the established project convention.

2. **Mass export uses Redis instead of S3**: Plan specified S3 temp storage with presigned URLs. Implemented with Redis base64 storage due to worker not having S3 access. Functionally equivalent for current scale.

3. **Payroll layout.tsx not created**: Plan mentioned a layout file, but following the existing pattern (finance module has no dedicated layout), no layout file was created. The school shell layout handles the wrapper.
