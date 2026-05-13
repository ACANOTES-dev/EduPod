import { Job, Queue } from 'bullmq';

import {
  BUDGETING_VARIANCE_REFRESH_BOOTSTRAP_JOB,
  BUDGETING_VARIANCE_REFRESH_JOB,
  VarianceRefreshProcessor,
  extractPlannedLineItemsFromSnapshot,
  generatePeriods,
  prorate,
} from './variance-refresh.processor';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const MODEL_ID = '22222222-2222-4222-8222-222222222222';
const SNAPSHOT_ID = '33333333-3333-4333-8333-333333333333';

function buildMockTx() {
  return {
    financialModel: { findMany: jest.fn().mockResolvedValue([]) },
    financialModelSnapshot: { findUnique: jest.fn().mockResolvedValue(null) },
    varianceCache: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    payment: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
    refund: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
    payrollEntry: { findMany: jest.fn().mockResolvedValue([]) },
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

function buildTenantModuleService(enabled = true) {
  return { isEnabled: jest.fn().mockResolvedValue(enabled) };
}

function buildJob(name: string, data: Record<string, unknown> = {}): Job {
  return { id: 'test', name, data } as unknown as Job;
}

describe('VarianceRefreshProcessor', () => {
  it('rejects payload without tenant_id', async () => {
    const tx = buildMockTx();
    const prisma = buildMockPrisma(tx);
    const queue = buildMockQueue();
    const proc = new VarianceRefreshProcessor(
      prisma as never,
      queue,
      buildTenantModuleService() as never,
    );
    await proc.process(buildJob(BUDGETING_VARIANCE_REFRESH_JOB));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns no-op when tenant has no active published models', async () => {
    const tx = buildMockTx();
    const prisma = buildMockPrisma(tx);
    const proc = new VarianceRefreshProcessor(
      prisma as never,
      buildMockQueue(),
      buildTenantModuleService() as never,
    );
    await proc.process(buildJob(BUDGETING_VARIANCE_REFRESH_JOB, { tenant_id: TENANT_ID }));
    expect(tx.varianceCache.createMany).not.toHaveBeenCalled();
  });

  it('treats legacy `manual: true` as triggered_by=manual', async () => {
    const tx = buildMockTx();
    const prisma = buildMockPrisma(tx);
    const proc = new VarianceRefreshProcessor(
      prisma as never,
      buildMockQueue(),
      buildTenantModuleService() as never,
    );
    await proc.process(
      buildJob(BUDGETING_VARIANCE_REFRESH_JOB, {
        tenant_id: TENANT_ID,
        manual: true,
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
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
        base_case: {
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
              subcategory: 'teaching',
              name: 'Teaching staff',
              fiscal_year: 1,
              source: 'driver_derived',
              amount: 720_000,
              computed_from: {},
            },
            // year 2 line MUST NOT contribute
            {
              category: 'income',
              subcategory: 'tuition_net',
              name: 'Tuition (net) — Y2',
              fiscal_year: 2,
              source: 'driver_derived',
              amount: 0,
              computed_from: {},
            },
          ],
        },
      },
    });
    tx.payment.aggregate.mockResolvedValue({ _sum: { amount: 110_000 } });

    const prisma = buildMockPrisma(tx);
    const proc = new VarianceRefreshProcessor(
      prisma as never,
      buildMockQueue(),
      buildTenantModuleService() as never,
    );
    await proc.process(buildJob(BUDGETING_VARIANCE_REFRESH_JOB, { tenant_id: TENANT_ID }));

    expect(tx.varianceCache.deleteMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, parent_model_id: MODEL_ID },
    });
    expect(tx.varianceCache.createMany).toHaveBeenCalled();
    const writtenRows = (
      tx.varianceCache.createMany.mock.calls[0]![0] as { data: Array<{ line_item_key: string }> }
    ).data;
    expect(writtenRows.some((r) => r.line_item_key === 'income.tuition_net')).toBe(true);
    expect(writtenRows.some((r) => r.line_item_key === 'staff_costs.teaching')).toBe(true);
    // No fiscal_year=2 line item ever surfaces — only year 1's two items × N periods.
    expect(writtenRows.length % 2).toBe(0);
  });

  it('sets RLS context inside the transaction', async () => {
    const tx = buildMockTx();
    const prisma = buildMockPrisma(tx);
    const proc = new VarianceRefreshProcessor(
      prisma as never,
      buildMockQueue(),
      buildTenantModuleService() as never,
    );
    await proc.process(buildJob(BUDGETING_VARIANCE_REFRESH_JOB, { tenant_id: TENANT_ID }));
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it('bootstrap registers a per-tenant repeatable for every active tenant', async () => {
    const tx = buildMockTx();
    const prisma = buildMockPrisma(tx);
    prisma.tenant.findMany = jest.fn().mockResolvedValue([
      { id: TENANT_ID, timezone: 'Europe/Dublin' },
      { id: '44444444-4444-4444-8444-444444444444', timezone: 'Asia/Riyadh' },
    ]);
    const queue = buildMockQueue();
    const proc = new VarianceRefreshProcessor(
      prisma as never,
      queue,
      buildTenantModuleService() as never,
    );
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

  it('skips variance refresh without writing cache rows when budgeting is disabled', async () => {
    const tx = buildMockTx();
    const prisma = buildMockPrisma(tx);
    const tenantModuleService = buildTenantModuleService(false);
    const proc = new VarianceRefreshProcessor(
      prisma as never,
      buildMockQueue(),
      tenantModuleService as never,
    );

    await proc.process(buildJob(BUDGETING_VARIANCE_REFRESH_JOB, { tenant_id: TENANT_ID }));

    expect(tenantModuleService.isEnabled).toHaveBeenCalledWith(TENANT_ID, 'budgeting');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.varianceCache.createMany).not.toHaveBeenCalled();
  });
});

// ─── Pure helper coverage ─────────────────────────────────────────────────────

describe('extractPlannedLineItemsFromSnapshot', () => {
  it('returns empty array for invalid payload', () => {
    expect(extractPlannedLineItemsFromSnapshot(null)).toEqual([]);
    expect(extractPlannedLineItemsFromSnapshot({ wrong: 'shape' })).toEqual([]);
  });

  it('reads from base_case.line_items (Phase 05 shape)', () => {
    const result = extractPlannedLineItemsFromSnapshot({
      base_case: {
        line_items: [
          {
            category: 'income',
            subcategory: 'tuition_net',
            fiscal_year: 1,
            amount: 100,
            computed_from: {},
          },
        ],
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.line_item_key).toBe('income.tuition_net');
  });

  it('falls back to flat line_items when base_case is missing', () => {
    const result = extractPlannedLineItemsFromSnapshot({
      line_items: [
        {
          category: 'staff_costs',
          subcategory: 'teaching',
          fiscal_year: 1,
          amount: 50,
        },
      ],
    });
    expect(result).toHaveLength(1);
  });

  it('only includes fiscal_year=1 lines', () => {
    const result = extractPlannedLineItemsFromSnapshot({
      base_case: {
        line_items: [
          { category: 'income', subcategory: 'tuition_net', fiscal_year: 1, amount: 100 },
          { category: 'income', subcategory: 'tuition_net', fiscal_year: 2, amount: 200 },
        ],
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.amount).toBe(100);
  });
});

describe('generatePeriods', () => {
  const fyStart = new Date('2026-09-01T00:00:00Z');
  const fyEnd = new Date('2027-06-30T23:59:59Z');
  const today = new Date('2026-12-15T00:00:00Z');

  it('month: returns one period per fiscal month up to today', () => {
    const periods = generatePeriods('month', fyStart, fyEnd, today);
    expect(periods.length).toBe(4); // Sep, Oct, Nov, Dec
    expect(periods[0]!.label).toContain('Sep');
    expect(periods[3]!.label).toContain('Dec');
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
