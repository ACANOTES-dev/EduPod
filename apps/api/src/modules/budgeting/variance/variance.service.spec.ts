import { getQueueToken } from '@nestjs/bullmq';
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { VarianceService } from './variance.service';

// ─── createRlsClient mock ────────────────────────────────────────────────

const mockRlsTx: Record<string, unknown> = {};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Constants ───────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const MODEL_ID = '33333333-3333-4333-8333-333333333333';
const SNAPSHOT_ID = '44444444-4444-4444-8444-444444444444';

// ─── Mock prisma factory ──────────────────────────────────────────────────

function buildMockPrisma() {
  const mock = {
    financialModel: {
      findFirst: jest.fn(),
    },
    varianceCache: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  Object.assign(mockRlsTx, mock);
  return mock;
}

function buildMockQueue() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'job-99' }),
  };
}

function buildVarianceCacheRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cache-1',
    snapshot_id: SNAPSHOT_ID,
    period_type: 'month',
    period_label: 'Sep 2026',
    line_item_key: 'income.tuition_net',
    planned: 100,
    actual: 120,
    variance: 20,
    variance_pct: 20,
    drivers_json: null,
    refreshed_at: new Date('2026-09-30T00:00:00.000Z'),
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────

describe('VarianceService', () => {
  let service: VarianceService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockQueue: ReturnType<typeof buildMockQueue>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockQueue = buildMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        VarianceService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('budgeting'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<VarianceService>(VarianceService);
    jest.clearAllMocks();
  });

  // ─── getVariance ──────────────────────────────────────────────────────

  describe('getVariance', () => {
    it('returns rows + meta with snapshot_id and refreshed_at', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue({
        id: MODEL_ID,
        current_snapshot_id: SNAPSHOT_ID,
        status: 'published',
      });
      mockPrisma.varianceCache.findMany.mockResolvedValue([
        buildVarianceCacheRow(),
        buildVarianceCacheRow({
          line_item_key: 'staff_costs.teaching',
          planned: 200,
          actual: 180,
          variance: -20,
          variance_pct: -10,
        }),
      ]);

      const result = await service.getVariance(TENANT_ID, MODEL_ID, 'month');
      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.category).toBe('income');
      expect(result.data[0]!.subcategory).toBe('tuition_net');
      expect(result.meta.snapshot_id).toBe(SNAPSHOT_ID);
      expect(result.meta.is_empty).toBe(false);
      expect(result.meta.refreshed_at).toBe(new Date('2026-09-30T00:00:00.000Z').toISOString());
    });

    it('returns empty data + is_empty=true when cache has no rows', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue({
        id: MODEL_ID,
        current_snapshot_id: null,
        status: 'draft',
      });
      mockPrisma.varianceCache.findMany.mockResolvedValue([]);

      const result = await service.getVariance(TENANT_ID, MODEL_ID, 'month');
      expect(result.data).toEqual([]);
      expect(result.meta.is_empty).toBe(true);
      expect(result.meta.snapshot_id).toBeNull();
      expect(result.meta.refreshed_at).toBeNull();
    });

    it('throws NotFoundException(FINANCIAL_MODEL_NOT_FOUND) when model is missing', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(null);
      await expect(service.getVariance(TENANT_ID, MODEL_ID, 'month')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('forwards period_label into the where clause when supplied', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue({
        id: MODEL_ID,
        current_snapshot_id: null,
        status: 'draft',
      });
      mockPrisma.varianceCache.findMany.mockResolvedValue([]);

      await service.getVariance(TENANT_ID, MODEL_ID, 'month', 'Sep 2026');

      const args = mockPrisma.varianceCache.findMany.mock.calls[0]![0];
      expect(args.where.period_label).toBe('Sep 2026');
    });
  });

  // ─── enqueueRefresh ──────────────────────────────────────────────────

  describe('enqueueRefresh', () => {
    it('enqueues budgeting:variance-refresh job with the right payload', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue({ id: MODEL_ID });

      const result = await service.enqueueRefresh(TENANT_ID, MODEL_ID);

      expect(result).toEqual({ run_id: 'job-99', status: 'queued' });
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      const [jobName, payload] = mockQueue.add.mock.calls[0]!;
      expect(jobName).toBe('budgeting:variance-refresh');
      expect(payload).toEqual({
        tenant_id: TENANT_ID,
        parent_model_id: MODEL_ID,
        manual: true,
      });
    });

    it('throws NotFoundException when model is missing', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(null);
      await expect(service.enqueueRefresh(TENANT_ID, MODEL_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── upsertManualActual ──────────────────────────────────────────────

  describe('upsertManualActual', () => {
    it('creates a row with planned=0, variance=actual, variance_pct=0 when no existing row', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue({
        id: MODEL_ID,
        current_snapshot_id: SNAPSHOT_ID,
      });
      mockPrisma.varianceCache.findFirst.mockResolvedValue(null);
      mockPrisma.varianceCache.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          id: 'cache-new',
          snapshot_id: args.data.snapshot_id,
          period_type: args.data.period_type,
          period_label: args.data.period_label,
          line_item_key: args.data.line_item_key,
          planned: args.data.planned,
          actual: args.data.actual,
          variance: args.data.variance,
          variance_pct: args.data.variance_pct,
          drivers_json: args.data.drivers_json,
          refreshed_at: new Date(),
        }),
      );

      const result = await service.upsertManualActual(TENANT_ID, MODEL_ID, USER_ID, {
        period_type: 'month',
        period_label: 'Sep 2026',
        line_item_key: 'operations.maintenance',
        amount: 1250,
      });

      expect(result.planned).toBe(0);
      expect(result.actual).toBe(1250);
      expect(result.variance).toBe(1250);
      expect(result.variance_pct).toBe(0);
      const createArgs = mockPrisma.varianceCache.create.mock.calls[0]![0];
      const drivers = createArgs.data.drivers_json as { manual: boolean };
      expect(drivers.manual).toBe(true);
    });

    it('preserves the existing planned value and recomputes variance + pct on update', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue({
        id: MODEL_ID,
        current_snapshot_id: SNAPSHOT_ID,
      });
      mockPrisma.varianceCache.findFirst.mockResolvedValue(
        buildVarianceCacheRow({
          id: 'cache-existing',
          line_item_key: 'operations.maintenance',
          planned: 1000,
          actual: 0,
          variance: -1000,
          variance_pct: -100,
        }),
      );
      mockPrisma.varianceCache.update.mockImplementation(
        async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
          id: args.where.id,
          snapshot_id: SNAPSHOT_ID,
          period_type: 'month',
          period_label: 'Sep 2026',
          line_item_key: 'operations.maintenance',
          planned: 1000,
          actual: args.data.actual,
          variance: args.data.variance,
          variance_pct: args.data.variance_pct,
          drivers_json: args.data.drivers_json,
          refreshed_at: new Date(),
        }),
      );

      const result = await service.upsertManualActual(TENANT_ID, MODEL_ID, USER_ID, {
        period_type: 'month',
        period_label: 'Sep 2026',
        line_item_key: 'operations.maintenance',
        amount: 1200,
      });

      expect(result.planned).toBe(1000);
      expect(result.actual).toBe(1200);
      expect(result.variance).toBe(200);
      expect(result.variance_pct).toBe(20);
      const drivers = mockPrisma.varianceCache.update.mock.calls[0]![0].data.drivers_json as {
        manual: boolean;
      };
      expect(drivers.manual).toBe(true);
    });

    it('avoids division by zero when planned=0', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue({
        id: MODEL_ID,
        current_snapshot_id: null,
      });
      mockPrisma.varianceCache.findFirst.mockResolvedValue(null);
      mockPrisma.varianceCache.create.mockImplementation(
        async (args: { data: Record<string, unknown> }) => ({
          id: 'cache-new',
          snapshot_id: null,
          period_type: 'month',
          period_label: 'Sep 2026',
          line_item_key: 'operations.maintenance',
          planned: args.data.planned,
          actual: args.data.actual,
          variance: args.data.variance,
          variance_pct: args.data.variance_pct,
          drivers_json: args.data.drivers_json,
          refreshed_at: new Date(),
        }),
      );

      const result = await service.upsertManualActual(TENANT_ID, MODEL_ID, USER_ID, {
        period_type: 'month',
        period_label: 'Sep 2026',
        line_item_key: 'operations.maintenance',
        amount: 50,
      });

      expect(result.variance_pct).toBe(0);
    });

    it('throws NotFoundException when model is missing', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(null);
      await expect(
        service.upsertManualActual(TENANT_ID, MODEL_ID, USER_ID, {
          period_type: 'month',
          period_label: 'Sep 2026',
          line_item_key: 'operations.maintenance',
          amount: 1,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
