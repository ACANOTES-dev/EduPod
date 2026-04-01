import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  SCHEDULING_REAP_STALE_JOB,
  SchedulingStaleReaperProcessor,
} from './scheduling-stale-reaper.processor';

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';

function buildJob(name: string): Job {
  return {
    data: {},
    name,
  } as Job;
}

function buildMockPrisma() {
  return {
    $transaction: jest.fn(
      async (
        callback: (tx: {
          $executeRaw: jest.Mock;
          schedulingRun: { update: jest.Mock };
        }) => Promise<void>,
      ) =>
        callback({
          $executeRaw: jest.fn().mockResolvedValue(undefined),
          schedulingRun: {
            update: jest.fn().mockResolvedValue({ id: 'updated-run-id' }),
          },
        }),
    ),
    schedulingRun: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

function buildMockPrismaClient(prisma: ReturnType<typeof buildMockPrisma>) {
  return prisma as unknown as PrismaClient;
}

describe('SchedulingStaleReaperProcessor', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const prisma = buildMockPrisma();
    const processor = new SchedulingStaleReaperProcessor(buildMockPrismaClient(prisma));

    await processor.process(buildJob('scheduling:other-job'));

    expect(prisma.schedulingRun.findMany).not.toHaveBeenCalled();
  });

  it('should mark only stale runs as failed and keep tenant updates isolated', async () => {
    const prisma = buildMockPrisma();
    prisma.schedulingRun.findMany.mockResolvedValue([
      {
        config_snapshot: { settings: { max_solver_duration_seconds: 120 } },
        id: 'run-a',
        tenant_id: TENANT_A_ID,
        updated_at: new Date('2026-04-01T11:54:00.000Z'),
      },
      {
        config_snapshot: { settings: { max_solver_duration_seconds: 120 } },
        id: 'run-b',
        tenant_id: TENANT_B_ID,
        updated_at: new Date('2026-04-01T11:30:00.000Z'),
      },
      {
        config_snapshot: { settings: { max_solver_duration_seconds: 120 } },
        id: 'run-fresh',
        tenant_id: TENANT_B_ID,
        updated_at: new Date('2026-04-01T11:59:30.000Z'),
      },
    ]);
    const processor = new SchedulingStaleReaperProcessor(buildMockPrismaClient(prisma));

    await processor.process(buildJob(SCHEDULING_REAP_STALE_JOB));

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);

    const callbacks = prisma.$transaction.mock.calls.map(
      (call) =>
        call[0] as (tx: {
          $executeRaw: jest.Mock;
          schedulingRun: { update: jest.Mock };
        }) => Promise<void>,
    );
    const tenantATx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      schedulingRun: { update: jest.fn().mockResolvedValue({ id: 'run-a' }) },
    };
    const tenantBTx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      schedulingRun: { update: jest.fn().mockResolvedValue({ id: 'run-b' }) },
    };

    await callbacks[0]?.(tenantATx);
    await callbacks[1]?.(tenantBTx);

    expect(tenantATx.schedulingRun.update).toHaveBeenCalledWith({
      data: {
        failure_reason: 'Stale run reaped — worker likely crashed',
        status: 'failed',
      },
      where: { id: 'run-a' },
    });
    expect(tenantBTx.schedulingRun.update).toHaveBeenCalledWith({
      data: {
        failure_reason: 'Stale run reaped — worker likely crashed',
        status: 'failed',
      },
      where: { id: 'run-b' },
    });
  });
});
