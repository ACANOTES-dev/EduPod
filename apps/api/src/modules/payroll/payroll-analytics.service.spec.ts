import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PayrollAnalyticsService } from './payroll-analytics.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const RUN_ID = '22222222-2222-2222-2222-222222222222';
const STAFF_ID = '33333333-3333-3333-3333-333333333333';

const makeRun = (overrides: Record<string, unknown> = {}) => ({
  id: RUN_ID,
  period_month: 3,
  period_year: 2026,
  period_label: 'March 2026',
  total_basic_pay: '5000.00',
  total_bonus_pay: '500.00',
  total_pay: '5500.00',
  headcount: 2,
  status: 'finalised',
  ...overrides,
});

const makeEntry = (staffId: string, total: string, overrides: Record<string, unknown> = {}) => ({
  id: '99999999-9999-9999-9999-999999999999',
  staff_profile_id: staffId,
  compensation_type: 'salaried',
  basic_pay: total,
  bonus_pay: '0.00',
  total_pay: total,
  override_total_pay: null,
  staff_profile: {
    id: staffId,
    department: 'Science',
    user: { first_name: 'Alice', last_name: 'Smith' },
  },
  ...overrides,
});

function buildPrisma() {
  return {
    payrollRun: {
      findFirst: jest.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
        if (args?.where?.status === 'finalised') {
          return Promise.resolve(null); // no previous run
        }
        return Promise.resolve(makeRun({
          entries: [makeEntry(STAFF_ID, '5500.00')],
        }));
      }),
      findMany: jest.fn().mockResolvedValue([makeRun()]),
    },
    staffProfile: {
      count: jest.fn().mockResolvedValue(10),
    },
    payrollEntry: {
      findMany: jest.fn().mockResolvedValue([makeEntry(STAFF_ID, '5500.00')]),
    },
  };
}

describe('PayrollAnalyticsService', () => {
  let service: PayrollAnalyticsService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollAnalyticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PayrollAnalyticsService>(PayrollAnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getCostDashboard should return trend and department breakdown', async () => {
    const result = await service.getCostDashboard(TENANT_ID, 6);

    expect(Array.isArray(result.trend)).toBe(true);
    expect(result.active_staff_count).toBe(10);
    expect(Array.isArray(result.department_breakdown)).toBe(true);
  });

  it('getCostDashboard trend items have numeric pay fields', async () => {
    const result = await service.getCostDashboard(TENANT_ID, 6);

    for (const point of result.trend) {
      expect(typeof point.gross_basic).toBe('number');
      expect(typeof point.gross_total).toBe('number');
    }
  });

  it('getVarianceReport returns items and summary', async () => {
    const result = await service.getVarianceReport(TENANT_ID, RUN_ID);

    expect(result.run_id).toBe(RUN_ID);
    expect(Array.isArray(result.items)).toBe(true);
    expect(typeof result.summary.total_current).toBe('number');
    expect(typeof result.summary.total_variance).toBe('number');
  });

  it('getVarianceReport marks new staff correctly when no previous run', async () => {
    const result = await service.getVarianceReport(TENANT_ID, RUN_ID);

    const newStaffItem = result.items.find((i) => i.reason === 'new_staff');
    expect(newStaffItem).toBeDefined();
  });

  it('getStaffCostForecast returns N future periods', async () => {
    prisma.payrollRun.findFirst = jest.fn().mockResolvedValue(makeRun());

    const result = await service.getStaffCostForecast(TENANT_ID, 6);
    expect(result).toHaveLength(6);
    expect(result[0]?.period_label).toMatch(/\w+ \d{4}/);
  });

  it('getStaffCostForecast returns empty array when no finalised runs', async () => {
    prisma.payrollRun.findFirst = jest.fn().mockResolvedValue(null);

    const result = await service.getStaffCostForecast(TENANT_ID, 6);
    expect(result).toHaveLength(0);
  });
});
