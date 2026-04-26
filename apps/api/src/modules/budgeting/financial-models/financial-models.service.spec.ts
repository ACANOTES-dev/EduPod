import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { FinanceReadFacade } from '../../finance/finance-read.facade';
import { HouseholdReadFacade } from '../../households/household-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { StaffProfileReadFacade } from '../../staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../../students/student-read.facade';
import { TenantReadFacade } from '../../tenants/tenant-read.facade';

import { FinancialModelsService } from './financial-models.service';

// ─── createRlsClient mock — passes through to the underlying mock prisma ──

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
const YG_A = '44444444-4444-4444-8444-444444444444';

// ─── Mock prisma factory ──────────────────────────────────────────────────

function buildMockPrisma() {
  const mock = {
    financialModel: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    financialModelLineItem: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    scenario: {
      findMany: jest.fn(),
    },
  };
  // The transaction tx in createRlsClient mock is a separate object.
  // Wire the same handlers to mockRlsTx so the service finds them under
  // either path.
  Object.assign(mockRlsTx, mock);
  return mock;
}

// ─── Builders ─────────────────────────────────────────────────────────────

function buildModelRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MODEL_ID,
    tenant_id: TENANT_ID,
    name: 'FY 2026/27',
    description: null,
    fiscal_year_start: new Date('2026-09-01'),
    fiscal_year_end: new Date('2027-09-01'),
    horizon_years: 1,
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
    status: 'draft' as const,
    current_snapshot_id: null,
    created_by: USER_ID,
    created_at: new Date('2026-04-26T00:00:00.000Z'),
    updated_at: new Date('2026-04-26T00:00:00.000Z'),
    archived_at: null,
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────

describe('FinancialModelsService', () => {
  let service: FinancialModelsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let studentReadFacade: { count: jest.Mock; countByYearGroup: jest.Mock };
  let staffProfileReadFacade: { summariseByDepartmentForBudgeting: jest.Mock };
  let householdReadFacade: { countActive: jest.Mock };
  let academicReadFacade: { findAllYearGroups: jest.Mock };
  let financeReadFacade: { findActiveFeeStructures: jest.Mock };
  let tenantReadFacade: { findById: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    studentReadFacade = {
      count: jest.fn().mockResolvedValue(100),
      countByYearGroup: jest.fn().mockResolvedValue(new Map([[YG_A, 100]])),
    };
    staffProfileReadFacade = {
      summariseByDepartmentForBudgeting: jest.fn().mockResolvedValue([]),
    };
    householdReadFacade = {
      countActive: jest.fn().mockResolvedValue(80),
    };
    academicReadFacade = {
      findAllYearGroups: jest.fn().mockResolvedValue([{ id: YG_A, name: 'Year 7' }]),
    };
    financeReadFacade = {
      findActiveFeeStructures: jest.fn().mockResolvedValue([]),
    };
    tenantReadFacade = {
      findById: jest.fn().mockResolvedValue({
        id: TENANT_ID,
        name: 'NHQS',
        slug: 'nhqs',
        currency_code: 'EUR',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        FinancialModelsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StudentReadFacade, useValue: studentReadFacade },
        { provide: StaffProfileReadFacade, useValue: staffProfileReadFacade },
        { provide: HouseholdReadFacade, useValue: householdReadFacade },
        { provide: AcademicReadFacade, useValue: academicReadFacade },
        { provide: FinanceReadFacade, useValue: financeReadFacade },
        { provide: TenantReadFacade, useValue: tenantReadFacade },
      ],
    }).compile();

    service = module.get<FinancialModelsService>(FinancialModelsService);
    jest.clearAllMocks();
  });

  // ─── create ─────────────────────────────────────────────────────────────

  describe('create', () => {
    it('builds default drivers when dto.drivers is omitted, using year groups + departments from facades', async () => {
      const created = buildModelRow();
      mockPrisma.financialModel.create.mockResolvedValue(created);
      mockPrisma.financialModelLineItem.findMany.mockResolvedValue([]);

      const result = await service.create(TENANT_ID, USER_ID, {
        name: 'FY 2026/27',
        fiscal_year_start: '2026-09-01',
        horizon_years: 1,
      });

      // Source snapshot facade calls fired with tenantId
      expect(studentReadFacade.countByYearGroup).toHaveBeenCalledWith(TENANT_ID, 'active');
      expect(staffProfileReadFacade.summariseByDepartmentForBudgeting).toHaveBeenCalledWith(
        TENANT_ID,
      );
      expect(financeReadFacade.findActiveFeeStructures).toHaveBeenCalledWith(TENANT_ID);
      expect(householdReadFacade.countActive).toHaveBeenCalledWith(TENANT_ID);
      expect(academicReadFacade.findAllYearGroups).toHaveBeenCalledWith(TENANT_ID);

      // Model created with default drivers — one per yg + zero capex
      expect(mockPrisma.financialModel.create).toHaveBeenCalledTimes(1);
      const createArgs = mockPrisma.financialModel.create.mock.calls[0]![0];
      expect(createArgs.data.drivers.enrollment_growth_pct_by_year_group[YG_A]).toBe(3);
      expect(createArgs.data.drivers.salary_uplift_pct).toBe(3);
      expect(createArgs.data.drivers.capex_items).toEqual([]);
      expect(createArgs.data.status).toBe('draft');
      expect(createArgs.data.created_by).toBe(USER_ID);

      // Engine warnings exposed
      expect(result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'NO_FEE_STRUCTURE' }),
          expect.objectContaining({ code: 'NO_PRIOR_ACTUALS' }),
        ]),
      );
      expect(result.model.status).toBe('draft');
    });

    it('uses supplied drivers verbatim when dto.drivers is provided (after Zod validation)', async () => {
      const created = buildModelRow({
        drivers: {
          enrollment_growth_pct_by_year_group: { [YG_A]: 7 },
          fee_uplift_pct_by_year_group: { [YG_A]: 5 },
          staff_headcount_delta_by_department: {},
          salary_uplift_pct: 4,
          discount_capture_pct: 4,
          scholarship_capture_pct: 2,
          utilities_inflation_pct: 4,
          materials_inflation_pct: 3,
          capex_items: [],
          donations_forecast: 0,
          grants_forecast: 0,
          custom: {},
        },
      });
      mockPrisma.financialModel.create.mockResolvedValue(created);
      mockPrisma.financialModelLineItem.findMany.mockResolvedValue([]);

      await service.create(TENANT_ID, USER_ID, {
        name: 'High-growth',
        fiscal_year_start: '2026-09-01',
        horizon_years: 1,
        drivers: {
          enrollment_growth_pct_by_year_group: { [YG_A]: 7 },
          fee_uplift_pct_by_year_group: { [YG_A]: 5 },
          staff_headcount_delta_by_department: {},
          salary_uplift_pct: 4,
          discount_capture_pct: 4,
          scholarship_capture_pct: 2,
          utilities_inflation_pct: 4,
          materials_inflation_pct: 3,
          capex_items: [],
          donations_forecast: 0,
          grants_forecast: 0,
          custom: {},
        },
      });

      const createArgs = mockPrisma.financialModel.create.mock.calls[0]![0];
      expect(createArgs.data.drivers.enrollment_growth_pct_by_year_group[YG_A]).toBe(7);
      expect(createArgs.data.drivers.fee_uplift_pct_by_year_group[YG_A]).toBe(5);
    });
  });

  // ─── update ─────────────────────────────────────────────────────────────

  describe('update', () => {
    it('replaces only derived/unlocked/base-case rows when drivers change', async () => {
      const existing = buildModelRow();
      mockPrisma.financialModel.findFirst.mockResolvedValue(existing);
      mockPrisma.financialModel.update.mockResolvedValue(existing);
      mockPrisma.financialModelLineItem.findMany.mockResolvedValue([]);
      mockPrisma.scenario.findMany.mockResolvedValue([]);

      await service.update(TENANT_ID, MODEL_ID, USER_ID, {
        drivers: {
          enrollment_growth_pct_by_year_group: { [YG_A]: 6 },
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
      });

      expect(mockPrisma.financialModelLineItem.deleteMany).toHaveBeenCalledTimes(1);
      const deleteArgs = mockPrisma.financialModelLineItem.deleteMany.mock.calls[0]![0];
      expect(deleteArgs.where).toMatchObject({
        tenant_id: TENANT_ID,
        parent_model_id: MODEL_ID,
        scenario_id: null,
        source: 'driver_derived',
        is_locked: false,
      });
    });

    it('flips published model to draft on update', async () => {
      const published = buildModelRow({ status: 'published' });
      mockPrisma.financialModel.findFirst.mockResolvedValue(published);
      mockPrisma.financialModel.update.mockResolvedValue(buildModelRow({ status: 'draft' }));
      mockPrisma.financialModelLineItem.findMany.mockResolvedValue([]);
      mockPrisma.scenario.findMany.mockResolvedValue([]);

      await service.update(TENANT_ID, MODEL_ID, USER_ID, { name: 'Renamed' });

      const updateArgs = mockPrisma.financialModel.update.mock.calls[0]![0];
      expect(updateArgs.data.status).toBe('draft');
    });

    it('does not recompute when only name/description changes', async () => {
      const existing = buildModelRow();
      mockPrisma.financialModel.findFirst.mockResolvedValue(existing);
      mockPrisma.financialModel.update.mockResolvedValue(existing);
      mockPrisma.financialModelLineItem.findMany.mockResolvedValue([]);
      mockPrisma.scenario.findMany.mockResolvedValue([]);

      const result = await service.update(TENANT_ID, MODEL_ID, USER_ID, {
        name: 'Just a rename',
      });

      // No delete -> recompute didn't fire.
      expect(mockPrisma.financialModelLineItem.deleteMany).not.toHaveBeenCalled();
      expect(result.totals_by_year).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('throws NotFoundException when model id does not belong to tenant', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(null);
      await expect(
        service.update(TENANT_ID, MODEL_ID, USER_ID, { name: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── archive / restore ─────────────────────────────────────────────────

  describe('archive / restore', () => {
    it('archive sets archived_at + status=archived', async () => {
      const existing = buildModelRow();
      mockPrisma.financialModel.findFirst.mockResolvedValue(existing);
      const archived = buildModelRow({
        status: 'archived',
        archived_at: new Date('2026-04-26T00:00:00.000Z'),
      });
      mockPrisma.financialModel.update.mockResolvedValue(archived);

      const result = await service.archive(TENANT_ID, MODEL_ID, USER_ID);
      const updateArgs = mockPrisma.financialModel.update.mock.calls[0]![0];
      expect(updateArgs.data.status).toBe('archived');
      expect(updateArgs.data.archived_at).toBeInstanceOf(Date);
      expect(result.status).toBe('archived');
      // archived_at is generated server-side via `new Date()`; assert
      // shape rather than value.
      expect(result.archived_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('restore clears archived_at + status returns to draft', async () => {
      const existing = buildModelRow({
        status: 'archived',
        archived_at: new Date('2026-04-25T00:00:00.000Z'),
      });
      mockPrisma.financialModel.findFirst.mockResolvedValue(existing);
      mockPrisma.financialModel.update.mockResolvedValue(buildModelRow({ status: 'draft' }));

      const result = await service.restore(TENANT_ID, MODEL_ID, USER_ID);
      const updateArgs = mockPrisma.financialModel.update.mock.calls[0]![0];
      expect(updateArgs.data.status).toBe('draft');
      expect(updateArgs.data.archived_at).toBeNull();
      expect(result.status).toBe('draft');
    });

    it('throws NotFoundException when archive target id is missing', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(null);
      await expect(service.archive(TENANT_ID, MODEL_ID, USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ─── findAll / findOne ─────────────────────────────────────────────────

  describe('findAll', () => {
    it('hides archived rows by default', async () => {
      mockPrisma.financialModel.findMany.mockResolvedValue([]);
      mockPrisma.financialModel.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, { page: 1, pageSize: 20, order: 'desc' });

      const findArgs = mockPrisma.financialModel.findMany.mock.calls[0]![0];
      expect(findArgs.where).toMatchObject({ tenant_id: TENANT_ID, archived_at: null });
    });

    it('includes archived rows when status=archived is requested', async () => {
      mockPrisma.financialModel.findMany.mockResolvedValue([]);
      mockPrisma.financialModel.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'archived',
        order: 'desc',
      });

      const findArgs = mockPrisma.financialModel.findMany.mock.calls[0]![0];
      expect(findArgs.where).toMatchObject({ tenant_id: TENANT_ID, status: 'archived' });
      expect(findArgs.where.archived_at).toBeUndefined();
    });
  });

  describe('findOne', () => {
    it('returns model + scenarios + base-case line items', async () => {
      const existing = buildModelRow();
      mockPrisma.financialModel.findFirst.mockResolvedValue(existing);
      mockPrisma.scenario.findMany.mockResolvedValue([]);
      mockPrisma.financialModelLineItem.findMany.mockResolvedValue([]);

      const result = await service.findOne(TENANT_ID, MODEL_ID);
      expect(result.model.id).toBe(MODEL_ID);
      expect(result.scenarios).toEqual([]);
      expect(result.line_items).toEqual([]);
    });

    it('throws NotFoundException for missing or cross-tenant id', async () => {
      mockPrisma.financialModel.findFirst.mockResolvedValue(null);
      await expect(service.findOne(TENANT_ID, MODEL_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ─── ConflictException sentinel — exercised by the create-driver
  // path when user supplies an invalid fiscal_year_start ──
  it('rejects invalid fiscal_year_start with ConflictException', async () => {
    await expect(
      service.create(TENANT_ID, USER_ID, {
        name: 'Bad',
        fiscal_year_start: 'not-a-date',
        horizon_years: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
