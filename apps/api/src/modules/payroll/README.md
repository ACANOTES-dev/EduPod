# Payroll

## Purpose

Manages the staff payroll cycle: compensation records, payroll run creation and finalisation, payslip generation, allowances, deductions, one-off payments, class delivery tracking, anomaly detection, analytics, and payslip mass export to S3.

## Public API (Exports)

- `PayrollRunsService` — payroll run lifecycle (draft → finalised via approval)
- `StaffAttendanceService` — staff attendance data feeding payroll calculations
- `ClassDeliveryService` — class delivery records for teaching load-based pay
- `PayrollAllowancesService` — recurring allowance management
- `PayrollDeductionsService` — recurring deduction management

## Inbound Dependencies (What this module imports)

- `ApprovalsModule` — approval workflow for payroll run finalisation
- `PdfRenderingModule` — payslip PDF generation (async via `PdfJobService` → S3)
- `ConfigurationModule` — `SettingsService` (payroll period settings, payslip date config), `EncryptionService` (bank detail encryption/decryption for payslips)
- BullMQ queue: `payroll`

## Outbound Consumers (Who imports this module)

- `StaffWellbeingModule` — reads `compensation_records` via Prisma direct for workload and compensation context in V2 board reports
- No other NestJS module imports PayrollModule directly

## BullMQ Queues

**Queue: `payroll`** (3 retries, 5s exponential)

- `payroll:on-approval` — callback when payroll run finalisation is approved; generates payslip numbers via `SequenceService`; creates individual payslip records
- `payroll:generate-sessions` — triggered on payroll run creation; creates payroll entry sessions
- `payroll:mass-export-payslips` — on-demand; generates PDF payslips in bulk; uploads to S3

## Cross-Module Prisma Reads

`staff_profiles` — payroll entries and calculations read staff data directly. `class_enrolments`, `schedules` — class delivery tracking reads scheduling tables directly. `academic_periods`, `academic_years` — payroll period scoping.

## Key Danger Zones

- **DZ-09**: Staff bank details are AES-256 encrypted via `EncryptionService`. Changing encryption logic or rotating the key without re-encrypting existing data makes bank detail fields permanently unreadable.
- **DZ-11**: `AuditLogInterceptor` fires synchronously for every payroll mutation. Mass payslip export triggers one audit log row per request. For future high-volume endpoints, consider async audit logging.
- Payroll finalisation approval: requires both `ApprovalRequestsService.create(payroll_finalise)` AND a worker processor (`PayrollApprovalCallbackProcessor`) registered on the `payroll` queue. If either side is misconfigured, approved payrolls never finalise.
- `StaffAttendanceService` and `ClassDeliveryService` are consumed by `StaffWellbeingModule` via Prisma direct reads (`compensation_records`). Schema changes to compensation records affect wellbeing board reporting.
