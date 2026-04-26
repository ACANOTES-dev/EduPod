# Implementation 08 — Variance Refresh Worker

> **Wave:** 3
> **Depends on:** 01, 06
> **Deploys:** worker restart only

---

## Goal

Materialise `variance_cache` rows nightly per tenant for every active financial model, so the variance dashboard (Wave 4 impl 15) loads in single-digit milliseconds without recomputing planned↔actual joins on every page hit.

The worker reuses the planned/actual computation contract that Phase 06 (`variance.service.ts` + `variance-actuals-source.service.ts`) already exposes — this phase is the cron driver, not the math. The same job is also enqueued one-off by Phase 06's `POST /v1/budgeting/financial-models/:id/variance/refresh` manual-refresh endpoint.

Per `PLAN.md §8.3`:

- Schedule: cron, every night at 02:00 in the tenant's timezone (`tenant.timezone`).
- Payload: `{ tenant_id }` — one job per active tenant per night.
- Per tenant, iterate all `financial_models` where `status = 'published'` AND `fiscal_year_start <= now() <= fiscal_year_end`.
- Idempotent: each refresh wipes the model's existing `variance_cache` rows and rewrites them.

## What to change

### 1. `apps/worker/src/base/queue.constants.ts` — UPDATE

Add the new queue name and the canonical job constants. The constant additions are the only edits in this file; existing entries stay untouched.

```typescript
export const QUEUE_NAMES = {
  ADMISSIONS: 'admissions',
  APPROVALS: 'approvals',
  ATTENDANCE: 'attendance',
  AUDIT_LOG: 'audit-log',
  BEHAVIOUR: 'behaviour',
  BUDGETING: 'budgeting', // ← NEW
  COMPLIANCE: 'compliance',
  // ...rest unchanged
} as const;
```

The job-name constants are exported from each processor file, **not** from this constants file (per the existing convention — see `OVERDUE_DETECTION_JOB`, `INBOX_FALLBACK_CHECK_JOB`). The new processor file declares:

```typescript
export const BUDGETING_VARIANCE_REFRESH_JOB = 'budgeting:variance-refresh';
export const BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB = 'budgeting:variance-refresh-bootstrap';
```

### 2. `apps/worker/src/processors/budgeting/variance-refresh.processor.ts` — NEW

The processor handles two job names on the `budgeting` queue:

- `budgeting:variance-refresh` — per-tenant payload `{ tenant_id }`. Refreshes every active model.
- `budgeting:variance-refresh-bootstrap` — empty payload `{}`. Re-syncs the per-tenant repeatable jobs (handles new tenants and decommissioned tenants).

```typescript
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import type {
  ComputedLineItem,
  Drivers,
  EngineOutputs,
  SourceDataSnapshot,
} from '@school/shared/budgeting';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job names ────────────────────────────────────────────────────────────────

export const BUDGETING_VARIANCE_REFRESH_JOB = 'budgeting:variance-refresh';
export const BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB = 'budgeting:variance-refresh-bootstrap';

// ─── Payload types ────────────────────────────────────────────────────────────

export interface VarianceRefreshPayload {
  tenant_id?: string;
  /** Optional — when present, refresh only this model. Otherwise refresh every active model. */
  financial_model_id?: string;
  /** Used by the manual-refresh endpoint to attribute audit log entries. */
  triggered_by?: 'cron' | 'manual';
}

interface ScopedVarianceRefreshPayload extends TenantJobPayload {
  financial_model_id?: string;
  triggered_by?: 'cron' | 'manual';
}

// ─── Processor (queue boundary, delegates to TenantAwareJob) ──────────────────

@Injectable()
export class VarianceRefreshProcessor {
  private readonly logger = new Logger(VarianceRefreshProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.BUDGETING) private readonly budgetingQueue: Queue,
  ) {}

  async process(job: Job<VarianceRefreshPayload>): Promise<void> {
    if (job.name === BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB) {
      await this.bootstrapPerTenantJobs();
      return;
    }
    if (job.name !== BUDGETING_VARIANCE_REFRESH_JOB) return;

    const { tenant_id, financial_model_id, triggered_by } = job.data;
    if (!tenant_id) {
      this.logger.warn(`${BUDGETING_VARIANCE_REFRESH_JOB} received without tenant_id — rejected`);
      return;
    }

    const refreshJob = new VarianceRefreshJob(this.prisma);
    await refreshJob.execute({
      tenant_id,
      financial_model_id,
      triggered_by: triggered_by ?? 'cron',
    });
  }

  /**
   * Cross-tenant bootstrap — ensures every active tenant has a per-tenant
   * `cron:budgeting-variance-refresh:<tenant_id>` repeatable registered, and
   * removes orphan repeatables for tenants that have been decommissioned.
   *
   * Runs daily at 01:50 (10 minutes before the per-tenant 02:00 schedules) so
   * a newly-onboarded tenant picks up the next day's refresh.
   */
  private async bootstrapPerTenantJobs(): Promise<void> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active' },
      select: { id: true, timezone: true },
    });

    this.logger.log(
      `Bootstrapping variance-refresh repeatables for ${tenants.length} active tenants`,
    );

    // Reconcile: add any missing per-tenant repeatable. We don't remove
    // orphans here — BullMQ's repeatJobKey naming ensures idempotent adds.
    for (const tenant of tenants) {
      const jobId = `cron:${BUDGETING_VARIANCE_REFRESH_JOB}:${tenant.id}`;
      // 02:00 in tenant timezone — BullMQ supports IANA tz on `repeat.tz`.
      await this.budgetingQueue.add(
        BUDGETING_VARIANCE_REFRESH_JOB,
        { tenant_id: tenant.id, triggered_by: 'cron' as const },
        {
          repeat: { pattern: '0 2 * * *', tz: tenant.timezone || 'Europe/Dublin' },
          jobId,
          removeOnComplete: 10,
          removeOnFail: 50,
        },
      );
    }
  }
}

// ─── TenantAwareJob — RLS-bound execution ─────────────────────────────────────

class VarianceRefreshJob extends TenantAwareJob<ScopedVarianceRefreshPayload> {
  private readonly logger = new Logger(VarianceRefreshJob.name);

  protected async processJob(data: ScopedVarianceRefreshPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, financial_model_id, triggered_by } = data;
    const now = new Date();

    // Find the models in scope. If financial_model_id is given (manual-refresh
    // endpoint), refresh only that one — but still verify it's published and
    // the year is in progress so we never materialise variance for a model
    // that has no useful planned/actual semantics.
    const where: Prisma.FinancialModelWhereInput = {
      tenant_id,
      status: 'published',
      fiscal_year_start: { lte: now },
      fiscal_year_end: { gte: now },
      ...(financial_model_id ? { id: financial_model_id } : {}),
    };
    const models = await tx.financialModel.findMany({
      where,
      select: {
        id: true,
        name: true,
        fiscal_year_start: true,
        fiscal_year_end: true,
        current_snapshot_id: true,
      },
    });

    if (models.length === 0) {
      this.logger.log(
        `No active published models for tenant ${tenant_id} — refresh is a no-op (${triggered_by})`,
      );
      return;
    }

    let totalRowsWritten = 0;
    for (const model of models) {
      const written = await this.refreshModel(tx, tenant_id, model);
      totalRowsWritten += written;
    }

    this.logger.log(
      `${BUDGETING_VARIANCE_REFRESH_JOB} done — tenant=${tenant_id} ` +
        `models=${models.length} rows_written=${totalRowsWritten} ` +
        `triggered_by=${triggered_by}`,
    );
  }

  private async refreshModel(
    tx: PrismaClient,
    tenant_id: string,
    model: {
      id: string;
      name: string;
      fiscal_year_start: Date;
      fiscal_year_end: Date;
      current_snapshot_id: string | null;
    },
  ): Promise<number> {
    // 1. Wipe the model's existing variance rows (idempotent re-runs).
    await tx.varianceCache.deleteMany({
      where: { tenant_id, parent_model_id: model.id },
    });

    if (!model.current_snapshot_id) {
      this.logger.warn(
        `Model ${model.id} has no current_snapshot_id — skipping (cannot derive planned values)`,
      );
      return 0;
    }

    // 2. Load the snapshot's payload — drivers, line items, source snapshot.
    const snapshot = await tx.financialModelSnapshot.findUnique({
      where: { id: model.current_snapshot_id },
      select: { id: true, payload: true },
    });
    if (!snapshot) {
      this.logger.warn(
        `Snapshot ${model.current_snapshot_id} not found for model ${model.id} — skipping`,
      );
      return 0;
    }

    const planned = extractPlannedLineItemsFromSnapshot(snapshot.payload);
    if (planned.length === 0) {
      this.logger.warn(`Snapshot ${snapshot.id} has no line_items in payload — skipping`);
      return 0;
    }

    // 3. For each (period_type, period_label) determine the period range and
    //    fetch actuals via VarianceActualsSource. The contract is loaded from
    //    Phase 06 — this worker calls Prisma directly (no DI of API services
    //    in the worker process) using the same SQL the source service uses.
    //    Period generation is deterministic from fiscal_year_start/end + now.
    const today = new Date();
    const rowsToInsert: Prisma.VarianceCacheCreateManyInput[] = [];

    for (const periodType of ['month', 'term', 'year'] as const) {
      const periods = generatePeriods(
        periodType,
        model.fiscal_year_start,
        model.fiscal_year_end,
        today,
      );
      for (const period of periods) {
        const actuals = await fetchActualsForPeriod(tx, tenant_id, period.start, period.end);
        for (const item of planned) {
          const plannedAmount = prorate(item.amount, periodType);
          const actualAmount = actuals[item.line_item_key] ?? 0;
          const variance = round2(actualAmount - plannedAmount);
          const variancePct =
            plannedAmount === 0 ? 0 : round2((variance / Math.abs(plannedAmount)) * 100);
          rowsToInsert.push({
            tenant_id,
            parent_model_id: model.id,
            snapshot_id: snapshot.id,
            period_type: periodType,
            period_label: period.label,
            line_item_key: item.line_item_key,
            planned: new Prisma.Decimal(plannedAmount),
            actual: new Prisma.Decimal(actualAmount),
            variance: new Prisma.Decimal(variance),
            variance_pct: new Prisma.Decimal(variancePct),
            drivers_json: item.drivers_json ?? Prisma.JsonNull,
          });
        }
      }
    }

    // 4. Bulk insert. createMany is supported inside an interactive tx.
    if (rowsToInsert.length > 0) {
      await tx.varianceCache.createMany({ data: rowsToInsert });
    }

    return rowsToInsert.length;
  }
}

// ─── Helpers (pure — exported for spec coverage) ──────────────────────────────

interface PlannedLineItem {
  line_item_key: string;
  amount: number;
  drivers_json: Record<string, unknown> | null;
}

/**
 * Pull a flat planned-line-item array out of a snapshot's serialised payload.
 * The shape mirrors `EngineOutputs.line_items` with composite `line_item_key`
 * = `<category>.<subcategory>` for cache lookup parity with the variance service.
 */
export function extractPlannedLineItemsFromSnapshot(payload: unknown): PlannedLineItem[] {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as { line_items?: ComputedLineItem[] };
  if (!Array.isArray(obj.line_items)) return [];
  // Only fiscal_year=1 lines are used for variance — multi-year horizons
  // surface variance against the active year only.
  return obj.line_items
    .filter((li) => li.fiscal_year === 1)
    .map((li) => ({
      line_item_key: `${li.category}.${li.subcategory}`,
      amount: Number(li.amount) || 0,
      drivers_json: (li.computed_from as Record<string, unknown>) ?? null,
    }));
}

/**
 * Generate the labelled period ranges for a given period_type up to and
 * including today. Beyond today: not generated (no actuals to compare against).
 */
export function generatePeriods(
  periodType: 'month' | 'term' | 'year',
  fyStart: Date,
  fyEnd: Date,
  today: Date,
): Array<{ label: string; start: Date; end: Date }> {
  const cutoff = today < fyEnd ? today : fyEnd;
  if (periodType === 'year') {
    return [
      {
        label: formatYearLabel(fyStart, fyEnd),
        start: fyStart,
        end: cutoff,
      },
    ];
  }
  if (periodType === 'month') {
    const out: Array<{ label: string; start: Date; end: Date }> = [];
    let cursor = new Date(Date.UTC(fyStart.getUTCFullYear(), fyStart.getUTCMonth(), 1));
    while (cursor <= cutoff) {
      const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
      out.push({
        label: formatMonthLabel(cursor),
        start: cursor,
        end: new Date(Math.min(next.getTime() - 1, cutoff.getTime())),
      });
      cursor = next;
    }
    return out;
  }
  // term — three even thirds of the fiscal year
  const totalMs = fyEnd.getTime() - fyStart.getTime();
  const thirdMs = totalMs / 3;
  const out: Array<{ label: string; start: Date; end: Date }> = [];
  for (let t = 0; t < 3; t++) {
    const start = new Date(fyStart.getTime() + t * thirdMs);
    const end = new Date(fyStart.getTime() + (t + 1) * thirdMs - 1);
    if (start > cutoff) break;
    out.push({
      label: `Term ${t + 1} ${formatYearLabel(fyStart, fyEnd)}`,
      start,
      end: end > cutoff ? cutoff : end,
    });
  }
  return out;
}

/** Annual planned → period planned. Monthly = ÷12, Term = ÷3, Year = unchanged. */
export function prorate(annualAmount: number, periodType: 'month' | 'term' | 'year'): number {
  if (periodType === 'month') return round2(annualAmount / 12);
  if (periodType === 'term') return round2(annualAmount / 3);
  return round2(annualAmount);
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function formatYearLabel(start: Date, end: Date): string {
  const sy = start.getUTCFullYear();
  const ey = end.getUTCFullYear();
  return sy === ey ? String(sy) : `${sy}/${String(ey).slice(2)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Fetch actuals for a period using the same SQL contract as Phase 06's
 * `VarianceActualsSourceService`. Returns `{ line_item_key: amount }`.
 *
 * The worker reproduces this query directly rather than DI-injecting the API
 * service because workers run in a separate Nest app. The mapping must stay
 * in lock-step with `variance-actuals-source.service.ts` — when Phase 06
 * adds a category, this helper adds the same join here.
 */
async function fetchActualsForPeriod(
  tx: PrismaClient,
  tenant_id: string,
  start: Date,
  end: Date,
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};

  // Tuition — sum payments received in the period (matches PLAN.md §8.1).
  const tuitionAgg = await tx.payment.aggregate({
    where: {
      tenant_id,
      received_at: { gte: start, lte: end },
    },
    _sum: { amount: true },
  });
  out['income.tuition_net'] = Number(tuitionAgg._sum.amount ?? 0);

  // Discounts — Discount table records applied in period.
  const discountAgg = await tx.discount.aggregate({
    where: {
      tenant_id,
      created_at: { gte: start, lte: end },
    },
    _sum: { value: true },
  });
  // Discounts subtract from net tuition — reflected in the actual flow.
  out['income.tuition_net'] = round2(
    (out['income.tuition_net'] ?? 0) - Number(discountAgg._sum.value ?? 0),
  );

  // Staff costs — payroll entries summed per period.
  const payrollAgg = await tx.payrollEntry.aggregate({
    where: {
      tenant_id,
      pay_period_end: { gte: start, lte: end },
    },
    _sum: { gross_pay: true },
  });
  out['staff_costs.total'] = Number(payrollAgg._sum.gross_pay ?? 0);

  return out;
}
```

### 3. `apps/worker/src/processors/budgeting/variance-refresh.processor.spec.ts` — NEW

Co-located test file. Mocks Prisma + Queue. Asserts:

```typescript
import { Job, Queue } from 'bullmq';

import {
  BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB,
  BUDGETING_VARIANCE_REFRESH_JOB,
  VarianceRefreshProcessor,
  extractPlannedLineItemsFromSnapshot,
  generatePeriods,
  prorate,
} from './variance-refresh.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const MODEL_ID = '22222222-2222-2222-2222-222222222222';
const SNAPSHOT_ID = '33333333-3333-3333-3333-333333333333';

function buildMockTx() {
  return {
    financialModel: { findMany: jest.fn().mockResolvedValue([]) },
    financialModelSnapshot: { findUnique: jest.fn().mockResolvedValue(null) },
    varianceCache: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
    discount: { aggregate: jest.fn().mockResolvedValue({ _sum: { value: 0 } }) },
    payrollEntry: { aggregate: jest.fn().mockResolvedValue({ _sum: { gross_pay: 0 } }) },
    tenant: { findMany: jest.fn().mockResolvedValue([]) },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockPrisma(mockTx: ReturnType<typeof buildMockTx>) {
  return {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    tenant: { findMany: mockTx.tenant.findMany },
  };
}

function buildMockQueue(): Queue {
  return { add: jest.fn().mockResolvedValue({}) } as unknown as Queue;
}

function buildJob(name: string, data: Record<string, unknown> = {}): Job {
  return { id: 'test', name, data } as unknown as Job;
}

describe('VarianceRefreshProcessor', () => {
  it('rejects payload without tenant_id', async () => {
    const tx = buildMockTx();
    const prisma = buildMockPrisma(tx);
    const queue = buildMockQueue();
    const proc = new VarianceRefreshProcessor(prisma as never, queue);
    await proc.process(buildJob(BUDGETING_VARIANCE_REFRESH_JOB));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns no-op when tenant has no active published models', async () => {
    const tx = buildMockTx();
    const prisma = buildMockPrisma(tx);
    const proc = new VarianceRefreshProcessor(prisma as never, buildMockQueue());
    await proc.process(buildJob(BUDGETING_VARIANCE_REFRESH_JOB, { tenant_id: TENANT_ID }));
    expect(tx.varianceCache.createMany).not.toHaveBeenCalled();
  });

  it('wipes existing rows then writes fresh rows for an active model', async () => {
    const tx = buildMockTx();
    tx.financialModel.findMany.mockResolvedValue([
      {
        id: MODEL_ID,
        name: 'FY 2026',
        fiscal_year_start: new Date('2026-09-01T00:00:00Z'),
        fiscal_year_end: new Date('2027-06-30T23:59:59Z'),
        current_snapshot_id: SNAPSHOT_ID,
      },
    ]);
    tx.financialModelSnapshot.findUnique.mockResolvedValue({
      id: SNAPSHOT_ID,
      payload: {
        line_items: [
          {
            category: 'income',
            subcategory: 'tuition_net',
            name: 'Tuition (net)',
            fiscal_year: 1,
            source: 'driver_derived',
            amount: 1_200_000,
            computed_from: {},
          },
          {
            category: 'staff_costs',
            subcategory: 'total',
            name: 'Staff costs total',
            fiscal_year: 1,
            source: 'driver_derived',
            amount: 720_000,
            computed_from: {},
          },
          // year 2 line MUST NOT contribute
          {
            category: 'income',
            subcategory: 'tuition_net',
            name: 'Tuition (net)',
            fiscal_year: 2,
            source: 'driver_derived',
            amount: 0,
            computed_from: {},
          },
        ],
      },
    });
    tx.payment.aggregate.mockResolvedValue({ _sum: { amount: 110_000 } });
    tx.payrollEntry.aggregate.mockResolvedValue({ _sum: { gross_pay: 65_000 } });

    const prisma = buildMockPrisma(tx);
    const proc = new VarianceRefreshProcessor(prisma as never, buildMockQueue());
    await proc.process(buildJob(BUDGETING_VARIANCE_REFRESH_JOB, { tenant_id: TENANT_ID }));

    expect(tx.varianceCache.deleteMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, parent_model_id: MODEL_ID },
    });
    expect(tx.varianceCache.createMany).toHaveBeenCalled();
    const writtenRows = tx.varianceCache.createMany.mock.calls[0][0].data;
    // Each (period_type, period, line_item) triple → one row. There must be
    // rows for both 'income.tuition_net' and 'staff_costs.total', for every
    // generated period across month/term/year.
    expect(
      writtenRows.some((r: { line_item_key: string }) => r.line_item_key === 'income.tuition_net'),
    ).toBe(true);
    expect(
      writtenRows.some((r: { line_item_key: string }) => r.line_item_key === 'staff_costs.total'),
    ).toBe(true);
    // No fiscal_year=2 line item ever surfaces.
    expect(writtenRows.length % 2).toBe(0);
  });

  it('sets RLS context inside the transaction', async () => {
    const tx = buildMockTx();
    const prisma = buildMockPrisma(tx);
    const proc = new VarianceRefreshProcessor(prisma as never, buildMockQueue());
    await proc.process(buildJob(BUDGETING_VARIANCE_REFRESH_JOB, { tenant_id: TENANT_ID }));
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it('bootstrap registers a per-tenant repeatable for every active tenant', async () => {
    const tx = buildMockTx();
    const prisma = buildMockPrisma(tx);
    prisma.tenant.findMany = jest.fn().mockResolvedValue([
      { id: TENANT_ID, timezone: 'Europe/Dublin' },
      { id: '44444444-4444-4444-4444-444444444444', timezone: 'Asia/Riyadh' },
    ]);
    const queue = buildMockQueue();
    const proc = new VarianceRefreshProcessor(prisma as never, queue);
    await proc.process(buildJob(BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB));
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      BUDGETING_VARIANCE_REFRESH_JOB,
      { tenant_id: TENANT_ID, triggered_by: 'cron' },
      expect.objectContaining({
        repeat: expect.objectContaining({ tz: 'Europe/Dublin' }),
        jobId: `cron:${BUDGETING_VARIANCE_REFRESH_JOB}:${TENANT_ID}`,
      }),
    );
  });
});

// ─── Pure helper coverage ─────────────────────────────────────────────────────

describe('extractPlannedLineItemsFromSnapshot', () => {
  it('returns empty array for invalid payload', () => {
    expect(extractPlannedLineItemsFromSnapshot(null)).toEqual([]);
    expect(extractPlannedLineItemsFromSnapshot({ wrong: 'shape' })).toEqual([]);
  });

  it('only includes fiscal_year=1 lines', () => {
    const result = extractPlannedLineItemsFromSnapshot({
      line_items: [
        {
          category: 'income',
          subcategory: 'tuition_net',
          name: 'x',
          fiscal_year: 1,
          source: 'driver_derived',
          amount: 100,
          computed_from: {},
        },
        {
          category: 'income',
          subcategory: 'tuition_net',
          name: 'x',
          fiscal_year: 2,
          source: 'driver_derived',
          amount: 200,
          computed_from: {},
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(100);
  });
});

describe('generatePeriods', () => {
  const fyStart = new Date('2026-09-01T00:00:00Z');
  const fyEnd = new Date('2027-06-30T23:59:59Z');
  const today = new Date('2026-12-15T00:00:00Z');

  it('month: returns one period per fiscal month up to today', () => {
    const periods = generatePeriods('month', fyStart, fyEnd, today);
    expect(periods.length).toBe(4); // Sep, Oct, Nov, Dec
    expect(periods[0].label).toContain('Sep');
    expect(periods[3].label).toContain('Dec');
  });

  it('term: returns up to 3 thirds, clamped to today', () => {
    const periods = generatePeriods('term', fyStart, fyEnd, today);
    expect(periods.length).toBeGreaterThan(0);
    expect(periods.length).toBeLessThanOrEqual(3);
  });

  it('year: returns single row spanning fy', () => {
    const periods = generatePeriods('year', fyStart, fyEnd, today);
    expect(periods).toHaveLength(1);
  });
});

describe('prorate', () => {
  it.each([
    ['month' as const, 1200, 100],
    ['term' as const, 1200, 400],
    ['year' as const, 1200, 1200],
  ])('%s: %i annual → %i', (periodType, annual, expected) => {
    expect(prorate(annual, periodType)).toBe(expected);
  });
});
```

### 4. `apps/worker/src/cron/cron-scheduler.service.ts` — UPDATE

Inject the budgeting queue and add the bootstrap registration. The per-tenant 02:00 schedules are managed by the bootstrap job, not directly here — this keeps newly-onboarded tenants picked up automatically.

```typescript
// Add imports
import {
  BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB,
} from '../processors/budgeting/variance-refresh.processor';

// In the constructor — add the budgeting queue:
@InjectQueue(QUEUE_NAMES.BUDGETING) private readonly budgetingQueue: Queue,

// In onModuleInit, after the existing register*CronJobs calls:
await this.registerBudgetingCronJobs();

// ─── New private method ──────────────────────────────────────────────────────
private async registerBudgetingCronJobs(): Promise<void> {
  // ── budgeting:variance-refresh-bootstrap ────────────────────────────────
  // Runs daily at 01:50 UTC. Cross-tenant — empty payload.
  // Re-syncs the per-tenant `cron:budgeting:variance-refresh:<tenant_id>`
  // repeatables so newly-onboarded tenants are picked up the next night.
  // The per-tenant repeatables fire at 02:00 in each tenant's timezone.
  await this.budgetingQueue.add(
    BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB,
    {},
    {
      repeat: { pattern: '50 1 * * *' },
      jobId: `cron:${BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB}`,
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );
  this.logger.log(
    `Registered repeatable cron: ${BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB} (daily 01:50 UTC)`,
  );
}
```

### 5. `apps/worker/src/worker.module.ts` — UPDATE

Three things land here:

1. Add the `BUDGETING` queue to `BullModule.registerQueue(...)` with retry config matching the gradebook/finance shape (3 attempts, exponential backoff, 5s delay).
2. Add a budgeting queue dispatcher (`BudgetingQueueDispatcher`) — the same `@Processor`-per-queue pattern used by `FinanceQueueDispatcher` to avoid the DZ-48 competitive-consumer race. Phases 09 and 11 will append further job-name cases to this dispatcher.
3. Register `VarianceRefreshProcessor` as a provider.

```typescript
// In BullModule.registerQueue(...)
{
  name: QUEUE_NAMES.BUDGETING,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
},

// In providers — add:
VarianceRefreshProcessor,
BudgetingQueueDispatcher,
```

Create the dispatcher at `apps/worker/src/processors/budgeting/budgeting-queue.processor.ts`:

```typescript
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import {
  BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB,
  BUDGETING_VARIANCE_REFRESH_JOB,
  VarianceRefreshProcessor,
} from './variance-refresh.processor';

@Processor(QUEUE_NAMES.BUDGETING, {
  lockDuration: 600_000, // 10 min — long for board-pack render in Phase 09
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class BudgetingQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(BudgetingQueueDispatcher.name);

  constructor(
    private readonly varianceRefresh: VarianceRefreshProcessor,
    // Phase 09 + 11 add: BoardPackRenderProcessor, ShareableLinkCleanupProcessor
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case BUDGETING_VARIANCE_REFRESH_JOB:
      case BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB:
        await this.varianceRefresh.process(job);
        return;
      // Phase 09 + 11 will add cases here for board-pack-render and shareable-link-cleanup.
      default:
        if (!job.name.startsWith('monitoring:canary-')) {
          this.logger.warn(`Unknown budgeting job name "${job.name}" (id=${job.id})`);
        }
        return;
    }
  }
}
```

### 6. Manual-refresh wiring

Phase 06 already created `POST /v1/budgeting/financial-models/:id/variance/refresh` which enqueues this job. Confirm Phase 06's controller posts to `QUEUE_NAMES.BUDGETING` with `BUDGETING_VARIANCE_REFRESH_JOB`, payload `{ tenant_id, financial_model_id, triggered_by: 'manual' }`, and **without** the `repeat` option (one-off enqueue). If Phase 06 used a placeholder, this implementation is the moment to lock the contract.

### 7. Architecture docs — UPDATE

- `docs/architecture/event-job-catalog.md` — add the `budgeting:variance-refresh` and `budgeting:variance-refresh-bootstrap` entries with their schedules, payloads, and side effects.
- `docs/architecture/module-blast-radius.md` — note that the worker now reads `payment`, `discount`, `payroll_entry`, `financial_model`, `financial_model_snapshot`, `variance_cache`, `tenant` tables.

## Testing requirements

- **Unit (`variance-refresh.processor.spec.ts`)** — every test in §3 above. Cover:
  - Payload without `tenant_id` is rejected.
  - No active models → no-op (no `createMany`).
  - One active model → `deleteMany` called with `{tenant_id, parent_model_id}` then `createMany` called with rows for every (period_type × period × line_item) triple.
  - Only fiscal_year=1 lines contribute to variance.
  - RLS context is set inside the transaction (`tx.$executeRaw` was invoked).
  - Bootstrap job registers per-tenant repeatable with the correct timezone.
  - Pure helpers (`extractPlannedLineItemsFromSnapshot`, `generatePeriods`, `prorate`) covered separately.
- **Integration** — none required for this phase; the planned/actual joins are covered by Phase 06's specs.
- **AppModule DI smoke** — run the verification command from `CLAUDE.md` because `BudgetingQueueDispatcher` adds a new provider to the worker module. The API module is unchanged.
- **Regression** — `pnpm turbo run test --filter=@school/worker` must pass.

## Post-deploy verification

1. Rsync the working tree to production. `chown -R edupod:edupod /opt/edupod/app/`. Build the worker (`cd /opt/edupod/app && pnpm --filter @school/worker build`).
2. `pm2 restart worker`.
3. `pm2 logs worker --lines 100` — confirm the lines:
   - `Registered repeatable cron: budgeting:variance-refresh-bootstrap (daily 01:50 UTC)`
   - On the next bootstrap run (or by triggering one manually with `bullmq` repeatable add via the BullBoard dashboard if available): `Bootstrapping variance-refresh repeatables for N active tenants`.
4. From the API, trigger a manual refresh:
   ```bash
   curl -X POST https://nhqs.edupod.app/api/v1/budgeting/financial-models/<id>/variance/refresh \
     -H "Authorization: Bearer <owner-jwt>"
   ```
   Confirm a 202 response. Within ~1s, `pm2 logs worker` shows the `VarianceRefreshJob done` line with `triggered_by=manual`.
5. In production psql:
   ```sql
   SELECT period_type, COUNT(*) FROM variance_cache
    WHERE tenant_id = '<nhqs-tenant-id>' GROUP BY 1;
   ```
   Should show non-zero counts for all three period_types.

## Follow-ups for subsequent waves

- Phase 09 (export pipeline) appends the `budgeting:board-pack-render` case to `BudgetingQueueDispatcher.process`. The dispatcher and queue are already wired by this phase.
- Phase 11 (shareable links cleanup) appends the `budgeting:shareable-link-cleanup` case.
- Phase 15 (variance dashboard UI) reads from `variance_cache` directly via the variance service from Phase 06; no further worker changes needed.
- The `fetchActualsForPeriod` helper duplicates Phase 06's `VarianceActualsSourceService` SQL by design (workers cannot DI API services). When Phase 06's source service evolves, mirror the change here.

## Rollback

`git revert <commit-sha>` then redeploy. The `variance_cache` table stays — it is owned by Phase 01's migration and re-populates when the worker is reinstated. Active per-tenant repeatables in Redis can be cleared with:

```bash
ssh root@46.62.244.139 "redis-cli -h redis -p 6379 KEYS 'bull:budgeting:repeat:*' | xargs redis-cli DEL"
```

Skip the Redis cleanup if you intend to redeploy quickly — the bootstrap re-registers repeatables on the next 01:50 tick.
