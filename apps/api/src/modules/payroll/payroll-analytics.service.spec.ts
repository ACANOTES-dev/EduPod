import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, StaffProfileReadFacade } from '../../common/tests/mock-facades';
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
        return Promise.resolve(
          makeRun({
            entries: [makeEntry(STAFF_ID, '5500.00')],
          }),
        );
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
        ...MOCK_FACADE_PROVIDERS,
        PayrollAnalyticsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            count: jest.fn().mockResolvedValue(10),
          },
        },
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

  // ─── getCostDashboard — additional branches ──────────────────────────────────

  describe('getCostDashboard — no latest run', () => {
    it('should return empty department breakdown when no runs exist', async () => {
      prisma.payrollRun.findMany = jest.fn().mockResolvedValue([]);

      const result = await service.getCostDashboard(TENANT_ID, 6);

      expect(result.department_breakdown).toEqual([]);
      expect(result.latest_run_id).toBeNull();
    });
  });

  describe('getCostDashboard — override_total_pay in department breakdown', () => {
    it('should use override_total_pay when set for department breakdown entries', async () => {
      const latestRun = makeRun({ id: 'run-latest' });
      prisma.payrollRun.findMany = jest.fn().mockResolvedValue([latestRun]);
      prisma.payrollEntry.findMany = jest.fn().mockResolvedValue([
        makeEntry(STAFF_ID, '5000.00', {
          override_total_pay: '4000.00',
          staff_profile: { id: STAFF_ID, department: 'Science' },
        }),
        makeEntry('staff-2', '3000.00', {
          override_total_pay: null,
          staff_profile: { id: 'staff-2', department: 'Science' },
        }),
      ]);

      const result = await service.getCostDashboard(TENANT_ID, 6);

      expect(result.department_breakdown).toHaveLength(1);
      // 4000 (override) + 3000 (regular) = 7000
      expect(result.department_breakdown[0]!.total_pay).toBe(7000);
      expect(result.department_breakdown[0]!.staff_count).toBe(2);
      expect(result.department_breakdown[0]!.avg_pay).toBe(3500);
    });

    it('should assign "Unassigned" department when staff has no department', async () => {
      const latestRun = makeRun({ id: 'run-latest' });
      prisma.payrollRun.findMany = jest.fn().mockResolvedValue([latestRun]);
      prisma.payrollEntry.findMany = jest.fn().mockResolvedValue([
        makeEntry(STAFF_ID, '5000.00', {
          staff_profile: { id: STAFF_ID, department: null },
        }),
      ]);

      const result = await service.getCostDashboard(TENANT_ID, 6);

      expect(result.department_breakdown[0]!.department).toBe('Unassigned');
    });

    it('should aggregate multiple staff in the same department', async () => {
      const latestRun = makeRun({ id: 'run-latest' });
      prisma.payrollRun.findMany = jest.fn().mockResolvedValue([latestRun]);
      prisma.payrollEntry.findMany = jest.fn().mockResolvedValue([
        makeEntry('staff-1', '3000.00', {
          staff_profile: { id: 'staff-1', department: 'Math' },
        }),
        makeEntry('staff-2', '4000.00', {
          staff_profile: { id: 'staff-2', department: 'Math' },
        }),
      ]);

      const result = await service.getCostDashboard(TENANT_ID, 6);

      const mathDept = result.department_breakdown.find((d) => d.department === 'Math');
      expect(mathDept).toBeDefined();
      expect(mathDept!.staff_count).toBe(2);
      expect(mathDept!.total_pay).toBe(7000);
    });
  });

  // ─── getVarianceReport — additional branches ─────────────────────────────────

  describe('getVarianceReport — with previous run', () => {
    it('should return empty result when current run not found', async () => {
      prisma.payrollRun.findFirst = jest.fn().mockResolvedValue(null);

      const result = await service.getVarianceReport(TENANT_ID, 'nonexistent');

      expect(result.run_id).toBe('nonexistent');
      expect(result.previous_run_id).toBeNull();
      expect(result.items).toEqual([]);
      expect(result.summary.total_current).toBe(0);
    });

    it('should identify changed and unchanged staff with previous run', async () => {
      // Current run: staff-1 pays 5500, staff-2 pays 3000
      const currentRun = makeRun({
        id: RUN_ID,
        period_month: 4,
        period_year: 2026,
        entries: [
          makeEntry('staff-1', '5500.00', {
            staff_profile: { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Smith' } },
          }),
          makeEntry('staff-2', '3000.00', {
            staff_profile: { id: 'staff-2', user: { first_name: 'Bob', last_name: 'Jones' } },
          }),
        ],
      });

      // Previous run: staff-1 paid 5000 (changed), staff-2 paid 3000 (unchanged)
      const previousRun = makeRun({
        id: 'prev-run',
        period_month: 3,
        period_year: 2026,
        entries: [
          makeEntry('staff-1', '5000.00', {
            staff_profile: { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Smith' } },
          }),
          makeEntry('staff-2', '3000.00', {
            staff_profile: { id: 'staff-2', user: { first_name: 'Bob', last_name: 'Jones' } },
          }),
        ],
      });

      prisma.payrollRun.findFirst = jest
        .fn()
        .mockResolvedValueOnce(currentRun) // current run
        .mockResolvedValueOnce(previousRun); // previous run

      const result = await service.getVarianceReport(TENANT_ID, RUN_ID);

      expect(result.previous_run_id).toBe('prev-run');

      const changedItem = result.items.find((i) => i.staff_profile_id === 'staff-1');
      expect(changedItem).toBeDefined();
      expect(changedItem!.reason).toBe('changed');
      expect(changedItem!.variance).toBe(500);

      const unchangedItem = result.items.find((i) => i.staff_profile_id === 'staff-2');
      expect(unchangedItem).toBeDefined();
      expect(unchangedItem!.reason).toBe('unchanged');
      expect(unchangedItem!.variance).toBe(0);
    });

    it('should identify departed staff from previous run', async () => {
      // Current run: only staff-1
      const currentRun = makeRun({
        id: RUN_ID,
        period_month: 4,
        entries: [
          makeEntry('staff-1', '5000.00', {
            staff_profile: { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Smith' } },
          }),
        ],
      });

      // Previous run: staff-1 + staff-departed
      const previousRun = makeRun({
        id: 'prev-run',
        period_month: 3,
        entries: [
          makeEntry('staff-1', '5000.00', {
            staff_profile: { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Smith' } },
          }),
          makeEntry('staff-departed', '4000.00', {
            staff_profile: {
              id: 'staff-departed',
              user: { first_name: 'Carol', last_name: 'Dept' },
            },
          }),
        ],
      });

      prisma.payrollRun.findFirst = jest
        .fn()
        .mockResolvedValueOnce(currentRun)
        .mockResolvedValueOnce(previousRun);

      const result = await service.getVarianceReport(TENANT_ID, RUN_ID);

      const departedItem = result.items.find((i) => i.reason === 'departed');
      expect(departedItem).toBeDefined();
      expect(departedItem!.staff_profile_id).toBe('staff-departed');
      expect(departedItem!.current_total).toBe(0);
      expect(departedItem!.variance_pct).toBe(-100);
    });

    it('should use override_total_pay in previous run entries', async () => {
      const currentRun = makeRun({
        id: RUN_ID,
        period_month: 4,
        entries: [
          makeEntry('staff-1', '5000.00', {
            staff_profile: { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Smith' } },
          }),
        ],
      });

      const previousRun = makeRun({
        id: 'prev-run',
        period_month: 3,
        entries: [
          makeEntry('staff-1', '6000.00', {
            override_total_pay: '5500.00',
            staff_profile: { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Smith' } },
          }),
        ],
      });

      prisma.payrollRun.findFirst = jest
        .fn()
        .mockResolvedValueOnce(currentRun)
        .mockResolvedValueOnce(previousRun);

      const result = await service.getVarianceReport(TENANT_ID, RUN_ID);

      const item = result.items.find((i) => i.staff_profile_id === 'staff-1');
      expect(item).toBeDefined();
      // previous total should use override (5500), not total_pay (6000)
      expect(item!.previous_total).toBe(5500);
      expect(item!.variance).toBe(-500);
    });

    it('should handle override_total_pay in variance report', async () => {
      const currentRun = makeRun({
        id: RUN_ID,
        period_month: 4,
        entries: [
          makeEntry('staff-1', '5000.00', {
            override_total_pay: '4500.00',
            staff_profile: { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Smith' } },
          }),
        ],
      });

      prisma.payrollRun.findFirst = jest
        .fn()
        .mockResolvedValueOnce(currentRun)
        .mockResolvedValueOnce(null); // no previous run

      const result = await service.getVarianceReport(TENANT_ID, RUN_ID);

      const item = result.items[0]!;
      expect(item.current_total).toBe(4500);
      expect(item.reason).toBe('new_staff');
    });
  });

  // ─── getStaffCostForecast — month rollover ───────────────────────────────────

  describe('getStaffCostForecast — month rollover', () => {
    it('should correctly handle year rollover when forecasting past December', async () => {
      prisma.payrollRun.findFirst = jest.fn().mockResolvedValue(
        makeRun({
          period_month: 11, // November
          period_year: 2026,
          total_pay: '10000.00',
          headcount: 5,
        }),
      );

      const result = await service.getStaffCostForecast(TENANT_ID, 3);

      expect(result).toHaveLength(3);
      // Dec 2026, Jan 2027, Feb 2027
      expect(result[0]!.period_month).toBe(12);
      expect(result[0]!.period_year).toBe(2026);
      expect(result[1]!.period_month).toBe(1);
      expect(result[1]!.period_year).toBe(2027);
      expect(result[2]!.period_month).toBe(2);
      expect(result[2]!.period_year).toBe(2027);
      expect(result[0]!.projected_total).toBe(10000);
      expect(result[0]!.projected_headcount).toBe(5);
    });
  });

  // ─── getMonthOverMonth ───────────────────────────────────────────────────────

  describe('getMonthOverMonth', () => {
    it('should delegate to getVarianceReport', async () => {
      prisma.payrollRun.findFirst = jest.fn().mockResolvedValue(null);

      const result = await service.getMonthOverMonth(TENANT_ID, RUN_ID);

      expect(result.run_id).toBe(RUN_ID);
      expect(result.items).toEqual([]);
    });
  });
});
