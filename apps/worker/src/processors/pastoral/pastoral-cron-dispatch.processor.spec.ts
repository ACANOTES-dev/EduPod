import { type PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { OVERDUE_ACTIONS_JOB } from './overdue-actions.processor';
import {
  PASTORAL_CRON_DISPATCH_OVERDUE_JOB,
  PastoralCronDispatchProcessor,
} from './pastoral-cron-dispatch.processor';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

function buildJob(name: string): Job {
  return { data: {}, name } as Job;
}

function buildMockPrisma(tenants: Array<{ id: string }> = [{ id: TENANT_A }]) {
  return {
    tenant: {
      findMany: jest.fn().mockResolvedValue(tenants),
    },
  } as unknown as PrismaClient;
}

function buildMockQueue(): Queue {
  return { add: jest.fn().mockResolvedValue(undefined) } as unknown as Queue;
}

describe('PastoralCronDispatchProcessor', () => {
  let processor: PastoralCronDispatchProcessor;
  let prisma: PrismaClient;
  let queue: Queue;

  beforeEach(() => {
    prisma = buildMockPrisma();
    queue = buildMockQueue();
    processor = new PastoralCronDispatchProcessor(prisma, queue);
  });

  afterEach(() => jest.clearAllMocks());

  it('should skip unrelated jobs', async () => {
    await processor.process(buildJob('unrelated:job'));
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it('should dispatch overdue-actions job per active tenant', async () => {
    await processor.process(buildJob(PASTORAL_CRON_DISPATCH_OVERDUE_JOB));

    expect(prisma.tenant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active' }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(OVERDUE_ACTIONS_JOB, { tenant_id: TENANT_A });
  });

  it('should dispatch to all active tenants', async () => {
    prisma = buildMockPrisma([{ id: TENANT_A }, { id: TENANT_B }]);
    processor = new PastoralCronDispatchProcessor(prisma, queue);

    await processor.process(buildJob(PASTORAL_CRON_DISPATCH_OVERDUE_JOB));

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(OVERDUE_ACTIONS_JOB, { tenant_id: TENANT_A });
    expect(queue.add).toHaveBeenCalledWith(OVERDUE_ACTIONS_JOB, { tenant_id: TENANT_B });
  });

  it('should handle no active tenants gracefully', async () => {
    prisma = buildMockPrisma([]);
    processor = new PastoralCronDispatchProcessor(prisma, queue);

    await processor.process(buildJob(PASTORAL_CRON_DISPATCH_OVERDUE_JOB));

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('should continue dispatching if one tenant fails', async () => {
    prisma = buildMockPrisma([{ id: TENANT_A }, { id: TENANT_B }]);
    queue = buildMockQueue();
    (queue.add as jest.Mock)
      .mockRejectedValueOnce(new Error('Redis error'))
      .mockResolvedValueOnce(undefined);
    processor = new PastoralCronDispatchProcessor(prisma, queue);

    await processor.process(buildJob(PASTORAL_CRON_DISPATCH_OVERDUE_JOB));

    expect(queue.add).toHaveBeenCalledTimes(2);
  });
});
