import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  SCHEDULING_REAP_STALE_JOB,
  SchedulingStaleReaperJob,
} from './scheduling-stale-reaper.processor';

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';

function buildJob(name: string): Job {
  return { data: {}, name } as Job;
}

interface MockRow {
  id: string;
  status: string;
  updated_at: Date;
  config_snapshot?: unknown;
}

function buildMockPrisma(options?: {
  tenants?: string[];
  runsByTenant?: Record<string, MockRow[]>;
}) {
  const tenants = options?.tenants ?? [TENANT_A_ID, TENANT_B_ID];
  const runsByTenant = options?.runsByTenant ?? {};
  const updates: Array<{ tenantId: string; id: string; data: Record<string, unknown> }> = [];

  const prisma = {
    tenant: {
      findMany: jest.fn().mockResolvedValue(tenants.map((id) => ({ id }))),
    },
    $transaction: jest.fn(
      async (
        callback: (tx: {
          $executeRaw: jest.Mock;
          schedulingRun: { findMany: jest.Mock; update: jest.Mock };
        }) => Promise<unknown>,
      ) => {
        let currentTenant: string | undefined;
        const $executeRaw = jest.fn().mockImplementation((...args: unknown[]) => {
          // Tagged template literals are called as ($executeRaw(strings,
          // ...values)). The tenant id is the first interpolated value.
          const firstValue = args[1];
          if (typeof firstValue === 'string') {
            currentTenant = firstValue;
          }
          return Promise.resolve(undefined);
        });
        return callback({
          $executeRaw,
          schedulingRun: {
            findMany: jest.fn().mockImplementation(() => {
              if (!currentTenant) return Promise.resolve([]);
              return Promise.resolve(runsByTenant[currentTenant] ?? []);
            }),
            update: jest.fn().mockImplementation(({ where, data }) => {
              updates.push({ tenantId: currentTenant ?? 'unknown', id: where.id, data });
              return Promise.resolve({ id: where.id });
            }),
          },
        });
      },
    ),
    __updates: updates,
  };
  return prisma;
}

function buildMockPrismaClient(prisma: ReturnType<typeof buildMockPrisma>) {
  return prisma as unknown as PrismaClient;
}

describe('SchedulingStaleReaperJob', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const prisma = buildMockPrisma();
    const processor = new SchedulingStaleReaperJob(buildMockPrismaClient(prisma));

    await processor.process(buildJob('scheduling:other-job'));

    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it('should reap only stale running runs per-tenant (cron path)', async () => {
    const prisma = buildMockPrisma({
      runsByTenant: {
        [TENANT_A_ID]: [
          {
            id: 'run-a-stale',
            status: 'running',
            updated_at: new Date('2026-04-01T11:54:00.000Z'), // 6 min old
            config_snapshot: { settings: { max_solver_duration_seconds: 120 } },
          },
          {
            id: 'run-a-fresh',
            status: 'running',
            updated_at: new Date('2026-04-01T11:59:30.000Z'), // 30s old
            config_snapshot: { settings: { max_solver_duration_seconds: 120 } },
          },
        ],
        [TENANT_B_ID]: [
          {
            id: 'run-b-stale',
            status: 'running',
            updated_at: new Date('2026-04-01T11:30:00.000Z'), // 30 min old
            config_snapshot: { settings: { max_solver_duration_seconds: 120 } },
          },
        ],
      },
    });
    const processor = new SchedulingStaleReaperJob(buildMockPrismaClient(prisma));

    await processor.process(buildJob(SCHEDULING_REAP_STALE_JOB));

    const updates = prisma.__updates;
    const reapedIds = updates.map((u) => u.id).sort();
    expect(reapedIds).toEqual(['run-a-stale', 'run-b-stale']);
    expect(updates.find((u) => u.id === 'run-a-stale')?.data).toMatchObject({
      status: 'failed',
      failure_reason: expect.stringContaining('Stale run'),
    });
  });

  it('should respect per-tenant max_solver_duration_seconds override', async () => {
    // With a 30s max + 60s buffer = 90s threshold. A 120s-old row is stale.
    const prisma = buildMockPrisma({
      tenants: [TENANT_A_ID],
      runsByTenant: {
        [TENANT_A_ID]: [
          {
            id: 'short-timeout-run',
            status: 'running',
            updated_at: new Date('2026-04-01T11:58:00.000Z'), // 120s old
            config_snapshot: { settings: { max_solver_duration_seconds: 30 } },
          },
        ],
      },
    });
    const processor = new SchedulingStaleReaperJob(buildMockPrismaClient(prisma));

    await processor.process(buildJob(SCHEDULING_REAP_STALE_JOB));

    expect(prisma.__updates).toHaveLength(1);
    expect(prisma.__updates[0]?.id).toBe('short-timeout-run');
  });

  // SCHED-029 (STRESS-081): startup reaper runs once on worker bootstrap and
  // fails any run left in 'queued' or 'running' older than the 30s grace.
  describe('reapOnStartup', () => {
    it('should fail all stuck queued/running runs across tenants', async () => {
      const prisma = buildMockPrisma({
        runsByTenant: {
          [TENANT_A_ID]: [
            {
              id: 'stuck-running',
              status: 'running',
              updated_at: new Date('2026-04-01T11:50:00.000Z'),
            },
          ],
          [TENANT_B_ID]: [
            {
              id: 'stuck-queued',
              status: 'queued',
              updated_at: new Date('2026-04-01T11:58:00.000Z'),
            },
          ],
        },
      });

      const processor = new SchedulingStaleReaperJob(buildMockPrismaClient(prisma));
      const reaped = await processor.reapOnStartup();

      expect(reaped).toBe(2);
      const ids = prisma.__updates.map((u) => u.id).sort();
      expect(ids).toEqual(['stuck-queued', 'stuck-running']);
      for (const u of prisma.__updates) {
        expect(u.data).toMatchObject({
          status: 'failed',
          failure_reason: expect.stringContaining('Worker crashed or restarted mid-run'),
        });
      }
    });

    it('should leave very recent runs alone (< 30s grace)', async () => {
      // findMany is filtered by updated_at < (now - 30s) so fresh rows never
      // reach the update path. The mock returns the pre-filtered list.
      const prisma = buildMockPrisma({
        runsByTenant: {
          [TENANT_A_ID]: [], // simulated filter: nothing returned
        },
      });
      const processor = new SchedulingStaleReaperJob(buildMockPrismaClient(prisma));
      const reaped = await processor.reapOnStartup();

      expect(reaped).toBe(0);
      expect(prisma.__updates).toHaveLength(0);
    });

    it('should run automatically on application bootstrap', async () => {
      const prisma = buildMockPrisma();
      const processor = new SchedulingStaleReaperJob(buildMockPrismaClient(prisma));
      const spy = jest.spyOn(processor, 'reapOnStartup').mockResolvedValue(0);

      await processor.onApplicationBootstrap();

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('should swallow errors from reapOnStartup so bootstrap does not crash', async () => {
      const prisma = buildMockPrisma();
      const processor = new SchedulingStaleReaperJob(buildMockPrismaClient(prisma));
      jest.spyOn(processor, 'reapOnStartup').mockRejectedValue(new Error('boom'));

      await expect(processor.onApplicationBootstrap()).resolves.not.toThrow();
    });

    it('should continue reaping remaining tenants when one tenants fails', async () => {
      const prisma = buildMockPrisma({
        runsByTenant: {
          [TENANT_A_ID]: [
            {
              id: 'stuck-in-a',
              status: 'running',
              updated_at: new Date('2026-04-01T11:50:00.000Z'),
            },
          ],
          [TENANT_B_ID]: [
            {
              id: 'stuck-in-b',
              status: 'running',
              updated_at: new Date('2026-04-01T11:50:00.000Z'),
            },
          ],
        },
      });
      // Make tenant A's transaction throw, tenant B succeed.
      let txCall = 0;
      prisma.$transaction.mockImplementation(async (callback: never) => {
        txCall++;
        if (txCall === 1) throw new Error('tenant A exploded');
        const cb = callback as unknown as (tx: {
          $executeRaw: jest.Mock;
          schedulingRun: { findMany: jest.Mock; update: jest.Mock };
        }) => Promise<unknown>;
        return cb({
          $executeRaw: jest.fn().mockResolvedValue(undefined),
          schedulingRun: {
            findMany: jest.fn().mockResolvedValue([
              {
                id: 'stuck-in-b',
                status: 'running',
                updated_at: new Date('2026-04-01T11:50:00.000Z'),
              },
            ]),
            update: jest.fn().mockImplementation(({ where, data }) => {
              prisma.__updates.push({ tenantId: TENANT_B_ID, id: where.id, data });
              return { id: where.id };
            }),
          },
        });
      });

      const processor = new SchedulingStaleReaperJob(buildMockPrismaClient(prisma));
      const reaped = await processor.reapOnStartup();

      expect(reaped).toBe(1);
      expect(prisma.__updates.map((u) => u.id)).toEqual(['stuck-in-b']);
    });
  });
});
