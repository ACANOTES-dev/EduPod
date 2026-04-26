/* eslint-disable import/order -- jest.mock must precede mocked imports */
const mockRedisClient = {
  quit: jest.fn().mockResolvedValue(undefined),
  set: jest.fn().mockResolvedValue('OK'),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisClient);
});

import { Job } from 'bullmq';

import {
  buildSessionGenStatusKey,
  PAYROLL_SESSION_GENERATION_JOB,
  SESSION_GEN_STATUS_TTL_SECONDS,
} from '@school/shared/payroll';

import {
  PayrollSessionGenerationProcessor,
  type SessionGenerationPayload,
} from './session-generation.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const PAYROLL_RUN_ID = '22222222-2222-2222-2222-222222222222';
const ENTRY_ID = '33333333-3333-3333-3333-333333333333';
const STAFF_ID = '44444444-4444-4444-4444-444444444444';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    payrollEntry: {
      findMany: jest.fn().mockResolvedValue([{ id: ENTRY_ID, staff_profile_id: STAFF_ID }]),
      update: jest.fn().mockResolvedValue({ id: ENTRY_ID }),
    },
    payrollRun: {
      findFirst: jest.fn().mockResolvedValue({
        period_month: 3,
        period_year: 2026,
      }),
    },
    classDeliveryRecord: {
      count: jest.fn().mockResolvedValue(4),
    },
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(mockTx)),
  };
}

function buildJob(
  name: string = PAYROLL_SESSION_GENERATION_JOB,
  data: Partial<SessionGenerationPayload> = {},
): Job<SessionGenerationPayload> {
  return {
    data: {
      payroll_run_id: PAYROLL_RUN_ID,
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<SessionGenerationPayload>;
}

describe('PayrollSessionGenerationProcessor', () => {
  beforeEach(() => {
    mockRedisClient.set.mockResolvedValue('OK');
    mockRedisClient.quit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new PayrollSessionGenerationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('payroll:other-job'));

    expect(mockTx.payrollRun.findFirst).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new PayrollSessionGenerationProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(PAYROLL_SESSION_GENERATION_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id in payload.');
  });

  it('should populate confirmed delivery counts and write completed status', async () => {
    const mockTx = buildMockTx();
    const processor = new PayrollSessionGenerationProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    // Wave 3 — counts confirmed delivery records, not raw schedule slots,
    // bracketed to the run's period (March 2026 = day 1 to day 31).
    expect(mockTx.classDeliveryRecord.count).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        staff_profile_id: STAFF_ID,
        status: 'delivered',
        delivery_date: {
          gte: new Date(2026, 2, 1),
          lte: new Date(2026, 3, 0),
        },
      },
    });
    expect(mockTx.payrollEntry.update).toHaveBeenCalledWith({
      where: { id: ENTRY_ID },
      data: {
        classes_taught: 4,
        auto_populated_class_count: 4,
      },
    });
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      buildSessionGenStatusKey(TENANT_ID, PAYROLL_RUN_ID),
      expect.stringContaining('"status":"completed"'),
      'EX',
      SESSION_GEN_STATUS_TTL_SECONDS,
    );
    // Wave 3 — Redis client is owned by the processor (constructor-level
    // singleton); .quit() only happens in onModuleDestroy.
    expect(mockRedisClient.quit).not.toHaveBeenCalled();
  });

  it('should write failed status to redis and rethrow when the payroll run is missing', async () => {
    const mockTx = buildMockTx();
    mockTx.payrollRun.findFirst.mockResolvedValue(null);
    const processor = new PayrollSessionGenerationProcessor(buildMockPrisma(mockTx) as never);

    await expect(processor.process(buildJob())).rejects.toThrow(
      `Payroll run ${PAYROLL_RUN_ID} not found for tenant ${TENANT_ID}`,
    );

    expect(mockRedisClient.set).toHaveBeenCalledWith(
      buildSessionGenStatusKey(TENANT_ID, PAYROLL_RUN_ID),
      expect.stringContaining('"status":"failed"'),
      'EX',
      SESSION_GEN_STATUS_TTL_SECONDS,
    );
  });

  it('should disconnect the redis client on module destroy', async () => {
    const mockTx = buildMockTx();
    const processor = new PayrollSessionGenerationProcessor(buildMockPrisma(mockTx) as never);

    await processor.onModuleDestroy();

    expect(mockRedisClient.quit).toHaveBeenCalled();
  });
});
