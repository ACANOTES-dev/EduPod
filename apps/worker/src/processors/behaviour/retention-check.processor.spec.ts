import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  BEHAVIOUR_RETENTION_CHECK_JOB,
  type RetentionCheckPayload,
  RetentionCheckProcessor,
} from './retention-check.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

function buildJob(
  name: string,
  data: Partial<RetentionCheckPayload> = {},
): Job<RetentionCheckPayload> {
  return {
    data: {
      dry_run: true,
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<RetentionCheckPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    behaviourEntityHistory: {
      create: jest.fn().mockResolvedValue({ id: 'history-id' }),
    },
    behaviourExclusionCase: {
      count: jest.fn().mockResolvedValue(2),
    },
    behaviourGuardianRestriction: {
      count: jest.fn().mockResolvedValue(4),
      updateMany: jest.fn().mockResolvedValue({ count: 4 }),
    },
    behaviourIncident: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'incident-id' }),
    },
    behaviourIncidentParticipant: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'participant-id' }),
    },
    behaviourIntervention: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'intervention-id' }),
    },
    behaviourLegalHold: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    behaviourSanction: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'sanction-id' }),
    },
    safeguardingConcern: {
      count: jest.fn().mockResolvedValue(3),
    },
    student: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue({
        settings: {
          behaviour: {},
        },
      }),
    },
  };
}

function buildMockPrisma(tx: ReturnType<typeof buildMockTx>) {
  return {
    $transaction: jest.fn(async (callback: (transactionClient: typeof tx) => Promise<void>) =>
      callback(tx),
    ),
  } as unknown as PrismaClient;
}

describe('RetentionCheckProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new RetentionCheckProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('behaviour:other-job'));

    expect(tx.tenantSetting.findFirst).not.toHaveBeenCalled();
  });

  it('should use count-based expiry in dry-run mode without mutating restrictions', async () => {
    const tx = buildMockTx();
    const processor = new RetentionCheckProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(BEHAVIOUR_RETENTION_CHECK_JOB));

    expect(tx.behaviourGuardianRestriction.count).toHaveBeenCalledWith({
      where: {
        effective_until: { lt: expect.any(Date) },
        status: 'active_restriction',
        tenant_id: TENANT_ID,
      },
    });
    expect(tx.behaviourGuardianRestriction.updateMany).not.toHaveBeenCalled();
    expect(tx.behaviourExclusionCase.count).toHaveBeenCalled();
    expect(tx.safeguardingConcern.count).toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const processor = new RetentionCheckProcessor(buildMockPrisma(buildMockTx()));

    await expect(
      processor.process(buildJob(BEHAVIOUR_RETENTION_CHECK_JOB, { tenant_id: undefined })),
    ).rejects.toThrow('missing tenant_id');
  });
});
