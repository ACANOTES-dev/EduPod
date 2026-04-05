import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PayrollAnomalyService } from './payroll-anomaly.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const RUN_ID = '22222222-2222-2222-2222-222222222222';
const STAFF_1 = '33333333-3333-3333-3333-333333333333';
const STAFF_2 = '44444444-4444-4444-4444-444444444444';

function makeEntry(overrides: Record<string, unknown>) {
  return {
    id: '55555555-5555-5555-5555-555555555555',
    staff_profile_id: STAFF_1,
    compensation_type: 'salaried',
    days_worked: 20,
    classes_taught: null,
    basic_pay: '5000.00',
    bonus_pay: '0.00',
    total_pay: '5000.00',
    override_total_pay: null,
    staff_profile: {
      id: STAFF_1,
      user: { first_name: 'Alice', last_name: 'Smith' },
    },
    ...overrides,
  };
}

function buildPrisma(runOverrides: Record<string, unknown> = {}) {
  return {
    payrollRun: {
      findFirst: jest.fn().mockImplementation((args: { where: { status?: string } }) => {
        if (args?.where?.status === 'finalised') {
          return Promise.resolve(null); // no previous run
        }
        return Promise.resolve({
          id: RUN_ID,
          period_year: 2026,
          period_month: 3,
          total_working_days: 22,
          entries: [makeEntry({})],
          ...runOverrides,
        });
      }),
    },
  };
}

describe('PayrollAnomalyService', () => {
  let service: PayrollAnomalyService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [PayrollAnomalyService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<PayrollAnomalyService>(PayrollAnomalyService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return no anomalies for a clean run', async () => {
    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    expect(result.anomaly_count).toBe(0);
    expect(result.anomalies).toHaveLength(0);
  });

  it('should flag zero classes for per-class staff', async () => {
    prisma.payrollRun.findFirst = jest
      .fn()
      .mockImplementation((args: { where: { status?: string } }) => {
        if (args?.where?.status === 'finalised') return Promise.resolve(null);
        return Promise.resolve({
          id: RUN_ID,
          period_year: 2026,
          period_month: 3,
          total_working_days: 22,
          entries: [makeEntry({ compensation_type: 'per_class', classes_taught: 0 })],
        });
      });

    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    const anomaly = result.anomalies.find((a) => a.anomaly_type === 'ZERO_CLASSES');
    expect(anomaly).toBeDefined();
  });

  it('should flag null classes for per-class staff as ZERO_CLASSES', async () => {
    prisma.payrollRun.findFirst = jest
      .fn()
      .mockImplementation((args: { where: { status?: string } }) => {
        if (args?.where?.status === 'finalised') return Promise.resolve(null);
        return Promise.resolve({
          id: RUN_ID,
          period_year: 2026,
          period_month: 3,
          total_working_days: 22,
          entries: [makeEntry({ compensation_type: 'per_class', classes_taught: null })],
        });
      });

    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    const anomaly = result.anomalies.find((a) => a.anomaly_type === 'ZERO_CLASSES');
    expect(anomaly).toBeDefined();
    expect(anomaly?.severity).toBe('warning');
  });

  it('should flag days_worked exceeding total_working_days', async () => {
    prisma.payrollRun.findFirst = jest
      .fn()
      .mockImplementation((args: { where: { status?: string } }) => {
        if (args?.where?.status === 'finalised') return Promise.resolve(null);
        return Promise.resolve({
          id: RUN_ID,
          period_year: 2026,
          period_month: 3,
          total_working_days: 20,
          entries: [makeEntry({ days_worked: 25 })],
        });
      });

    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    const anomaly = result.anomalies.find((a) => a.anomaly_type === 'DAYS_EXCEED_WORKING_DAYS');
    expect(anomaly).toBeDefined();
    expect(anomaly?.severity).toBe('warning');
  });

  it('should throw NotFoundException for non-existent run', async () => {
    prisma.payrollRun.findFirst = jest.fn().mockResolvedValue(null);

    await expect(service.scanForAnomalies(TENANT_ID, RUN_ID)).rejects.toThrow(NotFoundException);
  });

  it('should flag large pay variance vs previous month', async () => {
    let callCount = 0;
    prisma.payrollRun.findFirst = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          id: RUN_ID,
          period_year: 2026,
          period_month: 3,
          total_working_days: 22,
          entries: [makeEntry({ total_pay: '6000.00' })],
        });
      }
      // Previous run
      return Promise.resolve({
        id: '99999999-9999-9999-9999-999999999999',
        entries: [{ staff_profile_id: STAFF_1, total_pay: '5000.00' }],
      });
    });

    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    const anomaly = result.anomalies.find((a) => a.anomaly_type === 'LARGE_PAY_VARIANCE');
    expect(anomaly).toBeDefined();
  });

  it('should flag zero pay as a warning', async () => {
    prisma.payrollRun.findFirst = jest
      .fn()
      .mockImplementation((args: { where: { status?: string } }) => {
        if (args?.where?.status === 'finalised') return Promise.resolve(null);
        return Promise.resolve({
          id: RUN_ID,
          period_year: 2026,
          period_month: 3,
          total_working_days: 22,
          entries: [makeEntry({ basic_pay: '0.00', bonus_pay: '0.00', total_pay: '0.00' })],
        });
      });

    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    const anomaly = result.anomalies.find((a) => a.anomaly_type === 'ZERO_PAY');
    expect(anomaly).toBeDefined();
  });

  // ─── Additional branch-coverage tests ──────────────────────────────────────

  it('should flag DUPLICATE_ENTRY when same staff appears twice', async () => {
    prisma.payrollRun.findFirst = jest
      .fn()
      .mockImplementation((args: { where: { status?: string } }) => {
        if (args?.where?.status === 'finalised') return Promise.resolve(null);
        return Promise.resolve({
          id: RUN_ID,
          period_year: 2026,
          period_month: 3,
          total_working_days: 22,
          entries: [
            makeEntry({ id: 'entry-1' }),
            makeEntry({ id: 'entry-2' }), // same STAFF_1
          ],
        });
      });

    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    const dups = result.anomalies.filter((a) => a.anomaly_type === 'DUPLICATE_ENTRY');
    expect(dups).toHaveLength(1);
    expect(dups[0]?.severity).toBe('error');
  });

  it('should flag MISSING_DAYS_WORKED for salaried with null days_worked', async () => {
    prisma.payrollRun.findFirst = jest
      .fn()
      .mockImplementation((args: { where: { status?: string } }) => {
        if (args?.where?.status === 'finalised') return Promise.resolve(null);
        return Promise.resolve({
          id: RUN_ID,
          period_year: 2026,
          period_month: 3,
          total_working_days: 22,
          entries: [makeEntry({ days_worked: null })],
        });
      });

    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    const anomaly = result.anomalies.find((a) => a.anomaly_type === 'MISSING_DAYS_WORKED');
    expect(anomaly).toBeDefined();
    expect(anomaly?.severity).toBe('error');
  });

  it('should use override_total_pay for pay variance when set', async () => {
    let callCount = 0;
    prisma.payrollRun.findFirst = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          id: RUN_ID,
          period_year: 2026,
          period_month: 3,
          total_working_days: 22,
          entries: [makeEntry({ total_pay: '5000.00', override_total_pay: '7000.00' })],
        });
      }
      return Promise.resolve({
        id: '99999999-9999-9999-9999-999999999999',
        entries: [{ staff_profile_id: STAFF_1, total_pay: '5000.00' }],
      });
    });

    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    const anomaly = result.anomalies.find((a) => a.anomaly_type === 'LARGE_PAY_VARIANCE');
    expect(anomaly).toBeDefined();
    // 7000 vs 5000 = 40% change
    expect(anomaly?.description).toContain('40.0%');
  });

  it('should not flag pay variance when change is under 20%', async () => {
    let callCount = 0;
    prisma.payrollRun.findFirst = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          id: RUN_ID,
          period_year: 2026,
          period_month: 3,
          total_working_days: 22,
          entries: [makeEntry({ total_pay: '5500.00' })],
        });
      }
      return Promise.resolve({
        id: '99999999-9999-9999-9999-999999999999',
        entries: [{ staff_profile_id: STAFF_1, total_pay: '5000.00' }],
      });
    });

    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    const anomaly = result.anomalies.find((a) => a.anomaly_type === 'LARGE_PAY_VARIANCE');
    expect(anomaly).toBeUndefined();
  });

  it('should skip pay variance check when no previous pay for staff', async () => {
    let callCount = 0;
    prisma.payrollRun.findFirst = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          id: RUN_ID,
          period_year: 2026,
          period_month: 3,
          total_working_days: 22,
          entries: [makeEntry({ total_pay: '6000.00' })],
        });
      }
      // Previous run exists but has different staff
      return Promise.resolve({
        id: '99999999-9999-9999-9999-999999999999',
        entries: [{ staff_profile_id: STAFF_2, total_pay: '5000.00' }],
      });
    });

    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    const anomaly = result.anomalies.find((a) => a.anomaly_type === 'LARGE_PAY_VARIANCE');
    expect(anomaly).toBeUndefined();
  });

  it('should not flag DAYS_EXCEED when days_worked is null', async () => {
    prisma.payrollRun.findFirst = jest
      .fn()
      .mockImplementation((args: { where: { status?: string } }) => {
        if (args?.where?.status === 'finalised') return Promise.resolve(null);
        return Promise.resolve({
          id: RUN_ID,
          period_year: 2026,
          period_month: 3,
          total_working_days: 22,
          entries: [makeEntry({ days_worked: null })],
        });
      });

    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    const anomaly = result.anomalies.find((a) => a.anomaly_type === 'DAYS_EXCEED_WORKING_DAYS');
    expect(anomaly).toBeUndefined();
  });

  it('should not flag DAYS_EXCEED for per_class compensation type', async () => {
    prisma.payrollRun.findFirst = jest
      .fn()
      .mockImplementation((args: { where: { status?: string } }) => {
        if (args?.where?.status === 'finalised') return Promise.resolve(null);
        return Promise.resolve({
          id: RUN_ID,
          period_year: 2026,
          period_month: 3,
          total_working_days: 22,
          entries: [
            makeEntry({ compensation_type: 'per_class', days_worked: 30, classes_taught: 10 }),
          ],
        });
      });

    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    const anomaly = result.anomalies.find((a) => a.anomaly_type === 'DAYS_EXCEED_WORKING_DAYS');
    expect(anomaly).toBeUndefined();
  });

  it('should detect multiple anomaly types on a single entry', async () => {
    prisma.payrollRun.findFirst = jest
      .fn()
      .mockImplementation((args: { where: { status?: string } }) => {
        if (args?.where?.status === 'finalised') return Promise.resolve(null);
        return Promise.resolve({
          id: RUN_ID,
          period_year: 2026,
          period_month: 3,
          total_working_days: 22,
          entries: [
            makeEntry({
              compensation_type: 'salaried',
              days_worked: null,
              basic_pay: '0.00',
              bonus_pay: '0.00',
              total_pay: '0.00',
            }),
          ],
        });
      });

    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    const types = result.anomalies.map((a) => a.anomaly_type);
    expect(types).toContain('MISSING_DAYS_WORKED');
    expect(types).toContain('ZERO_PAY');
    expect(result.anomaly_count).toBeGreaterThanOrEqual(2);
  });

  it('should handle multiple staff with mixed anomalies', async () => {
    prisma.payrollRun.findFirst = jest
      .fn()
      .mockImplementation((args: { where: { status?: string } }) => {
        if (args?.where?.status === 'finalised') return Promise.resolve(null);
        return Promise.resolve({
          id: RUN_ID,
          period_year: 2026,
          period_month: 3,
          total_working_days: 22,
          entries: [
            makeEntry({
              id: 'entry-1',
              staff_profile_id: STAFF_1,
              days_worked: 22,
              basic_pay: '5000.00',
              bonus_pay: '0.00',
              total_pay: '5000.00',
            }),
            makeEntry({
              id: 'entry-2',
              staff_profile_id: STAFF_2,
              compensation_type: 'per_class',
              classes_taught: 0,
              days_worked: null,
              basic_pay: '0.00',
              bonus_pay: '0.00',
              total_pay: '0.00',
              staff_profile: { id: STAFF_2, user: { first_name: 'Bob', last_name: 'Jones' } },
            }),
          ],
        });
      });

    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    expect(result.anomalies.length).toBeGreaterThan(0);
    // Bob should have ZERO_CLASSES and ZERO_PAY
    const bobAnomalies = result.anomalies.filter((a) => a.staff_profile_id === STAFF_2);
    const bobTypes = bobAnomalies.map((a) => a.anomaly_type);
    expect(bobTypes).toContain('ZERO_CLASSES');
    expect(bobTypes).toContain('ZERO_PAY');
  });

  it('should return correct run_id in response', async () => {
    const result = await service.scanForAnomalies(TENANT_ID, RUN_ID);
    expect(result.run_id).toBe(RUN_ID);
  });
});
