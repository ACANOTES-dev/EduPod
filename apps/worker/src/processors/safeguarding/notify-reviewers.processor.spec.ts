import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  SAFEGUARDING_NOTIFY_REVIEWERS_JOB,
  SafeguardingNotifyReviewersProcessor,
  type SafeguardingNotifyReviewersPayload,
} from './notify-reviewers.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const MESSAGE_FLAG_ID = '22222222-2222-2222-2222-222222222222';
const MESSAGE_ID = '33333333-3333-3333-3333-333333333333';
const OWNER_ID = '44444444-4444-4444-4444-444444444444';
const PRINCIPAL_ID = '55555555-5555-5555-5555-555555555555';

function buildJob(
  name: string,
  data: Partial<SafeguardingNotifyReviewersPayload> = {},
): Job<SafeguardingNotifyReviewersPayload> {
  return {
    name,
    data: {
      tenant_id: TENANT_ID,
      message_flag_id: MESSAGE_FLAG_ID,
      ...data,
    },
  } as Job<SafeguardingNotifyReviewersPayload>;
}

function buildPrisma(opts: {
  reviewers?: Array<{ membership: { user_id: string } }>;
  flag?: { id: string; highest_severity: string; message_id: string } | null;
  existingNotification?: boolean;
}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    membershipRole: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          opts.reviewers ?? [
            { membership: { user_id: OWNER_ID } },
            { membership: { user_id: PRINCIPAL_ID } },
          ],
        ),
    },
    messageFlag: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.flag === undefined
            ? { id: MESSAGE_FLAG_ID, highest_severity: 'high', message_id: MESSAGE_ID }
            : opts.flag,
        ),
    },
    notification: {
      findFirst: jest.fn().mockResolvedValue(opts.existingNotification ? { id: 'x' } : null),
      create: jest.fn().mockResolvedValue({ id: 'notif-id' }),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (cb: (txArg: unknown) => Promise<unknown>) => cb(tx)),
  } as unknown as PrismaClient;

  return { prisma, tx };
}

describe('SafeguardingNotifyReviewersProcessor', () => {
  afterEach(() => jest.clearAllMocks());

  it('skips jobs with the wrong name', async () => {
    const { prisma } = buildPrisma({});
    const processor = new SafeguardingNotifyReviewersProcessor(prisma);
    await processor.process(buildJob('some:other-job'));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws when tenant_id or message_flag_id is missing', async () => {
    const { prisma } = buildPrisma({});
    const processor = new SafeguardingNotifyReviewersProcessor(prisma);
    await expect(
      processor.process({
        name: SAFEGUARDING_NOTIFY_REVIEWERS_JOB,
        data: { tenant_id: '', message_flag_id: '' },
      } as Job<SafeguardingNotifyReviewersPayload>),
    ).rejects.toThrow(/missing tenant_id/);
  });

  it('creates one in-app notification per admin-tier reviewer', async () => {
    const { prisma, tx } = buildPrisma({});
    const processor = new SafeguardingNotifyReviewersProcessor(prisma);
    await processor.process(buildJob(SAFEGUARDING_NOTIFY_REVIEWERS_JOB));

    expect(tx.notification.create).toHaveBeenCalledTimes(2);
    const firstArgs = tx.notification.create.mock.calls[0][0];
    expect(firstArgs.data.channel).toBe('in_app');
    expect(firstArgs.data.template_key).toBe('safeguarding.flag.new');
    expect(firstArgs.data.source_entity_type).toBe('safeguarding_flag');
    expect(firstArgs.data.source_entity_id).toBe(MESSAGE_FLAG_ID);
  });

  it('skips reviewers who already have a notification (idempotent)', async () => {
    const { prisma, tx } = buildPrisma({ existingNotification: true });
    const processor = new SafeguardingNotifyReviewersProcessor(prisma);
    await processor.process(buildJob(SAFEGUARDING_NOTIFY_REVIEWERS_JOB));
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('returns early when the flag has been cleared before processing', async () => {
    const { prisma, tx } = buildPrisma({ flag: null });
    const processor = new SafeguardingNotifyReviewersProcessor(prisma);
    await processor.process(buildJob(SAFEGUARDING_NOTIFY_REVIEWERS_JOB));
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('returns early when no admin-tier reviewers are configured', async () => {
    const { prisma, tx } = buildPrisma({ reviewers: [] });
    const processor = new SafeguardingNotifyReviewersProcessor(prisma);
    await processor.process(buildJob(SAFEGUARDING_NOTIFY_REVIEWERS_JOB));
    expect(tx.messageFlag.findFirst).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('deduplicates reviewers with overlapping roles', async () => {
    const { prisma, tx } = buildPrisma({
      reviewers: [
        { membership: { user_id: OWNER_ID } },
        { membership: { user_id: OWNER_ID } },
        { membership: { user_id: PRINCIPAL_ID } },
      ],
    });
    const processor = new SafeguardingNotifyReviewersProcessor(prisma);
    await processor.process(buildJob(SAFEGUARDING_NOTIFY_REVIEWERS_JOB));
    expect(tx.notification.create).toHaveBeenCalledTimes(2);
  });
});
