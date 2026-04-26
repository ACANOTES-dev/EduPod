import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { ScenariosService } from './scenarios.service';

// ─── createRlsClient mock ────────────────────────────────────────────────

const mockRlsTx: Record<string, unknown> = {};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Constants ────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const MODEL_ID = '33333333-3333-4333-8333-333333333333';
const SCENARIO_A = '44444444-4444-4444-8444-444444444444';
const SCENARIO_B = '55555555-5555-4555-8555-555555555555';
const YG_A = '66666666-6666-4666-8666-666666666666';

// ─── Mock prisma factory ──────────────────────────────────────────────────

function buildMockPrisma() {
  const mock = {
    financialModel: {
      findFirst: jest.fn(),
    },
    scenario: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  Object.assign(mockRlsTx, mock);
  return mock;
}

// ─── Builders ─────────────────────────────────────────────────────────────

function buildParentModel(overrides: Record<string, unknown> = {}) {
  return {
    id: MODEL_ID,
    tenant_id: TENANT_ID,
    drivers: {
      enrollment_growth_pct_by_year_group: { [YG_A]: 3 },
      fee_uplift_pct_by_year_group: { [YG_A]: 0 },
      staff_headcount_delta_by_department: {},
      salary_uplift_pct: 3,
      discount_capture_pct: 4,
      scholarship_capture_pct: 2,
      utilities_inflation_pct: 4,
      materials_inflation_pct: 3,
      capex_items: [],
      donations_forecast: 0,
      grants_forecast: 0,
      custom: {},
    },
    source_snapshot_json: {
      captured_at: '2026-04-26T00:00:00.000Z',
      tenant_id: TENANT_ID,
      fiscal_year_start: '2026-09-01',
      fiscal_year_end: '2027-09-01',
      currency_code: 'EUR',
      total_active_students: 100,
      total_active_households: 80,
      students_by_year_group: [
        { year_group_id: YG_A, year_group_name: 'Year 7', active_count: 100 },
      ],
      fees_by_year_group: [],
      staff_by_department: [],
    },
    horizon_years: 1,
    ...overrides,
  };
}

function buildScenarioRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SCENARIO_A,
    tenant_id: TENANT_ID,
    parent_model_id: MODEL_ID,
    name: 'Cautious',
    position: 0,
    driver_overrides: { salary_uplift_pct: 1.5 },
    notes: null,
    created_at: new Date('2026-04-26T00:00:00.000Z'),
    updated_at: new Date('2026-04-26T00:00:00.000Z'),
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────

describe('ScenariosService', () => {
  let service: ScenariosService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ScenariosService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ScenariosService>(ScenariosService);
    jest.clearAllMocks();
  });

  // ─── create — cap + auto-position ──────────────────────────────────────

  describe('create', () => {
    it('rejects when 3 alternative scenarios already exist with SCENARIO_CAP_REACHED', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.scenario.findMany.mockResolvedValue([
        { ...buildScenarioRow({ position: 0 }) },
        { ...buildScenarioRow({ id: SCENARIO_B, position: 1 }) },
        { ...buildScenarioRow({ id: '77777777-7777-4777-8777-777777777777', position: 2 }) },
      ]);

      await expect(
        service.create(TENANT_ID, MODEL_ID, USER_ID, {
          name: 'Stretch',
          driver_overrides: { salary_uplift_pct: 5 },
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('auto-assigns the next free position when none is supplied', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.scenario.findMany.mockResolvedValue([
        { ...buildScenarioRow({ position: 0 }) },
        // position 1 is taken; auto-assign should give 2.
        { ...buildScenarioRow({ id: SCENARIO_B, position: 1 }) },
      ]);
      const created = buildScenarioRow({
        id: '88888888-8888-4888-8888-888888888888',
        position: 2,
        name: 'Stretch',
      });
      mockPrisma.scenario.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, MODEL_ID, USER_ID, {
        name: 'Stretch',
        driver_overrides: { salary_uplift_pct: 5 },
      });

      const createArgs = mockPrisma.scenario.create.mock.calls[0]![0];
      expect(createArgs.data.position).toBe(2);
      expect(result.scenario.position).toBe(2);
    });

    it('throws NotFoundException when parent model does not belong to tenant', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(null);
      await expect(
        service.create(TENANT_ID, MODEL_ID, USER_ID, {
          name: 'x',
          driver_overrides: {},
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── findOne — engine merge + warnings ─────────────────────────────────

  describe('findOne', () => {
    it('returns merged drivers + computed engine output for the scenario', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.scenario.findFirst.mockResolvedValue(
        buildScenarioRow({ driver_overrides: { salary_uplift_pct: 6 } }),
      );

      const result = await service.findOne(TENANT_ID, MODEL_ID, SCENARIO_A);
      expect(result.scenario.id).toBe(SCENARIO_A);
      expect(result.computed.drivers.salary_uplift_pct).toBe(6);
      expect(result.computed.totals_by_year).toHaveLength(1);
      // No fee structure → engine emits NO_FEE_STRUCTURE warning for YG_A.
      expect(result.computed.warnings.some((w) => w.code === 'NO_FEE_STRUCTURE')).toBe(true);
    });

    it('throws NotFoundException when the scenario does not belong to the parent model', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.scenario.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, MODEL_ID, SCENARIO_A)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── update — position swap + recompute ────────────────────────────────

  describe('update', () => {
    it('swaps positions when the requested slot is taken by a sibling', async () => {
      const a = buildScenarioRow({ position: 0 });
      const b = buildScenarioRow({ id: SCENARIO_B, position: 1, name: 'Stretch' });
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.scenario.findFirst
        // Initial fetch of the scenario being updated:
        .mockResolvedValueOnce(a)
        // Inside the transaction — conflicting sibling lookup:
        .mockResolvedValueOnce(b);
      mockPrisma.scenario.update
        // Move the conflicting sibling to a temp position:
        .mockResolvedValueOnce({ ...b, position: 100 })
        // Move the target scenario to its new position:
        .mockResolvedValueOnce({ ...a, position: 1 })
        // Move the conflicting sibling back to A's old position:
        .mockResolvedValueOnce({ ...b, position: 0 })
        // Final update returning the row:
        .mockResolvedValueOnce({ ...a, position: 1 });

      const result = await service.update(TENANT_ID, MODEL_ID, SCENARIO_A, USER_ID, {
        position: 1,
      });

      expect(mockPrisma.scenario.update).toHaveBeenCalledTimes(4);
      // First call: temp shift on the conflicting sibling.
      const firstUpdate = mockPrisma.scenario.update.mock.calls[0]![0];
      expect(firstUpdate.where.id).toBe(SCENARIO_B);
      expect(firstUpdate.data.position).toBe(100);
      // Second: target scenario takes the requested position.
      const secondUpdate = mockPrisma.scenario.update.mock.calls[1]![0];
      expect(secondUpdate.where.id).toBe(SCENARIO_A);
      expect(secondUpdate.data.position).toBe(1);
      // Third: sibling swaps in.
      const thirdUpdate = mockPrisma.scenario.update.mock.calls[2]![0];
      expect(thirdUpdate.where.id).toBe(SCENARIO_B);
      expect(thirdUpdate.data.position).toBe(0);

      expect(result.scenario.position).toBe(1);
    });

    it('recomputes engine output when driver_overrides changes', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.scenario.findFirst.mockResolvedValue(buildScenarioRow());
      mockPrisma.scenario.update.mockResolvedValue(
        buildScenarioRow({ driver_overrides: { salary_uplift_pct: 9 } }),
      );

      const result = await service.update(TENANT_ID, MODEL_ID, SCENARIO_A, USER_ID, {
        driver_overrides: { salary_uplift_pct: 9 },
      });

      expect(result.computed.drivers.salary_uplift_pct).toBe(9);
    });

    it('throws NotFoundException when scenario id does not match the parent model', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.scenario.findFirst.mockResolvedValue(null);
      await expect(
        service.update(TENANT_ID, MODEL_ID, SCENARIO_A, USER_ID, { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── delete ─────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes the scenario via RLS transaction', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.scenario.findFirst.mockResolvedValue({ id: SCENARIO_A });
      mockPrisma.scenario.delete.mockResolvedValue({ id: SCENARIO_A });

      const result = await service.delete(TENANT_ID, MODEL_ID, SCENARIO_A, USER_ID);
      expect(mockPrisma.scenario.delete).toHaveBeenCalledTimes(1);
      expect(result.id).toBe(SCENARIO_A);
    });

    it('throws NotFoundException when target id is missing', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.scenario.findFirst.mockResolvedValue(null);
      await expect(service.delete(TENANT_ID, MODEL_ID, SCENARIO_A, USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
