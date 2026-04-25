# Payroll Overhaul — Master Plan

> **Status:** Plan locked. Implementation split into 7 tasks across 5 waves. See `IMPLEMENTATION_LOG.md` for execution order and per-wave rules.
> **Companion audit:** the 2026-04-25 four-agent end-to-end audit of `apps/api/src/modules/payroll/`, `apps/worker/src/processors/payroll/`, and `apps/web/src/app/[locale]/(school)/payroll/`. The audit's findings are this plan's source spec.

---

## 1. Why we're rebuilding this

Payroll today is a beautifully decorated shell sitting on top of a calculation engine that ignores almost every input it advertises. The user-facing UI looks polished — the recent UX redesign placed payroll under the finance hub and redrew every page in the morphing-shell pattern — but the wiring underneath was never finished. Specifically:

- **The calculation engine is structurally disconnected from its own inputs.** Every salaried employee gets full-month base pay regardless of attendance. Every per-class teacher gets paid for _scheduled_ classes, never _delivered_ classes. Allowances, recurring deductions, one-off bonuses, and per-entry adjustments are all stored in the database, surfaced in the UI, and **never read by the engine that produces payslip totals**. The `calculate*` and `autoApplyForRun` methods exist as dead code — implemented correctly internally, never invoked.
- **Two of three worker jobs are dead-on-arrival.** Mass export and session generation both have the API enqueuing one job name and the worker processing another. Every "Export Payslips" click silently does nothing. Every "auto-populate sessions" click silently does nothing. The only worker job that actually runs is the approval-callback finaliser.
- **There are two finalisation paths producing different numeric results.** The direct path uses JavaScript `Number` arithmetic on `Decimal` columns; the approval path uses `Decimal`. They produce different totals and a different payslip-number format (`PSL-YYYYMM-000001` vs `PS-YYYYMM-00001`). The `isSchoolOwner` flag that selects between them is hardcoded `false`, so today every finalisation goes through the approval path — masking the bug as a latent regression.
- **The frontend redesign references endpoints that don't exist.** Five of ten payroll pages have at least one 404'ing endpoint as their primary fetch. Three pages — `staff-attendance`, `my-payslips`, `staff/[id]` — are entirely dead because every API call returns 404. The errors fail silently (`// silent` + `console.error`, no toast) so users see empty tables instead of error messages.
- **Compensation is not period-bracketed.** The engine fetches `staff_compensation` rows with `effective_to: null` only, ignoring the run's period. A salary changed mid-month produces wrong amounts in either direction.
- **Ten tables in the most recent payroll migration are missing `FORCE ROW LEVEL SECURITY` inline.** A companion `post_migrate.sql` corrects this, but production status is unverified.
- **Zero new payroll forms use `react-hook-form` + `zodResolver`.** All six forms in the module are hand-rolled `useState`-per-field, in violation of the project rule.

The "looks nice from the outside" sensation is because most of the broken paths fail silently. Catches are empty. 404s render as empty tabs. The shell is gorgeous because the redesign was completed; the wiring was never finished.

This rebuild **fixes the wiring without rebuilding the shell**. We keep the schema, keep the morph-shell pages, keep the existing service-per-input architecture. We rewrite the calculation engine to actually read its inputs, fix the worker job names and Redis-key formats, build the missing endpoints, align the frontend contract with the backend, and add the regression tests that should have caught all of this before it shipped.

This is intentionally not a from-scratch rebuild. The bones are sound: every input has its own service, every table is tenant-scoped, the state machine is clean, the approval-callback worker chain is correctly wired, the morph-shell layout was successfully migrated. **The disease is that the calculation engine treats its inputs as decorative.** Curing that disease, fixing the contract drift, and shipping tests is the whole job.

---

## 2. The core model — payroll run lifecycle

A `payroll_run` is the top-level unit. Every run has:

- A **period**: `(period_year, period_month)` with derived `period_start` and `period_end` `DATE`s. Unique per `(tenant_id, period_year, period_month)`.
- A **state**: one of `draft`, `pending_approval`, `finalised`, `cancelled`. Transitions guarded by `isValidPayrollRunTransition()` in `packages/shared/src/payroll/state-machine.ts`.
- A set of **`payroll_entry` rows**, one per active staff member with active compensation. Each entry is a snapshot of compensation values plus the calculated pay for the period.
- A set of **input attachments** owned by the run or the entry: allowances active during the period, recurring deductions applied this run, one-off items added by an admin, adjustments entered post-hoc, plus the supporting attendance + class-delivery records that pre-date the run.

The state graph (post-rebuild — same as today, with the half-finalisation race closed):

```
draft  ─── finalise() ──▶ pending_approval ─── worker callback ──▶ finalised
  │                              │                                     │
  └─── finalise() (school owner) ─┴───────────── direct path ──────────┘
  │                              │
  └────── cancel() ──────────▶ cancelled                            (terminal)
                                 │
                                 └── cancel() (NEW: allowed) ▶ cancelled
```

The state machine is unchanged. The key fix is that **both paths to `finalised` produce the same numbers and the same payslip-number format**, achieved by extracting a single shared finalisation routine from the worker callback into an injectable service.

### What "calculate" actually means

For a single `payroll_entry` belonging to a salaried staff member, the calculation produces:

```
gross_pay   = pro_rated_base_salary
            + sum(allowances active in period, after proration)
            + sum(one_off_items of type bonus/award/correction-positive)
            + sum(adjustments of type bonus/correction-positive)

deductions  = sum(recurring_deductions applied this run via idempotent application)
            + sum(one_off_items of type deduction/correction-negative)
            + sum(adjustments of type deduction/correction-negative)

net_pay     = gross_pay − deductions
```

For a per-class teacher:

```
gross_pay   = classes_delivered × per_class_rate
            + bonus_classes × (per_class_rate × bonus_class_multiplier)
            + sum(allowances)
            + sum(positive one_offs/adjustments)

deductions  = same shape as salaried
net_pay     = gross_pay − deductions
```

Where `classes_delivered` comes from `class_delivery_records` (status = `delivered`) **bracketed to the run's period** — never from `schedule.count()`.

Where `days_worked` for salaried staff comes from `staff_attendance_records` via `StaffAttendanceService.calculateDaysWorked(staff_profile_id, period_start, period_end)` — counting `present` (full) and `half_day` (0.5) statuses, less anything in `paid_leave` (counted as 1) and `unpaid_leave` (counted as 0) — never the raw `total_working_days` input from the run-creation form.

Where allowances are computed via `PayrollAllowancesService.calculateAllowancesForEntry(entry_id, period_start, period_end)` — the existing method, finally invoked.

Where recurring deductions are applied via a NEW `PayrollDeductionsService.applyForRunIdempotent(run_id)` that is safe to call multiple times because it tracks applications in a new `payroll_deduction_applications` join table. (The existing `autoApplyForRun` is destructive — it decrements `remaining_amount` and mutates `active`. It must not be called twice. The replacement separates the _application-record_ from the _balance-decrement_ so refresh and finalise can re-run without double-deducting.)

All math runs in Prisma `Decimal` (or `decimal.js`) — never coerced to JavaScript `Number`.

### What gets snapshotted

When a run finalises:

- Each `payroll_entry` gets `gross_pay`, `total_deductions`, `net_pay`, `allowances_total`, `deductions_total`, `adjustments_total`, `one_off_total` columns populated. These are NEW columns added in Wave 1.
- A `payslip` row is created for each entry with a numbered `payslip_number` from the shared `formatPayslipNumber()` utility (single source of truth for both finalisation paths).
- Each `payslip` carries a `snapshot_payload_json` that captures every input that contributed to the total, validated against a new `payslipSnapshotSchema` in `@school/shared`. Snapshots are immutable. Re-finalising a cancelled-and-recreated run produces a brand-new payslip with a brand-new sequence number; the old payslip's snapshot is preserved.

---

## 3. Architecture

### Module ownership

```
apps/api/src/modules/payroll/                    OWNED — backend services
apps/api/src/modules/leave/payroll-attendance.*  CONSUMED — read-only advisory
apps/api/src/modules/approvals/                  CONSUMED — finalisation gate
apps/worker/src/processors/payroll/              OWNED — three job processors
packages/prisma/                                  OWNED — schema + migrations
packages/shared/src/payroll/                     OWNED — types, state machine, schemas, constants
apps/web/src/app/[locale]/(school)/payroll/      OWNED — frontend pages
apps/web/src/app/[locale]/(school)/finance/      CONSUMED — hub-tile link
```

The module remains a top-level NestJS module (`PayrollModule`) — it is not nested under FinanceModule, despite the UX moving its hub tile. The "payroll under finance" relationship is purely navigational. This rebuild does not change that decision; restructuring the NestJS graph is out of scope and would not improve any user-visible behaviour.

### Data flow — a finalisation walk-through (post-rebuild)

```
1. Admin clicks "Finalise" in /payroll/runs/[id]
   ▶ POST /v1/payroll/runs/:id/finalise

2. PayrollRunsController.finalise()
   ▶ PayrollRunsService.requestFinalisation(tenantId, runId, actorUserId)

3. PayrollRunsService — inside one RLS $transaction:
   a. Re-validate run state (draft → must transition to pending_approval or finalised)
   b. Re-resolve all inputs for every entry via PayrollInputResolver:
      - period-bracketed compensation
      - StaffAttendanceService.calculateDaysWorked
      - ClassDeliveryService.calculateClassesTaught
      - PayrollAllowancesService.calculateAllowancesForEntry
      - PayrollDeductionsService.scheduleApplicationForRun (writes to payroll_deduction_applications, idempotent)
      - sum of payroll_one_off_items where payroll_entry_id IN run
      - sum of payroll_adjustments where payroll_run_id = runId
   c. Run CalculationEngine.compute(input) per entry — Decimal in, Decimal out
   d. Persist new gross_pay / total_deductions / net_pay / allowances_total / deductions_total / adjustments_total / one_off_total on each entry
   e. If approval is required (every tenant, every actor — see §4): create ApprovalRequest, set status to pending_approval, store approval_request_id on the run, return { pending: true }
   f. Else (school_owner direct path, currently dead but functional): call FinalisationService.finaliseAtomic(runId)

4. Approval flow:
   a. Approver clicks Approve in /approvals
   b. ApprovalRequestsService.recordDecision()
   c. Enqueues 'payroll:on-approval' to the payroll queue with jobId='approval-callback:{requestId}'
   d. PayrollApprovalCallbackProcessor picks it up
   e. Calls FinalisationService.finaliseAtomic(runId) — SAME method used by the direct path

5. FinalisationService.finaliseAtomic (single source of truth for both paths):
   a. Re-fetch run, assert state is pending_approval (or draft for direct path)
   b. Re-run input resolution + calculation (idempotent — produces same output)
   c. Apply deductions via PayrollDeductionsService.commitApplications (decrements balances using the application-record table, idempotent)
   d. For each entry, generate payslip via PayslipsService.generateOne(entry) — uses formatPayslipNumber()
   e. Update run.status to finalised, set finalised_at, finalised_by_user_id
   f. Mark approval_request as executed (if applicable)

6. PayslipsService.generateOne:
   a. Allocate payslip number via SequenceService — UNIFIED for both direct and approval paths
   b. Insert payslip row with full snapshot_payload_json validated against payslipSnapshotSchema
   c. Optionally enqueue PDF render job (deferred — does not block transaction)
```

### Worker layer

```
apps/worker/src/processors/payroll/payroll-queue.processor.ts
  ▶ dispatches by job.name to one of:
     - approval-callback.processor.ts    (job: payroll:on-approval)        ✅
     - mass-export.processor.ts          (job: payroll:mass-export)        ⚙ FIXED: was 'payroll:mass-export-payslips'
     - session-generation.processor.ts   (job: payroll:session-generation) ⚙ FIXED: was 'payroll:generate-sessions'

Constants live in packages/shared/src/payroll/job-names.ts — imported by both the API enqueue sites and the worker processors. Single source of truth.

Redis status keys live in packages/shared/src/payroll/redis-keys.ts — both API writers and worker writers use the same key format including tenant_id.

Payslip number format lives in packages/shared/src/payroll/payslip-number.ts — both paths use formatPayslipNumber(prefix, period, sequence).
```

---

## 4. Permission / privacy rules

### Permission namespace — `payroll.*` (unchanged)

Despite the UX move under finance, permissions remain `payroll.*`. This rebuild does NOT migrate to `finance.payroll.*`. The reason: the existing role definitions, RBAC seed, and audit logs all reference `payroll.*` and migrating would be a multi-system change with no behavioural benefit.

The set, post-rebuild:

| Permission                    | Grants                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `payroll.view`                | Read runs, entries, payslips, attendance, delivery, analytics, calendar                      |
| `payroll.create_run`          | Create / refresh / cancel runs, edit entries, mark attendance, manage adjustments + one-offs |
| `payroll.finalise_run`        | Finalise a run (subject to the approval gate)                                                |
| `payroll.generate_payslips`   | Trigger mass exports, render PDFs, send to accountant                                        |
| `payroll.manage_compensation` | Compensation CRUD, allowance types CRUD, staff allowances, deductions                        |
| `payroll.manage_attendance`   | Mark + bulk-update staff attendance records (NEW — splits the over-broad create_run grant)   |
| `payroll.view_reports`        | Analytics endpoints, reports endpoints                                                       |
| `payroll.self_service`        | Read your own payslips and YTD summary (NEW — gates `/my-payslips`)                          |

The two NEW permissions (`manage_attendance`, `self_service`) are seeded in Wave 1 and backfilled to existing roles in `InboxPermissionsInit`-style boot init (Owner / Principal / VP / Finance get `manage_attendance`; every authenticated user gets `self_service`).

### Module-enabled gate

`@ModuleEnabled('payroll')` is added to every payroll controller in Wave 3. Tenants who have not subscribed to payroll cannot reach any endpoint, regardless of RBAC.

### Privacy invariants

- **Tenant scoping is non-negotiable.** Every payroll table has `tenant_id NOT NULL` and `FORCE ROW LEVEL SECURITY` with the tenant-isolation policy. Wave 1 retrofits FORCE on the 10 tables that lack it inline.
- **Encrypted bank details from `staff_profile`** must never appear in any payroll API response or payslip snapshot. Last 4 digits only — same rule as today, verified by a regression test in Wave 5.
- **A user's payslip is visible to that user (`payroll.self_service` grants `/my-payslips/me`)** and to anyone with `payroll.view` (admins). Cross-staff payslip access is gated by RBAC and verified by an RLS leakage test per tenant.
- **`isSchoolOwner` decision**: Wave 3 either implements this properly via `PermissionCacheService.isOwner` (matching the `AdminTierOnlyGuard` pattern from inbox) or formally removes the dual-path branch. The rebuild does NOT leave it hardcoded `false`.

---

## 5. Data model overview

The schema is largely unchanged. Wave 1 adds:

### New columns on `payroll_entries`

```
gross_pay              NUMERIC(12,2) NOT NULL DEFAULT 0
total_deductions       NUMERIC(12,2) NOT NULL DEFAULT 0
net_pay                NUMERIC(12,2) NOT NULL DEFAULT 0
allowances_total       NUMERIC(12,2) NOT NULL DEFAULT 0
deductions_total       NUMERIC(12,2) NOT NULL DEFAULT 0
adjustments_total      NUMERIC(12,2) NOT NULL DEFAULT 0
one_off_total          NUMERIC(12,2) NOT NULL DEFAULT 0
```

The pre-existing `basic_pay` / `bonus_pay` / `total_pay` columns are kept for backwards compatibility but become **derived display values** (basic_pay + bonus_pay = gross excluding allowances; total_pay alias for net_pay). Wave 5 plans the deprecation path; Wave 2 populates both old and new columns during finalisation so dashboards keep rendering.

### New table — `payroll_deduction_applications`

Tracks which deductions were applied to which run, idempotently:

```
payroll_deduction_applications
  id                              UUID PK
  tenant_id                       UUID NOT NULL
  payroll_run_id                  UUID NOT NULL  -> payroll_runs(id)
  payroll_entry_id                UUID NOT NULL  -> payroll_entries(id)
  staff_recurring_deduction_id    UUID NOT NULL  -> staff_recurring_deductions(id)
  applied_amount                  NUMERIC(12,2) NOT NULL
  applied_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
  committed_at                    TIMESTAMPTZ
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()

  UNIQUE (payroll_run_id, staff_recurring_deduction_id)
  INDEX  (tenant_id, payroll_entry_id)
  INDEX  (tenant_id, staff_recurring_deduction_id)
```

`applied_at` is when the application was scheduled; `committed_at` is when the underlying balance was decremented. The two-phase shape lets `requestFinalisation` plan the application (idempotent) and `commitApplications` decrement the balance once when the run actually finalises.

### Migration retrofit — FORCE RLS

A new migration `<timestamp>_payroll_force_rls_retrofit/` re-issues the RLS policies for the 10 tables added in `20260324150000_payroll_world_class` using the canonical `FORCE ROW LEVEL SECURITY` form and the strict `::uuid` cast. Idempotent (`DROP POLICY IF EXISTS` then re-create).

### Index gaps

- `payroll_runs (tenant_id, period_year, period_month)` — common list filter
- `payroll_entries (tenant_id, compensation_type)` — used by session-generation and finalisation queries
- `payroll_deduction_applications (tenant_id, payroll_run_id)` — supports the idempotency lookup

### New shared types

```
packages/shared/src/payroll/
  job-names.ts                 // PAYROLL_ON_APPROVAL_JOB, PAYROLL_MASS_EXPORT_JOB, PAYROLL_SESSION_GENERATION_JOB
  redis-keys.ts                // buildSessionGenStatusKey(tenantId, runId), buildMassExportStatusKey(tenantId, runId), buildMassExportPdfKey(tenantId, runId)
  payslip-number.ts            // formatPayslipNumber(prefix, period, sequence)
  schemas/
    payslip-snapshot.schema.ts // payslipSnapshotSchema — validates snapshot_payload_json
    calc-input.schema.ts       // CalcInput type with Decimal | null fields (replaces number-typed version)
  state-machine.ts             // existing — no changes
  index.ts                     // re-exports
```

---

## 6. Component map (file-tree sketch)

```
apps/api/src/modules/payroll/
├── calculation.service.ts                   ← REWRITTEN: Decimal-safe, takes resolved inputs
├── calculation.service.spec.ts              ← REWRITTEN: every input type covered
├── payroll-input-resolver.service.ts        ← NEW: pulls all inputs for a run, returns ResolvedInputs
├── payroll-input-resolver.service.spec.ts   ← NEW
├── payroll-runs.service.ts                  ← REWRITTEN: createRun/refreshEntries/requestFinalisation
├── finalisation.service.ts                  ← NEW: single source of truth for finalising (used by both paths)
├── finalisation.service.spec.ts             ← NEW
├── payroll-runs.controller.ts               ← UPDATED: new endpoints, isSchoolOwner fix, ModuleEnabled
├── payroll-entries.controller.ts            ← UPDATED: response shape flatten
├── payroll-entries.service.ts               ← UPDATED: drop Number coercions
├── payslips.service.ts                      ← UPDATED: uses formatPayslipNumber, ModuleEnabled
├── payslips.controller.ts                   ← UPDATED: my-payslips, ytd, individual download
├── compensation.service.ts                  ← MINOR: period-bracket query in findActiveForPeriod()
├── compensation.controller.ts               ← MINOR: rename bulk-import alias
├── staff-attendance.service.ts              ← MINOR: tighten calculateDaysWorked signature
├── class-delivery.service.ts                ← MINOR: closure-aware calculateClassesTaught
├── payroll-allowances.service.ts            ← MINOR: stable calculateAllowancesForEntry signature
├── payroll-deductions.service.ts            ← REWRITTEN: scheduleApplicationForRun + commitApplications
├── payroll-adjustments.service.ts           ← MINOR: sumForRun(runId, entryId)
├── payroll-one-offs.service.ts              ← MINOR: sumForEntry(entryId)
├── payroll-calendar.service.ts              ← MINOR: drop unsafe `as unknown as` cast
├── payroll-anomaly.service.ts               ← MINOR: surface via /runs/:id/anomalies endpoint
├── payroll-dashboard.service.ts             ← UPDATED: include anomalies + payroll_calendar in response
├── payroll-reports.service.ts               ← MINOR: variance & forecast take optional runId
├── payroll-reports.controller.ts            ← UPDATED: tenant-wide variance
├── payroll-exports.service.ts               ← UPDATED: buildRow handles all _total fields
├── payroll-enhanced.controller.ts           ← UPDATED: rename routes, fix verbs, ModuleEnabled
├── payroll-read.facade.ts                   ← MINOR: expose new aggregate fields
└── payroll.module.ts                        ← UPDATED: register new providers, drop unused StaffProfilesModule import

apps/worker/src/processors/payroll/
├── payroll-queue.processor.ts               ← UPDATED: dispatch by shared constants
├── approval-callback.processor.ts           ← REWRITTEN: delegates to FinalisationService, no inline calc
├── mass-export.processor.ts                 ← UPDATED: job-name constant, Redis key shared, idempotency
├── session-generation.processor.ts          ← UPDATED: counts delivery records, shared Redis key, payload field aligned

apps/web/src/app/[locale]/(school)/payroll/
├── page.tsx                                 ← UPDATED: dashboard reads new flatter response
├── runs/page.tsx                            ← UPDATED: status filter i18n key, errors via toast
├── runs/[id]/page.tsx                       ← REWRITTEN: tabs hit real endpoints, RHF + zod, error toasts
├── runs/[id]/_components/
│   ├── entries-table.tsx                    ← UPDATED: reads flat staff_name
│   ├── finalise-dialog.tsx                  ← UPDATED: surfaces approval-pending state
│   └── run-metadata-card.tsx                ← UPDATED: working_days editable in dialog
├── runs/_components/create-run-dialog.tsx   ← REWRITTEN: RHF + zod, no hardcoded total_working_days, localized months
├── compensation/page.tsx                    ← REWRITTEN: paths fixed, RHF forms
├── compensation/_components/
│   ├── compensation-form.tsx                ← REWRITTEN: RHF + zod, staff dropdown reads user.first_name + last_name
│   └── bulk-import-dialog.tsx               ← UPDATED: path = bulk-import
├── staff-attendance/page.tsx                ← REWRITTEN: paths = /attendance/...
├── class-delivery/page.tsx                  ← REWRITTEN: real /summary endpoint, PUT /confirm
├── absences/page.tsx                        ← MINOR: native select → @school/ui Select
├── reports/page.tsx                         ← UPDATED: variance/forecast hit /analytics/* with optional runId
├── exports/page.tsx                         ← UPDATED: PUT not PATCH, /export-logs hits /runs/:id/export-history
├── staff/[staffProfileId]/page.tsx          ← UPDATED: path = /reports/staff/:id/history, PDF via apiClient
└── my-payslips/page.tsx                     ← REWRITTEN: real /v1/payroll/my-payslips endpoint

packages/prisma/
├── schema.prisma                            ← UPDATED: payroll_entries new columns, payroll_deduction_applications
└── migrations/
    ├── <ts>_add_payroll_entry_total_columns/
    │   ├── migration.sql
    │   └── post_migrate.sql
    ├── <ts>_add_payroll_deduction_applications/
    │   ├── migration.sql
    │   └── post_migrate.sql                 ← RLS policy
    └── <ts>_payroll_force_rls_retrofit/
        └── migration.sql                    ← Re-issues FORCE RLS for 10 tables

packages/shared/src/payroll/
├── job-names.ts                             ← NEW
├── redis-keys.ts                            ← NEW
├── payslip-number.ts                        ← NEW
├── schemas/
│   ├── payslip-snapshot.schema.ts           ← NEW
│   └── calc-input.schema.ts                 ← NEW
├── state-machine.ts                         ← unchanged
└── index.ts                                 ← UPDATED: re-export new modules

apps/web/messages/
├── en.json                                  ← UPDATED: new payroll.* keys
└── ar.json                                  ← UPDATED: same keys, Arabic
```

---

## 7. Wave breakdown

| Wave  | Implementations | Hard dependency | Theme                             | Parallelisation                  |
| ----- | --------------- | --------------- | --------------------------------- | -------------------------------- |
| **1** | 01              | None            | Schema + shared-type foundation   | serial — single impl             |
| **2** | 02              | Wave 1 complete | Calculation engine + input wiring | serial — single impl, very large |
| **3** | 03, 04          | Wave 2 complete | API contract + worker pipelines   | parallel-safe (different files)  |
| **4** | 05, 06          | Wave 3 complete | Frontend rebuild                  | parallel-risky (translations)    |
| **5** | 07              | Wave 4 complete | Polish, tests, docs               | serial — single impl             |

Full detail in `IMPLEMENTATION_LOG.md` §3 (rules), §4 (status table), and per-impl files in `implementations/`.

### Per-implementation summary

| #   | Title                                         | Wave | Classification | Deploys         |
| --- | --------------------------------------------- | ---- | -------------- | --------------- |
| 01  | Schema + shared foundation                    | 1    | schema         | migration + all |
| 02  | Calculation engine + input integration        | 2    | backend        | API + worker    |
| 03  | API contract + missing endpoints              | 3    | backend        | API only        |
| 04  | Worker pipelines + payslip number unification | 3    | worker         | worker + API    |
| 05  | Frontend operational pages                    | 4    | frontend       | web only        |
| 06  | Frontend analytical + self-service            | 4    | frontend       | web only        |
| 07  | Polish — tests, translations, mobile, docs    | 5    | polish         | web + docs      |

---

## 8. Out of scope

- **Multi-currency.** Single currency per tenant, always. No per-row currency field.
- **Payroll for non-staff.** Only `staff_profile`-linked compensation. No vendor payroll, no contractor invoicing.
- **Tax / NI / pension / benefits-in-kind.** The calculation engine handles gross, allowances, deductions, and net. Statutory deductions are NOT modelled. If a tenant needs them, they configure them as `staff_recurring_deductions` with type `tax`.
- **Bank-file generation.** SEPA / ACH / payroll-bureau export formats are out of scope. CSV templates remain the export medium; bank-file generation is a future module.
- **Migration to `finance.payroll.*` permission namespace.** Stays as `payroll.*`. The UX hub-tile relationship is purely navigational.
- **Restructuring `PayrollModule` to nest under `FinanceModule`.** Stays as a top-level NestJS module.
- **Replacing `staff_attendance_records` with `attendance_sessions` (the student attendance model).** They are separate by design. The student-attendance and staff-attendance domains stay independent.
- **Payslip PDF visual redesign.** PDF rendering remains via the existing `PdfRenderingModule`. The snapshot payload is updated; the visual template is not.
- **Offline-first mobile payslip viewer.** Out of scope. `/my-payslips` is web-only for now.
- **Approving multiple runs in a single batch.** Approval is per-run.

---

## 9. Why this shape

### Why fix in place vs rebuild from scratch

The bones are sound. Every input has its own service, every table has tenant scoping, the state machine is correctly wired, the morph-shell layout was successfully migrated. The diseases are: (a) the engine ignores its inputs, (b) the worker has dead job names, (c) the frontend redesign references endpoints that don't exist, (d) `Decimal` math is coerced to `Number` everywhere except the worker. Each disease is a localised wiring fix. A from-scratch rebuild would discard the seven correct service files plus the schema plus the morph-shell pages, and would re-introduce risk in every one of those areas without solving any problem the wiring fix doesn't already solve.

### Why a single calculation engine that takes resolved inputs

The audit found the engine is fine in isolation — given the right `CalcInput`, it produces the right `CalcResult`. The problem is that the _call sites_ that build the `CalcInput` ignore most of the input space. By introducing a `PayrollInputResolver` service whose single job is to assemble a fully-resolved `CalcInput` from all input sources (compensation period-bracketed, attendance, delivery records, allowances, deductions, adjustments, one-offs), every code path that calculates pay flows through one resolver. There is one place to add a new input type. There is one place where a regression test asserts that all inputs are read.

### Why the new `payroll_deduction_applications` table

The existing `PayrollDeductionsService.autoApplyForRun()` is a one-shot destructive method: it decrements `remaining_amount` and toggles `active`. If anything calls it twice (refresh-then-finalise, retry-after-error, finalise-cancel-finalise), the deduction is applied twice. The fix is **idempotency tracked at the application level**, not at the service level. A `payroll_deduction_applications` row is the receipt that says "this deduction was applied to this run for this entry"; the unique key on `(payroll_run_id, staff_recurring_deduction_id)` prevents double-apply. The two-phase shape (`scheduleApplicationForRun` → `commitApplications`) lets `requestFinalisation` plan the deductions safely (idempotent) and `finaliseAtomic` commit the balance decrements once.

### Why a single `FinalisationService` shared by direct and approval paths

The audit found that the direct path uses `Number` arithmetic and the approval path uses `Decimal` — and they produce subtly different totals plus a different payslip-number format. Both bugs disappear when both paths call the same code. The `FinalisationService.finaliseAtomic(runId)` method is the single source of truth: it re-resolves inputs, runs the calculation, commits deduction applications, generates payslips with `formatPayslipNumber()`, and updates the run state. Whichever caller invokes it (the controller for school-owners, the worker for everyone else) gets identical behaviour.

### Why shared-package job-names and Redis-keys constants

Job-name string mismatches are a category of bug that should be impossible to introduce. By moving the strings to `packages/shared/src/payroll/job-names.ts` and importing them from both the API enqueue site AND the worker processor, the TypeScript compiler enforces the match. Same for Redis keys: `buildSessionGenStatusKey(tenantId, runId)` is used by both API writer and worker writer; the format cannot diverge. Wave 1 introduces these constants; Waves 2-4 import them.

### Why `ResponseTransformInterceptor` flat aliases

The audit found dozens of frontend bindings that read `entry.staff_name` while the backend returns `entry.staff_profile.user.first_name + last_name`. The fix is to flatten in the service mapper, not the frontend — this is the established SEND-pattern from project memory. Every payroll controller's response is shaped through a `mapToDto` helper that joins the flat fields the frontend expects (`staff_name`, `academic_year_name` if applicable, etc.) onto the row before serialisation. This keeps the API contract stable across UI changes and makes the frontend's binding site declarative.

### Why frontend forms get RHF + zodResolver

The project rule says all new forms use `react-hook-form + zodResolver` with a Zod schema imported from `@school/shared`. Payroll has zero forms compliant with this. Hand-rolled `useState`-per-field forms are why we ship form bugs (no client-side validation, no field-level error messaging, no async-submission state, no resilience to schema changes). Wave 4 rebuilds every payroll form to the standard.

---

## 10. Risk register

- **Migration retrofit on FORCE RLS** could fail if production has already been issuing data via owner-bypass. Mitigation: post_migrate.sql is idempotent; running it on a fresh DB or a migrated-but-incomplete DB produces the same result. Wave 1's smoke test verifies the policy is in place by attempting a cross-tenant select as the `edupod` role.
- **Two-phase deduction application** introduces a window between schedule and commit where a balance can be referenced from two runs simultaneously. Mitigation: `scheduleApplicationForRun` is run inside the same RLS transaction as `requestFinalisation`, and `commitApplications` runs inside `finaliseAtomic`'s transaction. The unique key on `(run_id, deduction_id)` ensures only one schedule per run.
- **Existing payslip-number format divergence** means already-finalised runs in production carry `PSL-...` style numbers from one path and `PS-...` style from the other. Mitigation: the rebuild does NOT re-number historical payslips. The new `formatPayslipNumber` is only used for newly finalised runs. Wave 5 documents the historical inconsistency in the architecture danger-zones doc.
- **Frontend translation files** are the Wave-4-incident hot zone. Mitigation: every frontend impl in this rebuild has an explicit "Shared files" section listing `en.json` / `ar.json` and the hardened final-commit-window rule.
- **`@ModuleEnabled('payroll')` retrofit** could lock tenants out who have payroll enabled in code but not in the `tenant_module_settings` table. Mitigation: Wave 3 includes a one-shot init that ensures every tenant with at least one payroll role assignment has the `payroll` module marked enabled.
