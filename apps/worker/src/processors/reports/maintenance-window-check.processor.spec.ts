import type { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';

import {
  TENANT_MAINTENANCE_WINDOW_CHECK_JOB,
  TenantMaintenanceWindowCheckProcessor,
} from './maintenance-window-check.processor';

jest.mock('../../base/redis.helpers', () => ({
  getRedisClient: jest.fn(() => redis),
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

const redis = {
  del: jest.fn().mockResolvedValue(1),
  set: jest.fn().mockResolvedValue('OK'),
};

function buildJob(name = TENANT_MAINTENANCE_WINDOW_CHECK_JOB): Job {
  return { data: {}, id: 'job-1', name } as unknown as Job;
}

function buildPrisma(): PrismaClient {
  return {
    tenant: {
      update: jest.fn().mockResolvedValue({}),
    },
    tenantMaintenanceWindow: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest
        .fn()
        .mockResolvedValueOnce([{ message: 'Window start', tenant_id: TENANT_ID }])
        .mockResolvedValueOnce([{ tenant_id: TENANT_ID }]),
    },
  } as unknown as PrismaClient;
}

describe('TenantMaintenanceWindowCheckProcessor', () => {
  let prisma: PrismaClient;
  let processor: TenantMaintenanceWindowCheckProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = buildPrisma();
    processor = new TenantMaintenanceWindowCheckProcessor(prisma);
  });

  it('enables and disables tenant maintenance windows', async () => {
    await processor.process(buildJob());

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      data: { maintenance_message: 'Window start', maintenance_mode: true },
    });
    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: TENANT_ID },
      data: { maintenance_message: null, maintenance_mode: false },
    });
    expect(redis.set).toHaveBeenCalledWith(
      `tenant:${TENANT_ID}:maintenance`,
      JSON.stringify({ message: 'Window start' }),
    );
    expect(redis.del).toHaveBeenCalledWith(`tenant:${TENANT_ID}:maintenance`);
  });

  it('ignores other reports queue job names', async () => {
    await processor.process(buildJob('reports:scheduled-run'));

    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });
});
