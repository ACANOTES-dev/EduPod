import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { KEY_ROTATION_JOB, KeyRotationProcessor } from './key-rotation.processor';

const HEX_KEY_V1 = '11'.repeat(32);
const HEX_KEY_V2 = '22'.repeat(32);

function buildJob(name: string, data: Record<string, unknown> = {}): Job {
  return {
    data,
    name,
    updateProgress: jest.fn().mockResolvedValue(undefined),
  } as unknown as Job;
}

function buildMockPrisma() {
  return {
    staffProfile: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'staff-id' }),
    },
    tenantStripeConfig: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'stripe-id' }),
    },
  };
}

describe('KeyRotationProcessor', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      ENCRYPTION_CURRENT_VERSION: '2',
      ENCRYPTION_KEY_V1: HEX_KEY_V1,
      ENCRYPTION_KEY_V2: HEX_KEY_V2,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const prisma = buildMockPrisma();
    const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);

    await processor.process(buildJob('security:other-job'));

    expect(prisma.tenantStripeConfig.findMany).not.toHaveBeenCalled();
    expect(prisma.staffProfile.findMany).not.toHaveBeenCalled();
  });

  it('should fail fast when the current key version is not available', async () => {
    const prisma = buildMockPrisma();
    const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
    process.env.ENCRYPTION_CURRENT_VERSION = '3';

    await expect(processor.process(buildJob(KEY_ROTATION_JOB))).rejects.toThrow(
      'current encryption key version 3 not available',
    );
  });

  it('should support dry-run rotation without mutating encrypted rows', async () => {
    const prisma = buildMockPrisma();
    const processor = new KeyRotationProcessor(prisma as unknown as PrismaClient);
    const job = buildJob(KEY_ROTATION_JOB, { dry_run: true });

    await processor.process(job);

    expect(prisma.tenantStripeConfig.findMany).toHaveBeenCalled();
    expect(prisma.staffProfile.findMany).toHaveBeenCalled();
    expect(prisma.tenantStripeConfig.update).not.toHaveBeenCalled();
    expect(prisma.staffProfile.update).not.toHaveBeenCalled();
    expect(job.updateProgress).toHaveBeenCalledWith(100);
  });
});
