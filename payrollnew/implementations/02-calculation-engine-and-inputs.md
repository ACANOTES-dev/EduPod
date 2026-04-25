# Implementation 02 — Calculation Engine + Input Integration

> **Wave:** 2 (serial — single impl in this wave)
> **Classification:** backend
> **Depends on:** 01
> **Deploys:** API + worker (worker callback delegates to new FinalisationService)

---

## Goal

Rewrite the calculation engine so it actually consumes every input it advertises, unify the two finalisation paths under a single `FinalisationService`, and make every pay computation Decimal-safe end-to-end.

This is the single largest impl in the rebuild. It owns:

1. A new `PayrollInputResolver` service whose only job is to assemble a fully-resolved `CalcInput` for each entry of a run, pulling from compensation (period-bracketed), staff attendance, class delivery records, allowances, deductions, adjustments, and one-offs.
2. A rewritten `CalculationService` that takes a Decimal-safe `CalcInput` and returns a Decimal-safe `CalcResult`. No `Number` coercions anywhere.
3. A new `FinalisationService.finaliseAtomic(runId)` that is the **single source of truth** for finalising a run. Both the direct path (school-owner) and the approval-callback worker path call this service. Identical numbers, identical payslip-number format, identical snapshot.
4. A rewritten `PayrollDeductionsService` with two-phase application: `scheduleApplicationForRun` (idempotent insert into `payroll_deduction_applications`) and `commitApplications` (decrements balances exactly once per run).
5. A rewritten `payroll-runs.service.ts` `createRun` and `refreshEntries` that period-bracket the compensation query and populate the new entry-total columns.
6. A rewritten `approval-callback.processor.ts` in the worker that delegates to `FinalisationService.finaliseAtomic` — no inline calculation logic.

The audit's #1 finding was that allowances/deductions/adjustments/one-offs are dead inputs. After this impl ships, every one of them is wired into both run-creation snapshots and finalisation totals.

---

## Shared files this impl touches

This impl owns its entire footprint within the `apps/api/src/modules/payroll/` directory and the corresponding worker file. No frontend files. No translation files. Module registration is updated.

- `apps/api/src/modules/payroll/payroll.module.ts` — register the new `FinalisationService` and `PayrollInputResolver` providers + ensure exports for downstream consumers. Edit late.
- `apps/worker/src/processors/payroll/approval-callback.processor.ts` — rewritten to delegate. The worker module imports this. Owned by this impl.
- `apps/worker/src/processors/payroll/payroll.module.ts` (or wherever the worker registers payroll processors) — may need an import for `FinalisationService` from the API package; verify the worker can resolve the API service. If not, the FinalisationService must live in a shared module both can import. Decide at start of impl.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Always in a separate commit, after all other commits.

All other files are owned exclusively by this impl: `calculation.service.ts`, `payroll-input-resolver.service.ts` (NEW), `finalisation.service.ts` (NEW), `payroll-runs.service.ts`, `payroll-entries.service.ts`, `compensation.service.ts`, `staff-attendance.service.ts`, `class-delivery.service.ts`, `payroll-allowances.service.ts`, `payroll-deductions.service.ts`, `payroll-adjustments.service.ts`, `payroll-one-offs.service.ts`, `payslips.service.ts`, plus their `.spec.ts` files.

---

## What to build

### 1. Decimal-safe `CalculationService` (`apps/api/src/modules/payroll/calculation.service.ts`)

Replace the existing implementation. Signature:

```typescript
import Decimal from 'decimal.js';
import { CalcInput, CalcResult } from '@school/shared';

@Injectable()
export class CalculationService {
  compute(input: CalcInput): CalcResult {
    // 1. Base pay
    const basePay = this.computeBasePay(input);

    // 2. Class-based bonus pay (per_class only)
    const classBonus = this.computeClassBonus(input);

    // 3. Positive components
    const positiveOneOffs = input.oneOffPositiveTotal;
    const positiveAdjustments = input.adjustmentPositiveTotal;
    const allowances = input.allowancesTotal;

    const grossPay = basePay
      .plus(classBonus)
      .plus(allowances)
      .plus(positiveOneOffs)
      .plus(positiveAdjustments);

    // 4. Negative components
    const negativeOneOffs = input.oneOffNegativeTotal;
    const negativeAdjustments = input.adjustmentNegativeTotal;
    const recurring = input.scheduledDeductionsTotal;

    const totalDeductions = recurring.plus(negativeOneOffs).plus(negativeAdjustments);

    const netPay = grossPay.minus(totalDeductions);

    return {
      basePay,
      bonusPay: classBonus.plus(positiveOneOffs).plus(positiveAdjustments),
      grossPay,
      allowancesTotal: allowances,
      deductionsTotal: recurring,
      adjustmentsTotal: positiveAdjustments.minus(negativeAdjustments),
      oneOffTotal: positiveOneOffs.minus(negativeOneOffs),
      totalDeductions,
      netPay,
    };
  }

  private computeBasePay(input: CalcInput): Decimal {
    if (input.compensationType === 'per_class') return new Decimal(0);
    if (!input.baseSalary || !input.daysWorked || input.totalWorkingDays === 0) {
      return new Decimal(0);
    }
    // Pro-rated: baseSalary × (daysWorked / totalWorkingDays), 4dp intermediate, 2dp final
    const ratio = input.daysWorked.dividedBy(input.totalWorkingDays).toDecimalPlaces(4);
    return input.baseSalary.times(ratio).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  private computeClassBonus(input: CalcInput): Decimal {
    if (input.compensationType === 'salaried') return new Decimal(0);
    if (!input.perClassRate) return new Decimal(0);

    const regular = input.perClassRate.times(input.classesDelivered);

    if (input.bonusClasses === 0 || !input.bonusClassMultiplier) {
      return regular.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    const bonus = input.perClassRate.times(input.bonusClasses).times(input.bonusClassMultiplier);

    return regular.plus(bonus).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }
}
```

Rounding: 4dp intermediate, 2dp final, half-up. This matches the existing engine's behaviour (verified by the audit) — keep the same rounding so historical comparison reports stay sensible.

### 2. NEW `PayrollInputResolver` service

```
apps/api/src/modules/payroll/payroll-input-resolver.service.ts
```

Responsibility: given a `payrollRun`, produce a `Map<entryId, CalcInput>` containing fully-resolved inputs for every entry. This is the single place where the resolver pulls from every input source.

```typescript
@Injectable()
export class PayrollInputResolver {
  constructor(
    @Inject('PrismaService') private readonly prisma: PrismaService,
    private readonly attendance: StaffAttendanceService,
    private readonly classDelivery: ClassDeliveryService,
    private readonly allowances: PayrollAllowancesService,
    private readonly deductions: PayrollDeductionsService,
    private readonly adjustments: PayrollAdjustmentsService,
    private readonly oneOffs: PayrollOneOffsService,
    private readonly compensation: CompensationService,
  ) {}

  async resolveForRun(
    tenantId: string,
    runId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, CalcInput>> {
    const db = tx ?? this.prisma;

    // 1. Load run + all entries with staff_profile relation
    const run = await db.payrollRun.findFirstOrThrow({
      where: { id: runId, tenant_id: tenantId },
      include: {
        entries: {
          include: { staff_profile: { include: { user: true } } },
        },
      },
    });

    const periodStart = startOfMonth(run.period_year, run.period_month);
    const periodEnd = endOfMonth(run.period_year, run.period_month);
    const totalWorkingDays = run.total_working_days;

    const result = new Map<string, CalcInput>();

    for (const entry of run.entries) {
      // 2. Period-bracketed compensation
      const comp = await this.compensation.findActiveForPeriod(
        tenantId,
        entry.staff_profile_id,
        periodStart,
        periodEnd,
        db,
      );

      if (!comp) continue; // skip entries with no period-active compensation

      // 3. Days worked from attendance (salaried only)
      const daysWorked =
        comp.compensation_type === 'salaried' || comp.compensation_type === 'mixed'
          ? await this.attendance.calculateDaysWorked(
              tenantId,
              entry.staff_profile_id,
              periodStart,
              periodEnd,
              db,
            )
          : new Decimal(totalWorkingDays);

      // 4. Classes delivered from confirmed delivery records (per_class + mixed)
      const { delivered, bonusClasses } =
        comp.compensation_type === 'per_class' || comp.compensation_type === 'mixed'
          ? await this.classDelivery.calculateClassesDelivered(
              tenantId,
              entry.staff_profile_id,
              periodStart,
              periodEnd,
              db,
            )
          : { delivered: 0, bonusClasses: 0 };

      // 5. Allowances active during the period
      const allowancesTotal = await this.allowances.calculateAllowancesForEntry(
        tenantId,
        entry.staff_profile_id,
        periodStart,
        periodEnd,
        db,
      );

      // 6. Recurring deductions — scheduled (idempotent, returns total)
      const scheduledDeductionsTotal = await this.deductions.scheduleApplicationForRun(
        tenantId,
        run.id,
        entry.id,
        entry.staff_profile_id,
        db,
      );

      // 7. One-offs — split positive/negative
      const oneOffSums = await this.oneOffs.sumForEntry(tenantId, entry.id, db);

      // 8. Adjustments — split positive/negative
      const adjustmentSums = await this.adjustments.sumForEntry(tenantId, entry.id, db);

      result.set(entry.id, {
        compensationType: comp.compensation_type,
        baseSalary: comp.base_salary ? new Decimal(comp.base_salary.toString()) : null,
        daysWorked,
        totalWorkingDays,
        perClassRate: comp.per_class_rate ? new Decimal(comp.per_class_rate.toString()) : null,
        classesDelivered: delivered,
        bonusClasses,
        bonusClassMultiplier: comp.bonus_class_multiplier
          ? new Decimal(comp.bonus_class_multiplier.toString())
          : null,
        allowancesTotal,
        oneOffPositiveTotal: oneOffSums.positive,
        oneOffNegativeTotal: oneOffSums.negative,
        adjustmentPositiveTotal: adjustmentSums.positive,
        adjustmentNegativeTotal: adjustmentSums.negative,
        scheduledDeductionsTotal,
      });
    }

    return result;
  }
}
```

All math is `Decimal`. All queries take a tenantId and (optionally) a transaction client. Period-bracketing is centralised in `compensation.findActiveForPeriod()` and the `attendance.calculateDaysWorked()` and `classDelivery.calculateClassesDelivered()` calls.

### 3. NEW `FinalisationService` (`apps/api/src/modules/payroll/finalisation.service.ts`)

The single source of truth for finalising a run. Both the direct path (controller) and the worker callback call this method.

```typescript
@Injectable()
export class FinalisationService {
  constructor(
    @Inject('PrismaService') private readonly prisma: PrismaService,
    private readonly resolver: PayrollInputResolver,
    private readonly engine: CalculationService,
    private readonly deductions: PayrollDeductionsService,
    private readonly payslips: PayslipsService,
    private readonly approvals: ApprovalRequestsService,
  ) {}

  /**
   * Atomic finalisation. Idempotent under retry.
   * Caller (controller or worker) provides tenantId + runId + actor.
   * Returns the run after finalisation.
   */
  async finaliseAtomic(input: {
    tenantId: string;
    runId: string;
    actorUserId: string;
    expectedFromState: 'draft' | 'pending_approval';
  }): Promise<PayrollRun> {
    return createRlsClient(this.prisma, { tenant_id: input.tenantId }).$transaction(async (tx) => {
      const run = await tx.payrollRun.findFirstOrThrow({
        where: { id: input.runId, tenant_id: input.tenantId },
      });

      if (run.status === 'finalised') {
        // Self-heal — already done.
        return run;
      }

      if (run.status !== input.expectedFromState) {
        throw new ConflictException({
          code: 'PAYROLL_RUN_INVALID_STATE',
          message: `Expected run to be ${input.expectedFromState}, found ${run.status}`,
        });
      }

      // 1. Re-resolve all inputs (idempotent — schedule applications, no commits yet)
      const inputs = await this.resolver.resolveForRun(input.tenantId, run.id, tx);

      // 2. Compute pay per entry
      const results = new Map<string, CalcResult>();
      for (const [entryId, calcInput] of inputs) {
        results.set(entryId, this.engine.compute(calcInput));
      }

      // 3. Persist totals on entries
      for (const [entryId, result] of results) {
        await tx.payrollEntry.update({
          where: { id: entryId },
          data: {
            // New columns
            gross_pay: result.grossPay.toString(),
            total_deductions: result.totalDeductions.toString(),
            net_pay: result.netPay.toString(),
            allowances_total: result.allowancesTotal.toString(),
            deductions_total: result.deductionsTotal.toString(),
            adjustments_total: result.adjustmentsTotal.toString(),
            one_off_total: result.oneOffTotal.toString(),
            // Old columns for backwards compatibility
            basic_pay: result.basePay.toString(),
            bonus_pay: result.bonusPay.toString(),
            total_pay: result.netPay.toString(),
          },
        });
      }

      // 4. Commit deduction applications (decrements balances, exactly once per run)
      await this.deductions.commitApplications(input.tenantId, run.id, tx);

      // 5. Generate payslips with unified number format
      await this.payslips.generateForRun(input.tenantId, run.id, input.actorUserId, tx);

      // 6. Update run state
      const finalised = await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: 'finalised',
          finalised_at: new Date(),
          finalised_by_user_id: input.actorUserId,
        },
      });

      // 7. If approval-bound, mark request executed
      if (run.approval_request_id) {
        await this.approvals.markExecuted(input.tenantId, run.approval_request_id, tx);
      }

      return finalised;
    });
  }
}
```

Critical properties:

- Wrapped in a single RLS-scoped `$transaction`. If anything fails, everything rolls back — no half-finalised state.
- `expectedFromState` lets the caller assert the entry condition. Direct path passes `'draft'`; worker callback passes `'pending_approval'`.
- The status-already-finalised early return is the self-heal for retry-after-success.
- `markExecuted` on the approval module is a NEW method that the approvals module must expose. Wave 2 owns this — extend the approvals module with the method (it's a one-line wrapper around the existing UPDATE).

### 4. Two-phase deduction application (`payroll-deductions.service.ts`)

REPLACE the existing destructive `autoApplyForRun` with two methods:

```typescript
/**
 * Phase 1 — Schedule. Idempotent.
 *
 * Inserts a row into payroll_deduction_applications for each active deduction
 * for the given staff member that is due in this run period. Returns the total
 * scheduled amount as a Decimal.
 *
 * Safe to call multiple times: the unique key (payroll_run_id, staff_recurring_deduction_id)
 * means a second call no-ops on conflict.
 */
async scheduleApplicationForRun(
  tenantId: string,
  runId: string,
  entryId: string,
  staffProfileId: string,
  tx?: Prisma.TransactionClient,
): Promise<Decimal> {
  const db = tx ?? this.prisma;
  const run = await db.payrollRun.findFirstOrThrow({ where: { id: runId, tenant_id: tenantId }});
  const periodStart = startOfMonth(run.period_year, run.period_month);

  const deductions = await db.staffRecurringDeduction.findMany({
    where: {
      tenant_id: tenantId,
      staff_profile_id: staffProfileId,
      active: true,
      start_date: { lte: periodStart },         // gate: not future-dated
      OR: [
        { end_date: null },
        { end_date: { gte: periodStart }},
      ],
    },
  });

  let total = new Decimal(0);
  for (const d of deductions) {
    // Decide the applied amount: monthly_amount, capped by remaining_amount
    const remaining = new Decimal(d.remaining_amount.toString());
    const monthly = new Decimal(d.monthly_amount.toString());
    const applied = Decimal.min(monthly, remaining);

    if (applied.lte(0)) continue;

    // Idempotent insert via unique constraint
    await db.payrollDeductionApplication.upsert({
      where: { payroll_run_id_staff_recurring_deduction_id: { payroll_run_id: runId, staff_recurring_deduction_id: d.id }},
      create: {
        tenant_id: tenantId,
        payroll_run_id: runId,
        payroll_entry_id: entryId,
        staff_recurring_deduction_id: d.id,
        applied_amount: applied.toString(),
      },
      update: {},  // no-op; existing application stands
    });

    total = total.plus(applied);
  }

  return total;
}

/**
 * Phase 2 — Commit. Decrements balances exactly once per run.
 *
 * For each application row in payroll_deduction_applications WHERE payroll_run_id = runId
 * AND committed_at IS NULL: decrement the underlying staff_recurring_deduction.remaining_amount,
 * decrement months_remaining, mark deduction.active=false if balance hits zero, and stamp
 * committed_at on the application row.
 */
async commitApplications(
  tenantId: string,
  runId: string,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? this.prisma;
  const apps = await db.payrollDeductionApplication.findMany({
    where: { tenant_id: tenantId, payroll_run_id: runId, committed_at: null },
    include: { staff_recurring_deduction: true },
  });

  for (const app of apps) {
    const deduction = app.staff_recurring_deduction;
    const remainingNow = new Decimal(deduction.remaining_amount.toString());
    const applied = new Decimal(app.applied_amount.toString());
    const newRemaining = Decimal.max(remainingNow.minus(applied), new Decimal(0));
    const newMonthsRemaining = Math.max(0, deduction.months_remaining - 1);

    await db.staffRecurringDeduction.update({
      where: { id: deduction.id },
      data: {
        remaining_amount: newRemaining.toString(),
        months_remaining: newMonthsRemaining,
        active: newRemaining.gt(0) && newMonthsRemaining > 0,
      },
    });

    await db.payrollDeductionApplication.update({
      where: { id: app.id },
      data: { committed_at: new Date() },
    });
  }
}
```

Delete the old `autoApplyForRun` method or alias it to throw `DEPRECATED — use scheduleApplicationForRun + commitApplications`. Wave 5 finishes the deprecation.

### 5. Period-bracketed `findActiveForPeriod` (`compensation.service.ts`)

Add a new method (do NOT remove the existing `findActiveForStaff` — Wave 5 deprecates it):

```typescript
async findActiveForPeriod(
  tenantId: string,
  staffProfileId: string,
  periodStart: Date,
  periodEnd: Date,
  tx?: Prisma.TransactionClient,
): Promise<StaffCompensation | null> {
  const db = tx ?? this.prisma;
  const rows = await db.staffCompensation.findMany({
    where: {
      tenant_id: tenantId,
      staff_profile_id: staffProfileId,
      effective_from: { lte: periodEnd },
      OR: [
        { effective_to: null },
        { effective_to: { gte: periodStart }},
      ],
    },
    orderBy: { effective_from: 'desc' },
    take: 1,
  });
  return rows[0] ?? null;
}
```

For a staff member with multiple historical compensations whose effective ranges overlap the run period, this returns the MOST RECENT (highest `effective_from`). Documented as the convention; Wave 5 adds an architectural-doc danger-zone entry about overlap behaviour.

### 6. Aligned input methods on existing services

Each input service exposes the method `PayrollInputResolver` calls. Most exist already; some need a tightened signature.

- `staff-attendance.service.ts`:
  - `calculateDaysWorked(tenantId, staffProfileId, periodStart, periodEnd, tx?)` returns `Decimal` — counts `present` (1.0) and `half_day` (0.5) and `paid_leave` (1.0) statuses. Excludes `absent` and `unpaid_leave`. If no records exist for any day, default to the run's `total_working_days` (so a tenant who never marks attendance still gets full pay — explicit fallback, not silent).
- `class-delivery.service.ts`:
  - `calculateClassesDelivered(tenantId, staffProfileId, periodStart, periodEnd, tx?)` returns `{ delivered: number, bonusClasses: number }` — counts `delivered` records, splits bonus_class flag if it exists on the record (fallback to 0 bonus classes if the flag is not on the schema).
- `payroll-allowances.service.ts`:
  - `calculateAllowancesForEntry(tenantId, staffProfileId, periodStart, periodEnd, tx?)` returns `Decimal` — sums all `staff_allowances` rows where `effective_from <= periodEnd AND (effective_to IS NULL OR effective_to >= periodStart)`. Pro-rate if effective range only covers part of the run period.
- `payroll-adjustments.service.ts`:
  - `sumForEntry(tenantId, entryId, tx?)` returns `{ positive: Decimal, negative: Decimal }` — splits by `adjustment_type` (bonus/correction-positive vs deduction/correction-negative), or by sign of `amount` if the type field is unreliable.
- `payroll-one-offs.service.ts`:
  - `sumForEntry(tenantId, entryId, tx?)` returns `{ positive: Decimal, negative: Decimal }` — same shape.

If any of these methods exist with a different signature, REWRITE them rather than adding parallel methods. Each one had unused legacy variants; clean them up.

### 7. `payroll-runs.service.ts` rewrite

The `createRun` and `refreshEntries` methods get cleaner:

```typescript
async createRun(tenantId: string, dto: CreatePayrollRunDto, actorUserId: string): Promise<PayrollRun> {
  return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
    // 1. Duplicate guard
    const existing = await tx.payrollRun.findFirst({
      where: { tenant_id: tenantId, period_year: dto.period_year, period_month: dto.period_month },
    });
    if (existing) throw new ConflictException({ code: 'DUPLICATE_PAYROLL_RUN', message: '...' });

    // 2. Create run
    const run = await tx.payrollRun.create({ data: { ...dto, tenant_id: tenantId, status: 'draft', created_by_user_id: actorUserId }});

    // 3. Find all active staff
    const staff = await tx.staffProfile.findMany({
      where: { tenant_id: tenantId, employment_status: 'active' },
    });

    // 4. For each staff, create entry if they have period-active compensation
    const periodStart = startOfMonth(run.period_year, run.period_month);
    const periodEnd = endOfMonth(run.period_year, run.period_month);
    for (const sp of staff) {
      const comp = await this.compensation.findActiveForPeriod(tenantId, sp.id, periodStart, periodEnd, tx);
      if (!comp) continue;
      await tx.payrollEntry.create({
        data: {
          tenant_id: tenantId,
          payroll_run_id: run.id,
          staff_profile_id: sp.id,
          compensation_type: comp.compensation_type,
          // snapshot fields from compensation
          snapshot_base_salary: comp.base_salary,
          snapshot_per_class_rate: comp.per_class_rate,
          // … etc
        },
      });
    }

    // 5. Resolve all inputs and write totals to entries (so the UI shows numbers right away)
    const inputs = await this.inputResolver.resolveForRun(tenantId, run.id, tx);
    for (const [entryId, ci] of inputs) {
      const result = this.engine.compute(ci);
      await tx.payrollEntry.update({ where: { id: entryId }, data: {
        gross_pay: result.grossPay.toString(),
        total_deductions: result.totalDeductions.toString(),
        net_pay: result.netPay.toString(),
        allowances_total: result.allowancesTotal.toString(),
        deductions_total: result.deductionsTotal.toString(),
        adjustments_total: result.adjustmentsTotal.toString(),
        one_off_total: result.oneOffTotal.toString(),
        basic_pay: result.basePay.toString(),
        bonus_pay: result.bonusPay.toString(),
        total_pay: result.netPay.toString(),
      }});
    }

    return run;
  });
}

async refreshEntries(tenantId: string, runId: string): Promise<PayrollRun> {
  // Same shape as createRun's steps 3–5. Add net-new staff (compensation became active mid-period).
  // Update existing entries with fresh inputs.
  // Idempotent — runs always produce the same result for the same input state.
}
```

### 8. `payslips.service.ts` — `generateForRun` and `generateOne`

Add a new transaction-aware method `generateForRun(tenantId, runId, actorUserId, tx)` that:

1. Fetches all entries for the run.
2. For each entry, calls `generateOne(entry, tx)`.

`generateOne(entry, tx)`:

1. Skips if a payslip already exists for that entry (idempotent retry).
2. Allocates the next sequence via `SequenceService.next(tenantId, 'payslip', { period_year, period_month }, tx)`.
3. Calls `formatPayslipNumber({ prefix, periodYear, periodMonth, sequence })` from `@school/shared`.
4. Builds `snapshot_payload_json` per `payslipSnapshotSchema`. Validate via `payslipSnapshotSchema.parse(snapshot)` BEFORE the insert — fails fast on any missing field.
5. Inserts the payslip row.

Both finalisation paths call `generateForRun`. The old direct-path code that did manual `SELECT FOR UPDATE` is replaced by the centralised `SequenceService` (already exists in the codebase — extend its `next` to accept a period qualifier if it doesn't already).

### 9. `approval-callback.processor.ts` rewrite

The worker becomes a thin shell:

```typescript
class PayrollApprovalCallbackJob extends TenantAwareJob<ApprovalCallbackPayload> {
  constructor(/* DI for FinalisationService */) {
    super();
  }

  async processJob(): Promise<void> {
    await this.finalisationService.finaliseAtomic({
      tenantId: this.payload.tenant_id,
      runId: this.payload.payroll_run_id,
      actorUserId: this.payload.actor_user_id,
      expectedFromState: 'pending_approval',
    });
  }
}
```

All the inline calculation, payslip-creation, and entry-update logic is GONE. The processor just dispatches to `FinalisationService`. If the worker module cannot DI a service from the API package (typical NestJS monorepo gotcha), the fix is to publish the service through a shared NestJS module (e.g. `PayrollFinalisationModule` in `apps/api/src/modules/payroll/finalisation.module.ts`) and import it from both API and worker. Decide at impl start.

### 10. Module registration (`apps/api/src/modules/payroll/payroll.module.ts`)

Add to `providers`:

- `FinalisationService`
- `PayrollInputResolver`

Add to `exports`:

- `FinalisationService` (so the worker can import via `forwardRef` or shared module)
- `PayrollInputResolver` (for tests and future consumers)

Drop the `StaffProfilesModule` import noted as unused in the audit (verify nothing in the module actually uses it — if a sibling does, leave it).

### 11. Update `payroll-runs.service.ts` finalise method

The `finalise()` method (called by the controller) becomes:

```typescript
async finalise(tenantId: string, runId: string, actorUserId: string, isSchoolOwner: boolean): Promise<{ pending: boolean; run: PayrollRun }> {
  // Decision: if approval is required, request it. If not, finalise directly.
  const requireApproval = !isSchoolOwner;  // Wave 3 may refine this with policy

  if (requireApproval) {
    return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
      const run = await tx.payrollRun.findFirstOrThrow({ where: { id: runId, tenant_id: tenantId }});
      if (!isValidPayrollRunTransition(run.status, 'pending_approval')) {
        throw new ConflictException({ code: 'INVALID_STATUS_TRANSITION' });
      }
      const approval = await this.approvals.checkAndCreateIfNeeded({
        tenantId, action_type: 'payroll_finalise', resource_id: runId, actor_user_id: actorUserId,
      });
      const updated = await tx.payrollRun.update({
        where: { id: runId },
        data: { status: 'pending_approval', approval_request_id: approval.id },
      });
      return { pending: true, run: updated };
    });
  }

  // Direct path — school owner. Same code path the worker uses.
  const run = await this.finalisation.finaliseAtomic({
    tenantId,
    runId,
    actorUserId,
    expectedFromState: 'draft',
  });
  return { pending: false, run };
}
```

The `isSchoolOwner` flag is passed from the controller. Wave 3 is the impl that decides how `isSchoolOwner` is determined (proper resolution, or formally remove the dual path). Wave 2's job is just to make the direct path WORK if/when it's invoked.

### 12. Allow `cancel` from `pending_approval`

In `packages/shared/src/payroll/state-machine.ts`, add `'cancelled'` to the valid transitions from `pending_approval`. Verify the state-machine spec test still passes after this.

The `cancelRun` method in `payroll-runs.service.ts` should also call `approvals.cancelRequest(approvalRequestId)` if the run had a pending approval — so the approval row doesn't dangle.

---

## Tests

Co-located `.spec.ts` for every modified or new file. Specific tests:

- `calculation.service.spec.ts`: every input combination (salaried / per_class / mixed × all-zero allowances/one-offs/adjustments/deductions × non-zero variants). Decimal precision tests: assert no precision loss after 100-step accumulation. Pro-rate tests: 22 working days, 11 days worked, 50,000 base → 25,000 net (before deductions). Bonus tests: per_class_rate 100 × 20 delivered + 5 bonus × 1.5 multiplier → 2,000 + 750.
- `payroll-input-resolver.service.spec.ts`: builds a run with mixed staff (salaried + per_class + mixed). Asserts every input source is read. RLS leakage test: tenantA's resolver doesn't see tenantB's staff.
- `finalisation.service.spec.ts`:
  - happy path: draft → finalised, all entries get totals + payslips
  - retry-after-success: calling finaliseAtomic twice on a finalised run is a no-op
  - retry-after-failure: simulate a failure mid-transaction (mock `payslip.create` throw); assert state stays `pending_approval`/`draft`, deductions stay un-committed, no payslip dangles
  - cancelled-during-approval: calling finaliseAtomic on a cancelled run throws `PAYROLL_RUN_INVALID_STATE`
  - approval-path numbers match direct-path numbers (build the same fixture, call both paths, assert identical output)
- `payroll-deductions.service.spec.ts`:
  - schedule then commit decrements balance exactly once
  - calling schedule twice on the same (run, deduction) inserts only one row (unique key)
  - calling commit twice on the same run no-ops the second time
  - commit on a deduction with `monthly_amount > remaining_amount` decrements to zero and marks active=false
- `compensation.service.spec.ts`:
  - findActiveForPeriod returns the most recent comp whose range overlaps the period
  - returns null if no comp overlaps the period
- `staff-attendance.service.spec.ts`:
  - calculateDaysWorked sums present (1.0) + half_day (0.5) + paid_leave (1.0)
  - excludes absent and unpaid_leave
  - falls back to total_working_days if no records exist for any day in the range
- `class-delivery.service.spec.ts`:
  - calculateClassesDelivered counts only `status = 'delivered'` records in the period
  - bonusClasses split correctly
- `approval-callback.processor.spec.ts`:
  - delegates to FinalisationService with the right args
  - throws if tenant_id or payroll_run_id missing
  - retry behaviour: second invocation on already-finalised run is a no-op (no double payslip generation)

Plus a CROSS-PATH integration test: build a fixture, call `requestFinalisation` (direct, school-owner path), capture the result. Build the same fixture, call `requestFinalisation` (approval path → simulate worker callback). Assert the two payslip sets have identical net_pay values, identical snapshot_payload_json (modulo timestamps), and consecutive payslip numbers in the same `<PREFIX>-YYYYMM-NNNNNN` format.

---

## Watch out for

- **The worker must be able to DI `FinalisationService` from the API package.** This is a known NestJS monorepo gotcha. Solutions in order of preference: (a) move `FinalisationService` and its deps into a shared module that both API and worker import; (b) instantiate `FinalisationService` manually in the worker by re-creating its dependency tree; (c) call the API over HTTP from the worker (last resort, breaks transaction guarantees). Pick (a). The shared module is `apps/api/src/modules/payroll/finalisation.module.ts` exporting `FinalisationService` and importing the dependent services.
- **`SequenceService.next(tenantId, kind, scope, tx)`** may not exist with this signature. Check the actual API — extend if needed. Critical: it MUST run inside the caller's transaction so a sequence increment that doesn't see a commit also doesn't leak.
- **`Decimal` JSON serialisation.** Prisma `Decimal` columns return as `Prisma.Decimal` instances in TS but serialise to strings in JSON. The `payslipSnapshotSchema` expects strings — convert via `.toString()` before validation.
- **`ResponseTransformInterceptor`** wraps non-paginated payloads in `{ data }`. Any new endpoint added in this impl that returns a single object (not paginated) will be wrapped. The frontend must read `res.data.field` accordingly. Wave 4 handles the frontend side.
- **`approval_request_id` on `PayrollRun`.** Verify the column exists; if not, add it to schema (probably a Wave 1 oversight). The audit confirmed it's used by the existing finalise flow.
- **Backwards compat columns.** `basic_pay`, `bonus_pay`, `total_pay`, `override_total_pay` MUST be populated alongside the new columns. Old dashboards still read them. Wave 5 plans the deprecation.
- **`payroll-anomaly.service.ts`** — surface its outputs via `/runs/:id/anomalies` in Wave 3, but Wave 2 needs to invoke it during finalisation (so anomalies are detected against the new totals). Add a call to `anomaly.scanRun(tenantId, runId, tx)` after step 3 in `finaliseAtomic`. Anomalies don't block finalisation — they're advisory.
- **State machine update**: adding `'cancelled'` to `pending_approval` valid transitions changes the existing `state-machine.spec.ts`. Update the spec to reflect the new transition.

---

## Deployment notes

This impl restarts API + worker. Sequence:

1. Apply patch.
2. No migration in this impl (Wave 1 owned migrations).
3. Build: `pnpm turbo run build --filter=@school/api --filter=@school/worker`.
4. Restart: `pm2 restart api worker --update-env`.
5. Smoke tests:
   - Create a draft run on a staging tenant. Verify the entries table populates with the new total columns. Spot-check one staff member: their `gross_pay` should equal `basic_pay + bonus_pay + allowances_total`. Their `net_pay` should equal `gross_pay - total_deductions`.
   - Add an allowance to a staff member. Refresh the run. Verify their `allowances_total` updates.
   - Add a one-off bonus on an entry. Refresh. Verify `one_off_total` reflects it.
   - Add an adjustment (negative type). Refresh. Verify `adjustments_total` is negative.
   - Finalise the run via the school-owner direct path (you may need to temporarily flip `isSchoolOwner` to true; Wave 3 makes this proper). Verify a payslip appears with format `PSL-YYYYMM-000001`. Verify deduction balance decremented.
   - Re-finalise the same run (idempotent self-heal): no double payslip, no double balance decrement.
   - Run a tenant-isolation test: as tenantA, attempt to finalise a run that belongs to tenantB by calling `finaliseAtomic` directly. Assert it 404s.
6. Worker smoke: trigger an approval-required finalisation via the existing approval flow on a fresh tenant. Verify the worker callback fires, produces the same payslip-number format, and the totals match a parallel direct-path finalisation on a clone run.

If the cross-path integration test passes locally and the smoke tests pass on prod, the dual-path divergence is closed.
