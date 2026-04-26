import { Test, TestingModule } from '@nestjs/testing';

import {
  BUDGETING_TENANT_PREFERENCES_DEFAULTS,
  type BudgetingTenantPreferences,
} from '@school/shared/budgeting';

import { PrismaService } from '../../prisma/prisma.service';

import { TenantPreferencesService } from './tenant-preferences.service';

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

// ─── Mock prisma factory ──────────────────────────────────────────────────

function buildMockPrisma() {
  const mock = {
    budgetingTenantPreferences: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };
  Object.assign(mockRlsTx, mock);
  return mock;
}

// ─── Builders ─────────────────────────────────────────────────────────────

interface PrismaRow {
  tenant_id: string;
  default_horizon_years: number;
  default_household_share_pct: number;
  default_contingency_pct: number;
  default_export_format: string;
  shareable_link_max_days: number;
  hidden_kpi_keys: string[];
}

function buildRow(overrides: Partial<PrismaRow> = {}): PrismaRow {
  return {
    tenant_id: TENANT_ID,
    default_horizon_years: BUDGETING_TENANT_PREFERENCES_DEFAULTS.default_horizon_years,
    default_household_share_pct: BUDGETING_TENANT_PREFERENCES_DEFAULTS.default_household_share_pct,
    default_contingency_pct: BUDGETING_TENANT_PREFERENCES_DEFAULTS.default_contingency_pct,
    default_export_format: BUDGETING_TENANT_PREFERENCES_DEFAULTS.default_export_format,
    shareable_link_max_days: BUDGETING_TENANT_PREFERENCES_DEFAULTS.shareable_link_max_days,
    hidden_kpi_keys: [...BUDGETING_TENANT_PREFERENCES_DEFAULTS.hidden_kpi_keys],
    ...overrides,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────

describe('TenantPreferencesService', () => {
  let module: TestingModule;
  let service: TenantPreferencesService;
  let prisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    prisma = buildMockPrisma();

    module = await Test.createTestingModule({
      providers: [TenantPreferencesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(TenantPreferencesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrCreate', () => {
    it('returns the existing row when one is already persisted', async () => {
      prisma.budgetingTenantPreferences.findUnique.mockResolvedValue(
        buildRow({ default_horizon_years: 3, default_household_share_pct: 75 }),
      );

      const result = await service.getOrCreate(TENANT_ID, USER_ID);

      expect(result.default_horizon_years).toBe(3);
      expect(result.default_household_share_pct).toBe(75);
      // The upsert path is NOT taken when a row already exists.
      expect(prisma.budgetingTenantPreferences.upsert).not.toHaveBeenCalled();
    });

    it('upserts schema defaults on first read so callers always see a fully populated shape', async () => {
      prisma.budgetingTenantPreferences.findUnique.mockResolvedValue(null);
      prisma.budgetingTenantPreferences.upsert.mockResolvedValue(buildRow());

      const result: BudgetingTenantPreferences = await service.getOrCreate(TENANT_ID, USER_ID);

      expect(prisma.budgetingTenantPreferences.upsert).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        update: {},
        create: { tenant_id: TENANT_ID, ...BUDGETING_TENANT_PREFERENCES_DEFAULTS },
      });
      expect(result).toEqual(BUDGETING_TENANT_PREFERENCES_DEFAULTS);
    });
  });

  describe('update', () => {
    it('upserts only the supplied fields and returns the canonical post-write shape', async () => {
      prisma.budgetingTenantPreferences.upsert.mockResolvedValue(
        buildRow({ default_household_share_pct: 80 }),
      );

      const result = await service.update(TENANT_ID, USER_ID, {
        default_household_share_pct: 80,
      });

      expect(prisma.budgetingTenantPreferences.upsert).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        update: { default_household_share_pct: 80 },
        create: {
          tenant_id: TENANT_ID,
          ...BUDGETING_TENANT_PREFERENCES_DEFAULTS,
          default_household_share_pct: 80,
        },
      });
      expect(result.default_household_share_pct).toBe(80);
      expect(result.default_horizon_years).toBe(
        BUDGETING_TENANT_PREFERENCES_DEFAULTS.default_horizon_years,
      );
    });

    it('round-trips numeric Decimal-like values via toString()', async () => {
      // Prisma can return Decimal values for the percentage columns. The mapper
      // accepts either bare numbers or objects that respond to `.toString()`.
      prisma.budgetingTenantPreferences.upsert.mockResolvedValue({
        ...buildRow(),
        default_household_share_pct: { toString: () => '95.5' } as unknown as number,
        default_contingency_pct: { toString: () => '7.25' } as unknown as number,
      });

      const result = await service.update(TENANT_ID, USER_ID, {});

      expect(result.default_household_share_pct).toBe(95.5);
      expect(result.default_contingency_pct).toBe(7.25);
    });

    it('coerces null Decimal values to 0 rather than NaN', async () => {
      prisma.budgetingTenantPreferences.upsert.mockResolvedValue({
        ...buildRow(),
        default_household_share_pct: null as unknown as number,
        default_contingency_pct: null as unknown as number,
      });

      const result = await service.update(TENANT_ID, USER_ID, {});

      expect(result.default_household_share_pct).toBe(0);
      expect(result.default_contingency_pct).toBe(0);
    });

    it('updates the hidden_kpi_keys array verbatim', async () => {
      prisma.budgetingTenantPreferences.upsert.mockResolvedValue(
        buildRow({ hidden_kpi_keys: ['breakeven_students'] }),
      );

      const result = await service.update(TENANT_ID, USER_ID, {
        hidden_kpi_keys: ['breakeven_students'],
      });

      expect(result.hidden_kpi_keys).toEqual(['breakeven_students']);
    });
  });
});
