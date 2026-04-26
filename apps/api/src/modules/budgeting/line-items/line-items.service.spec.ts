import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';
import { ScenariosService } from '../scenarios/scenarios.service';

import { LineItemsService } from './line-items.service';

// ─── createRlsClient mock ────────────────────────────────────────────────

const mockRlsTx: Record<string, unknown> = {};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── runEngine stub ──────────────────────────────────────────────────────
//
// We don't exercise the engine maths here — just that the service
// matches its result back to a line by (category, subcategory,
// fiscal_year). Engine purity is covered by the engine spec.

const runEngineMock = jest.fn();

jest.mock('@school/shared/budgeting', () => {
  const actual = jest.requireActual<Record<string, unknown>>('@school/shared/budgeting');
  return {
    ...actual,
    runEngine: (...args: unknown[]) => runEngineMock(...args),
  };
});

// ─── Constants ────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const MODEL_ID = '33333333-3333-4333-8333-333333333333';
const SCENARIO_ID = '44444444-4444-4444-8444-444444444444';
const LINE_ID = '55555555-5555-4555-8555-555555555555';
const EVENT_BUDGET_ID = '66666666-6666-4666-8666-666666666666';
const OTHER_TENANT_LINE_ID = '77777777-7777-4777-8777-777777777777';

// ─── Mock prisma factory ──────────────────────────────────────────────────

function buildMockPrisma() {
  const mock = {
    financialModel: {
      findFirst: jest.fn(),
    },
    scenario: {
      findFirst: jest.fn(),
    },
    eventBudget: {
      findFirst: jest.fn(),
    },
    financialModelLineItem: {
      findFirst: jest.fn(),
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
      enrollment_growth_pct_by_year_group: {},
      fee_uplift_pct_by_year_group: {},
      staff_headcount_delta_by_department: {},
      salary_uplift_pct: 0,
      discount_capture_pct: 0,
      scholarship_capture_pct: 0,
      utilities_inflation_pct: 0,
      materials_inflation_pct: 0,
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
      currency_code: 'USD',
      total_active_students: 0,
      total_active_households: 0,
      students_by_year_group: [],
      fees_by_year_group: [],
      staff_by_department: [],
    },
    horizon_years: 1,
    ...overrides,
  };
}

function buildLineItem(overrides: Record<string, unknown> = {}) {
  return {
    id: LINE_ID,
    tenant_id: TENANT_ID,
    parent_model_id: MODEL_ID,
    scenario_id: null,
    category: 'operations',
    subcategory: 'maintenance',
    name: 'Roof repairs',
    fiscal_year: 1,
    source: 'custom',
    amount: 12000,
    is_locked: false,
    notes: null,
    references_event_budget_id: null,
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────

describe('LineItemsService', () => {
  let service: LineItemsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    runEngineMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ScenariosService,
        LineItemsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<LineItemsService>(LineItemsService);
    jest.clearAllMocks();
  });

  // ─── createCustom ──────────────────────────────────────────────────────

  describe('createCustom', () => {
    it('inserts a row with source=custom and is_locked=false', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      const created = buildLineItem({ id: 'created' });
      mockPrisma.financialModelLineItem.create.mockResolvedValue(created);

      const result = await service.createCustom(TENANT_ID, MODEL_ID, USER_ID, {
        category: 'operations',
        subcategory: 'maintenance',
        name: 'Roof repairs',
        fiscal_year: 1,
        amount: 12000,
      });

      expect(result.source).toBe('custom');
      expect(result.is_locked).toBe(false);
      const args = mockPrisma.financialModelLineItem.create.mock.calls[0]![0];
      expect(args.data.source).toBe('custom');
      expect(args.data.is_locked).toBe(false);
      expect(args.data.scenario_id).toBeNull();
    });

    it('throws NotFoundException when parent model is missing', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(null);
      await expect(
        service.createCustom(TENANT_ID, MODEL_ID, USER_ID, {
          category: 'operations',
          subcategory: 'maintenance',
          name: 'x',
          fiscal_year: 1,
          amount: 1,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws NotFoundException when scenario_id doesn't belong to the model", async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.scenario.findFirst.mockResolvedValue(null);
      await expect(
        service.createCustom(TENANT_ID, MODEL_ID, USER_ID, {
          category: 'operations',
          subcategory: 'maintenance',
          name: 'x',
          fiscal_year: 1,
          amount: 1,
          scenario_id: SCENARIO_ID,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws BadRequestException(FISCAL_YEAR_OUT_OF_RANGE) when fiscal_year > horizon_years', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel({ horizon_years: 1 }));
      await expect(
        service.createCustom(TENANT_ID, MODEL_ID, USER_ID, {
          category: 'operations',
          subcategory: 'maintenance',
          name: 'x',
          fiscal_year: 2,
          amount: 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException(EVENT_BUDGET_NOT_FOUND) when references_event_budget_id is invalid', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.eventBudget.findFirst.mockResolvedValue(null);
      await expect(
        service.createCustom(TENANT_ID, MODEL_ID, USER_ID, {
          category: 'operations',
          subcategory: 'maintenance',
          name: 'x',
          fiscal_year: 1,
          amount: 1,
          references_event_budget_id: EVENT_BUDGET_ID,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ─── update ────────────────────────────────────────────────────────────

  describe('update', () => {
    it('flips a driver_derived row to override when amount is set', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findFirst.mockResolvedValue(
        buildLineItem({ source: 'driver_derived' }),
      );
      mockPrisma.financialModelLineItem.update.mockResolvedValue(
        buildLineItem({ source: 'override', amount: 99 }),
      );

      const result = await service.update(TENANT_ID, MODEL_ID, LINE_ID, USER_ID, {
        amount: 99,
      });

      expect(result.source).toBe('override');
      const updateArgs = mockPrisma.financialModelLineItem.update.mock.calls[0]![0];
      expect(updateArgs.data.source).toBe('override');
      expect(updateArgs.data.amount).toBe(99);
    });

    it('keeps source=override when amount is set on an existing override', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findFirst.mockResolvedValue(
        buildLineItem({ source: 'override' }),
      );
      mockPrisma.financialModelLineItem.update.mockResolvedValue(
        buildLineItem({ source: 'override', amount: 200 }),
      );

      await service.update(TENANT_ID, MODEL_ID, LINE_ID, USER_ID, { amount: 200 });

      const updateArgs = mockPrisma.financialModelLineItem.update.mock.calls[0]![0];
      expect(updateArgs.data.source).toBeUndefined(); // not flipped
    });

    it('keeps source=custom when amount is set on a custom row', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findFirst.mockResolvedValue(
        buildLineItem({ source: 'custom' }),
      );
      mockPrisma.financialModelLineItem.update.mockResolvedValue(
        buildLineItem({ source: 'custom', amount: 200 }),
      );

      await service.update(TENANT_ID, MODEL_ID, LINE_ID, USER_ID, { amount: 200 });

      const updateArgs = mockPrisma.financialModelLineItem.update.mock.calls[0]![0];
      expect(updateArgs.data.source).toBeUndefined();
    });

    it('locks a driver_derived row without flipping its source', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findFirst.mockResolvedValue(
        buildLineItem({ source: 'driver_derived', is_locked: false }),
      );
      mockPrisma.financialModelLineItem.update.mockResolvedValue(
        buildLineItem({ source: 'driver_derived', is_locked: true }),
      );

      const result = await service.update(TENANT_ID, MODEL_ID, LINE_ID, USER_ID, {
        is_locked: true,
      });

      expect(result.source).toBe('driver_derived');
      expect(result.is_locked).toBe(true);
      const updateArgs = mockPrisma.financialModelLineItem.update.mock.calls[0]![0];
      expect(updateArgs.data.source).toBeUndefined();
      expect(updateArgs.data.is_locked).toBe(true);
    });

    it('clears notes when notes is set to null', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findFirst.mockResolvedValue(
        buildLineItem({ notes: 'old note' }),
      );
      mockPrisma.financialModelLineItem.update.mockResolvedValue(buildLineItem({ notes: null }));

      await service.update(TENANT_ID, MODEL_ID, LINE_ID, USER_ID, { notes: null });

      const updateArgs = mockPrisma.financialModelLineItem.update.mock.calls[0]![0];
      expect(updateArgs.data.notes).toBeNull();
    });

    it("throws NotFoundException when the line doesn't belong to the parent model", async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findFirst.mockResolvedValue(null);
      await expect(
        service.update(TENANT_ID, MODEL_ID, OTHER_TENANT_LINE_ID, USER_ID, { amount: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes a custom row', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findFirst.mockResolvedValue(
        buildLineItem({ source: 'custom' }),
      );
      mockPrisma.financialModelLineItem.delete.mockResolvedValue(buildLineItem());

      const result = await service.delete(TENANT_ID, MODEL_ID, LINE_ID, USER_ID);
      expect(result.id).toBe(LINE_ID);
      expect(mockPrisma.financialModelLineItem.delete).toHaveBeenCalledTimes(1);
    });

    it('deletes an override row', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findFirst.mockResolvedValue(
        buildLineItem({ source: 'override' }),
      );
      mockPrisma.financialModelLineItem.delete.mockResolvedValue(buildLineItem());

      const result = await service.delete(TENANT_ID, MODEL_ID, LINE_ID, USER_ID);
      expect(result.id).toBe(LINE_ID);
    });

    it('throws ForbiddenException(CANNOT_DELETE_DERIVED_LINE) for driver_derived', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findFirst.mockResolvedValue(
        buildLineItem({ source: 'driver_derived' }),
      );
      await expect(service.delete(TENANT_ID, MODEL_ID, LINE_ID, USER_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockPrisma.financialModelLineItem.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when line missing', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findFirst.mockResolvedValue(null);
      await expect(service.delete(TENANT_ID, MODEL_ID, LINE_ID, USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── resetToDerived ────────────────────────────────────────────────────

  describe('resetToDerived', () => {
    it('recomputes the matching line and flips source back to driver_derived (preserving is_locked)', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findFirst.mockResolvedValue(
        buildLineItem({ source: 'override', is_locked: true, amount: 9999 }),
      );
      runEngineMock.mockReturnValue({
        line_items: [
          {
            category: 'operations',
            subcategory: 'maintenance',
            name: 'Maintenance',
            fiscal_year: 1,
            amount: 1234,
          },
        ],
        totals_by_year: [],
        per_pupil_unit_economics: [],
        warnings: [],
      });
      mockPrisma.financialModelLineItem.update.mockResolvedValue(
        buildLineItem({ source: 'driver_derived', amount: 1234, is_locked: true }),
      );

      const result = await service.resetToDerived(TENANT_ID, MODEL_ID, LINE_ID, USER_ID);

      expect(result.source).toBe('driver_derived');
      expect(result.amount).toBe(1234);
      expect(result.is_locked).toBe(true);
      const updateArgs = mockPrisma.financialModelLineItem.update.mock.calls[0]![0];
      expect(updateArgs.data.source).toBe('driver_derived');
      expect(updateArgs.data.amount).toBe(1234);
      expect(updateArgs.data.is_locked).toBeUndefined(); // not touched
    });

    it('throws BadRequestException(NOT_AN_OVERRIDE) for non-override rows', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findFirst.mockResolvedValue(
        buildLineItem({ source: 'custom' }),
      );

      await expect(
        service.resetToDerived(TENANT_ID, MODEL_ID, LINE_ID, USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequestException(NO_DERIVED_VALUE_AVAILABLE) when engine output has no matching key', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findFirst.mockResolvedValue(
        buildLineItem({ source: 'override' }),
      );
      runEngineMock.mockReturnValue({
        line_items: [], // engine produces nothing for this (cat, sub, year)
        totals_by_year: [],
        per_pupil_unit_economics: [],
        warnings: [],
      });

      await expect(
        service.resetToDerived(TENANT_ID, MODEL_ID, LINE_ID, USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('uses the merged scenario drivers when the line has scenario_id set', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(buildParentModel());
      mockPrisma.financialModelLineItem.findFirst.mockResolvedValue(
        buildLineItem({ source: 'override', scenario_id: SCENARIO_ID }),
      );
      mockPrisma.scenario.findFirst.mockResolvedValue({
        id: SCENARIO_ID,
        tenant_id: TENANT_ID,
        parent_model_id: MODEL_ID,
        name: 'Cautious',
        position: 0,
        driver_overrides: { salary_uplift_pct: 1.5 },
        notes: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      runEngineMock.mockReturnValue({
        line_items: [
          {
            category: 'operations',
            subcategory: 'maintenance',
            name: 'Maintenance',
            fiscal_year: 1,
            amount: 5000,
          },
        ],
        totals_by_year: [],
        per_pupil_unit_economics: [],
        warnings: [],
      });
      mockPrisma.financialModelLineItem.update.mockResolvedValue(
        buildLineItem({ source: 'driver_derived', amount: 5000, scenario_id: SCENARIO_ID }),
      );

      const result = await service.resetToDerived(TENANT_ID, MODEL_ID, LINE_ID, USER_ID);

      expect(result.amount).toBe(5000);
      // Engine should have been invoked with the merged drivers — the
      // overrides value (1.5) flows through `mergeDriverOverrides`.
      expect(runEngineMock).toHaveBeenCalledTimes(1);
      const engineCall = runEngineMock.mock.calls[0]![0] as {
        drivers: { salary_uplift_pct: number };
      };
      expect(engineCall.drivers.salary_uplift_pct).toBe(1.5);
    });
  });
});
