# Implementation 01 — Schema + Shared Foundation

> **Wave:** 1 (serial — every other impl depends on this)
> **Classification:** schema
> **Depends on:** nothing
> **Deploys:** migration + API + worker + web restart (touches shared types, every package rebuilds)

---

## Goal

Land every DB and shared-type change the payroll overhaul needs in a single, coordinated wave so that subsequent waves can code against stable types and consistent constants.

Specifically:

1. Add the missing `*_total` columns to `payroll_entries` (`gross_pay`, `total_deductions`, `net_pay`, `allowances_total`, `deductions_total`, `adjustments_total`, `one_off_total`).
2. Introduce a new `payroll_deduction_applications` join table that makes recurring-deduction application **idempotent and auditable**.
3. Retrofit `FORCE ROW LEVEL SECURITY` and the strict `::uuid` cast onto the 10 tables added by `20260324150000_payroll_world_class` whose inline migration policies omit it.
4. Add the missing indexes (`payroll_runs (tenant_id, period_year, period_month)`, `payroll_entries (tenant_id, compensation_type)`).
5. Create the new shared-package modules under `packages/shared/src/payroll/`: `job-names.ts`, `redis-keys.ts`, `payslip-number.ts`, plus Zod schemas for `payslipSnapshotSchema` and `calcInputSchema` (Decimal-safe).
6. Stub the `.spec.ts` placeholders for new services that Wave 2 will create (`FinalisationService`, `PayrollInputResolver`).

**Zero business logic in this implementation** — just the schema, the shared types, and the constants. Wave 2 consumes everything you create here.

---

## Shared files this impl touches

- `packages/prisma/schema.prisma` — adds 7 new columns to `payroll_entries`, adds the new `PayrollDeductionApplication` model. Edit early — the rest of the impl flows from this.
- `packages/prisma/migrations/<ts>_add_payroll_entry_total_columns/` — new migration directory (owned).
- `packages/prisma/migrations/<ts>_add_payroll_deduction_applications/` — new migration directory (owned).
- `packages/prisma/migrations/<ts>_payroll_force_rls_retrofit/` — new migration directory (owned).
- `packages/prisma/rls/policies.sql` — append the policy for `payroll_deduction_applications`. Edit late, in your final commit window.
- `packages/shared/src/index.ts` — re-exports the new `payroll/job-names`, `payroll/redis-keys`, `payroll/payslip-number`, `payroll/schemas/*`. Edit late, in your final commit window.
- `packages/shared/src/payroll/index.ts` — already exists for the state machine; extend it to barrel-export the new modules. Edit late.
- `packages/prisma/seed/system-roles.ts` — adds two new permissions: `payroll.manage_attendance` and `payroll.self_service`. Edit late.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Always in a separate commit, after all other commits.

No source-code services or controllers are touched in this impl. Stub `.spec.ts` files are owned new files (no overlap).

---

## What to build

### 1. Prisma schema changes (`packages/prisma/schema.prisma`)

#### 1a. Extend `PayrollEntry`

Locate the `model PayrollEntry { … }` block. Add these columns (preserve existing columns; do NOT rename or remove):

```prisma
model PayrollEntry {
  // … existing columns preserved …

  gross_pay              Decimal  @default(0) @db.Decimal(12, 2)
  total_deductions       Decimal  @default(0) @db.Decimal(12, 2)
  net_pay                Decimal  @default(0) @db.Decimal(12, 2)
  allowances_total       Decimal  @default(0) @db.Decimal(12, 2)
  deductions_total       Decimal  @default(0) @db.Decimal(12, 2)
  adjustments_total      Decimal  @default(0) @db.Decimal(12, 2)
  one_off_total          Decimal  @default(0) @db.Decimal(12, 2)

  // … existing relations preserved …
}
```

Important:

- DO NOT remove `basic_pay`, `bonus_pay`, `total_pay`, or `override_total_pay`. They stay for backwards compatibility. Wave 2 populates BOTH the old columns and the new columns during finalisation. Wave 5 plans the deprecation path.
- Add `@@index([tenant_id, compensation_type], name: "idx_payroll_entries_tenant_comp_type")` to the `PayrollEntry` index list.

#### 1b. Add `PayrollDeductionApplication` model

```prisma
model PayrollDeductionApplication {
  id                              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                       String   @db.Uuid
  payroll_run_id                  String   @db.Uuid
  payroll_entry_id                String   @db.Uuid
  staff_recurring_deduction_id    String   @db.Uuid
  applied_amount                  Decimal  @db.Decimal(12, 2)
  applied_at                      DateTime @default(now()) @db.Timestamptz()
  committed_at                    DateTime? @db.Timestamptz()
  created_at                      DateTime @default(now()) @db.Timestamptz()
  updated_at                      DateTime @default(now()) @updatedAt @db.Timestamptz()

  tenant                          Tenant                    @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  payroll_run                     PayrollRun                @relation(fields: [payroll_run_id], references: [id], onDelete: Cascade)
  payroll_entry                   PayrollEntry              @relation(fields: [payroll_entry_id], references: [id], onDelete: Cascade)
  staff_recurring_deduction       StaffRecurringDeduction   @relation(fields: [staff_recurring_deduction_id], references: [id])

  @@unique([payroll_run_id, staff_recurring_deduction_id], name: "uniq_deduction_per_run")
  @@index([tenant_id, payroll_run_id], name: "idx_deduction_apps_run")
  @@index([tenant_id, payroll_entry_id], name: "idx_deduction_apps_entry")
  @@index([tenant_id, staff_recurring_deduction_id], name: "idx_deduction_apps_deduction")
  @@map("payroll_deduction_applications")
}
```

Also add the corresponding back-relation arrays on `Tenant`, `PayrollRun`, `PayrollEntry`, `StaffRecurringDeduction`.

#### 1c. Add the missing index on `PayrollRun`

In the `PayrollRun` model:

```prisma
@@index([tenant_id, period_year, period_month], name: "idx_payroll_runs_tenant_period")
```

### 2. Migrations

Generate three migrations via `pnpm --filter @school/prisma migrate:dev --create-only --name <name>` then hand-edit if needed. The split-into-three structure is intentional — small, surgical migrations are easier to review and roll back.

#### 2a. `<ts>_add_payroll_entry_total_columns/`

The Prisma-generated DDL for the seven new entry columns, plus a backfill that copies `total_pay → net_pay` for existing rows so finalised runs do not reset to zero on display:

```sql
-- migration.sql (Prisma-generated)
ALTER TABLE "payroll_entries" ADD COLUMN "gross_pay" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_entries" ADD COLUMN "total_deductions" DECIMAL(12,2) NOT NULL DEFAULT 0;
-- … etc …

CREATE INDEX "idx_payroll_entries_tenant_comp_type" ON "payroll_entries" ("tenant_id", "compensation_type");

-- post_migrate.sql
-- Backfill so historical entries keep rendering net_pay until Wave 2's finalisation
-- has had a chance to repopulate the new columns when runs are re-finalised.
UPDATE payroll_entries
SET    net_pay = COALESCE(override_total_pay, total_pay)
WHERE  net_pay = 0 AND (total_pay IS NOT NULL OR override_total_pay IS NOT NULL);

UPDATE payroll_entries
SET    gross_pay = COALESCE(basic_pay, 0) + COALESCE(bonus_pay, 0)
WHERE  gross_pay = 0;
```

#### 2b. `<ts>_add_payroll_deduction_applications/`

The Prisma-generated DDL for the new table. The companion `post_migrate.sql` MUST install the canonical RLS policy with `FORCE`:

```sql
-- post_migrate.sql
ALTER TABLE payroll_deduction_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_deduction_applications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_deduction_applications_tenant_isolation ON payroll_deduction_applications;
CREATE POLICY payroll_deduction_applications_tenant_isolation ON payroll_deduction_applications
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

Mirror the same statements into `packages/prisma/rls/policies.sql` (see step 5).

#### 2c. `<ts>_payroll_force_rls_retrofit/`

A single `migration.sql` that re-issues the canonical RLS form for the 10 tables that lack `FORCE` inline. Idempotent — every statement uses `DROP POLICY IF EXISTS` then `CREATE POLICY`. Apply `ALTER TABLE … FORCE ROW LEVEL SECURITY` for each table (it is a no-op on already-FORCED tables but explicit-is-better).

The 10 tables (from the audit): `staff_attendance_records`, `class_delivery_records`, `payroll_adjustments`, `payroll_export_templates`, `payroll_export_logs`, `payroll_approval_configs`, `payroll_allowance_types`, `staff_allowances`, `payroll_one_off_items`, `staff_recurring_deductions`.

For EACH table:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS <table>_tenant_isolation ON <table>;
CREATE POLICY <table>_tenant_isolation ON <table>
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

This migration has no companion `post_migrate.sql` — the `migration.sql` itself is the policy install (idempotent).

### 3. New shared-package modules (`packages/shared/src/payroll/`)

#### 3a. `job-names.ts`

```typescript
export const PAYROLL_QUEUE = 'payroll' as const;

export const PAYROLL_ON_APPROVAL_JOB = 'payroll:on-approval' as const;
export const PAYROLL_MASS_EXPORT_JOB = 'payroll:mass-export' as const;
export const PAYROLL_SESSION_GENERATION_JOB = 'payroll:session-generation' as const;

export type PayrollJobName =
  | typeof PAYROLL_ON_APPROVAL_JOB
  | typeof PAYROLL_MASS_EXPORT_JOB
  | typeof PAYROLL_SESSION_GENERATION_JOB;
```

These are the names the API enqueues with AND the names the worker dispatches on. Wave 3 imports them. Wave 4 imports them. Single source of truth.

#### 3b. `redis-keys.ts`

```typescript
export const buildSessionGenStatusKey = (tenantId: string, runId: string): string =>
  `payroll:session-gen:${tenantId}:${runId}`;

export const buildMassExportStatusKey = (tenantId: string, runId: string): string =>
  `payroll:mass-export:${tenantId}:${runId}:status`;

export const buildMassExportPdfKey = (tenantId: string, runId: string): string =>
  `payroll:mass-export:${tenantId}:${runId}:pdf`;

// Cache settings used by both reader and writer
export const SESSION_GEN_STATUS_TTL_SECONDS = 600;
export const MASS_EXPORT_STATUS_TTL_SECONDS = 600;
export const MASS_EXPORT_PDF_TTL_SECONDS = 1200; // 20 minutes — extended from 5 to give UI a fair download window
```

#### 3c. `payslip-number.ts`

```typescript
export interface FormatPayslipNumberInput {
  prefix: string; // tenant-configured payslip-number prefix (default 'PSL')
  periodYear: number;
  periodMonth: number; // 1–12
  sequence: number; // monotonic per (tenant, period)
}

export const formatPayslipNumber = ({
  prefix,
  periodYear,
  periodMonth,
  sequence,
}: FormatPayslipNumberInput): string => {
  const yearMonth = `${periodYear}${String(periodMonth).padStart(2, '0')}`;
  const seq = String(sequence).padStart(6, '0');
  return `${prefix}-${yearMonth}-${seq}`;
};
```

Decision: the canonical format is `<PREFIX>-YYYYMM-NNNNNN` with **6-digit zero-padded sequence**. This matches the original direct-path format. The approval-path's old 5-digit format is dropped. Wave 4 (worker) re-uses this utility; Wave 2 also re-uses it through the shared `FinalisationService`.

#### 3d. `schemas/payslip-snapshot.schema.ts`

Zod schema for the immutable payslip snapshot:

```typescript
import { z } from 'zod';

export const payslipSnapshotSchema = z.object({
  schema_version: z.literal(1),
  staff: z.object({
    staff_profile_id: z.string().uuid(),
    full_name: z.string(),
    employee_number: z.string().nullable(),
  }),
  period: z.object({
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    start: z.string(), // ISO date
    end: z.string(),
  }),
  compensation: z.object({
    type: z.enum(['salaried', 'per_class', 'mixed']),
    base_salary: z.string().nullable(), // Decimal serialised as string
    per_class_rate: z.string().nullable(),
    bonus_class_multiplier: z.string().nullable(),
  }),
  inputs: z.object({
    days_worked: z.string(),
    total_working_days: z.number().int(),
    classes_delivered: z.number().int(),
    classes_scheduled: z.number().int(),
    bonus_classes: z.number().int().default(0),
  }),
  components: z.object({
    base_pay: z.string(),
    bonus_pay: z.string(),
    allowances: z.array(
      z.object({
        allowance_type_id: z.string().uuid(),
        label: z.string(),
        amount: z.string(),
      }),
    ),
    one_offs: z.array(
      z.object({
        item_type: z.string(),
        label: z.string().nullable(),
        amount: z.string(),
      }),
    ),
    adjustments: z.array(
      z.object({
        adjustment_type: z.string(),
        label: z.string().nullable(),
        amount: z.string(),
      }),
    ),
    deductions: z.array(
      z.object({
        staff_recurring_deduction_id: z.string().uuid(),
        label: z.string(),
        amount: z.string(),
        remaining_after: z.string(),
      }),
    ),
  }),
  totals: z.object({
    gross_pay: z.string(),
    total_deductions: z.string(),
    net_pay: z.string(),
    allowances_total: z.string(),
    deductions_total: z.string(),
    adjustments_total: z.string(),
    one_off_total: z.string(),
  }),
  currency: z.object({
    code: z.string().length(3),
  }),
  generated_at: z.string(), // ISO timestamp
  generated_by_user_id: z.string().uuid(),
});

export type PayslipSnapshot = z.infer<typeof payslipSnapshotSchema>;
```

All Decimal values serialise as strings (`Decimal.toString()`) to preserve precision through JSON.

#### 3e. `schemas/calc-input.schema.ts`

The new Decimal-safe `CalcInput` shape that Wave 2's `CalculationService` consumes:

```typescript
import Decimal from 'decimal.js';

export interface CalcInput {
  compensationType: 'salaried' | 'per_class' | 'mixed';

  // Salaried
  baseSalary: Decimal | null;
  daysWorked: Decimal | null; // Decimal because half-days
  totalWorkingDays: number; // run-level integer

  // Per-class
  perClassRate: Decimal | null;
  classesDelivered: number; // integer count
  bonusClasses: number;
  bonusClassMultiplier: Decimal | null;

  // Inputs from sibling tables (already summed, signed)
  allowancesTotal: Decimal; // always positive
  oneOffPositiveTotal: Decimal; // bonuses, awards
  oneOffNegativeTotal: Decimal; // unpaid corrections
  adjustmentPositiveTotal: Decimal;
  adjustmentNegativeTotal: Decimal;
  scheduledDeductionsTotal: Decimal; // recurring deductions, planned but not yet committed
}

export interface CalcResult {
  basePay: Decimal; // pro-rated salaried, or 0 for per_class
  bonusPay: Decimal; // class-based plus positive one_offs/adjustments
  grossPay: Decimal;
  allowancesTotal: Decimal;
  deductionsTotal: Decimal;
  adjustmentsTotal: Decimal; // signed sum: positive minus negative
  oneOffTotal: Decimal; // signed sum
  totalDeductions: Decimal; // sum of all subtractive components
  netPay: Decimal;
}
```

Note: this is a TypeScript file with a Decimal dependency. We DO NOT define a Zod schema for `CalcInput` because it's an internal API (between resolver and engine), not a wire format. The wire-format Zod schema is `payslipSnapshotSchema` above.

#### 3f. `index.ts` (barrel)

```typescript
export * from './job-names';
export * from './redis-keys';
export * from './payslip-number';
export * from './schemas/payslip-snapshot.schema';
export * from './schemas/calc-input.schema';
export * from './state-machine'; // existing
```

### 4. Update `packages/shared/src/index.ts`

Re-export the payroll subpath:

```typescript
export * from './payroll';
```

If `./payroll` is already exported (it is — for the state machine), confirm the new symbols flow through. Run `pnpm --filter @school/shared build` and verify the dist output includes `job-names`, `redis-keys`, `payslip-number`.

### 5. Permissions seed

In `packages/prisma/seed/system-roles.ts` (or wherever the canonical permission list lives), add two new permissions:

- `payroll.manage_attendance` — granted to roles: Owner, Principal, Vice Principal, Finance, HR.
- `payroll.self_service` — granted to every authenticated user (auto-attach via the role-permissions backfill).

The seed must be **idempotent** — re-running the seed on an already-seeded tenant must be a no-op via `upsert`.

Wave 3 ships an `OnModuleInit` boot hook that backfills these permissions on existing tenants (matching the `InboxPermissionsInit` pattern from new-inbox impl 02). Wave 1 just defines them in the seed; the hook lives in Wave 3.

### 6. Append to `packages/prisma/rls/policies.sql`

Append the canonical policy for `payroll_deduction_applications`:

```sql
ALTER TABLE payroll_deduction_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_deduction_applications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_deduction_applications_tenant_isolation ON payroll_deduction_applications;
CREATE POLICY payroll_deduction_applications_tenant_isolation ON payroll_deduction_applications
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

This file is the durable source-of-truth for RLS policies; the migrations create them and `policies.sql` mirrors them so a fresh DB-recreate via `db:reset` keeps RLS intact.

### 7. Stub `.spec.ts` files for Wave 2 services

Add empty placeholders so the test runner enumerates them but skips:

- `apps/api/src/modules/payroll/finalisation.service.spec.ts`
- `apps/api/src/modules/payroll/payroll-input-resolver.service.spec.ts`

Each contains:

```typescript
describe.skip('FinalisationService', () => {
  it('implemented in payroll-overhaul Wave 2 (impl 02)', () => {
    // intentional placeholder
  });
});
```

These telegraph to the next session where the work lands. Do NOT create the source files in this impl.

---

## Tests

- **Migration smoke test**: spin up an empty Postgres, run the three migrations + seed, assert all new columns and the new table exist with the right shapes.
- **RLS retrofit verification**: after the FORCE-RLS migration, run `SELECT relname, relforcerowsecurity FROM pg_class WHERE relname IN (10 tables)` and assert all 10 are `true`.
- **`payslipSnapshotSchema` round-trip test** in `packages/shared/`: build a fixture snapshot, parse it through the schema, assert no errors. Build an invalid fixture (missing `totals.gross_pay`), parse, assert the expected `ZodError`.
- **`formatPayslipNumber` test**: `formatPayslipNumber({ prefix: 'PSL', periodYear: 2026, periodMonth: 4, sequence: 1 })` returns `'PSL-202604-000001'`. Edge cases: month=12 → `202612`, sequence=999999 → 6-digit, sequence=1000000 → 7-digit (no truncation).
- **Redis-key uniqueness test**: assert `buildSessionGenStatusKey` produces distinct keys for distinct `(tenantId, runId)` pairs and that the format includes both segments.

No service-level tests in this impl — they belong in Wave 2.

---

## Watch out for

- **`Decimal` import.** The `CalcInput` and `CalcResult` types use `Decimal` from `decimal.js`. The `decimal.js` package is already a transitive dep via Prisma but may need explicit listing in `packages/shared/package.json` if `tsc` complains. Verify by running `pnpm --filter @school/shared build`.
- **The 10-table FORCE-RLS retrofit** is idempotent BUT must be applied carefully on production: the `DROP POLICY IF EXISTS` followed by `CREATE POLICY` momentarily leaves the table without a policy. RLS is still ENABLED so all access is blocked — the gap is microseconds and harmless under normal traffic, but DO NOT run this migration mid-business-hours just in case.
- **Existing `total_pay` and `override_total_pay` columns.** Do NOT drop or rename these. Wave 2 still writes to them for backwards compatibility; Wave 5 plans the deprecation. If you remove them now, every existing dashboard query breaks.
- **`payroll_deduction_applications.applied_amount`.** This is the amount applied to ONE entry in ONE run. If a deduction has `monthly_amount = 200.00` and is applied to 5 entries (5 staff members on the same recurring deduction? — not the typical case, but let's be defensive), the applied_amount per row is whatever the deduction was for that specific entry. The unique key is on `(payroll_run_id, staff_recurring_deduction_id)` not `(payroll_entry_id, staff_recurring_deduction_id)` because a single deduction belongs to a single staff member, so the entry+deduction pair is implicit.
- **`Decimal` serialisation in JSON.** When a row with `Decimal` columns is sent back through the API, NestJS's default serialiser turns `Decimal` into the string representation. The frontend must parse it back to a number for display — established pattern in this codebase. Do not change this behaviour in Wave 1.

---

## Deployment notes

This implementation triggers a full rebuild because shared types change. Sequence:

1. Apply patch → `pnpm --filter @school/prisma migrate:deploy` → `pnpm db:post-migrate`.
2. Build all four: `pnpm turbo run build --filter=@school/shared --filter=@school/api --filter=@school/worker --filter=@school/web`.
3. Restart all three: `pm2 restart api worker web --update-env`.
4. Smoke tests:
   - `psql` into prod: `\d payroll_entries` shows the seven new columns; `\d payroll_deduction_applications` shows the new table; `SELECT relname, relforcerowsecurity FROM pg_class WHERE relname = ANY(ARRAY['staff_attendance_records', 'class_delivery_records', 'payroll_adjustments', 'payroll_export_templates', 'payroll_export_logs', 'payroll_approval_configs', 'payroll_allowance_types', 'staff_allowances', 'payroll_one_off_items', 'staff_recurring_deductions'])` returns `t` for every row.
   - Hit `/v1/payroll/runs` against a staging tenant — should return 200 with the same shape as before (new columns are present but empty for non-finalised runs).
   - Hit `/api/health` — should return 200.
   - Verify `pm2 logs api` shows no DI errors on boot. The `PayrollModule` should still register without complaint.
5. The frontend will look identical — this implementation lands schema only. Verify no existing pages 500.

If anything breaks: the migration is fully reversible. `pnpm --filter @school/prisma migrate:resolve --rolled-back <migration>` followed by manual SQL `ALTER TABLE payroll_entries DROP COLUMN gross_pay …` etc.
