import { type PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { SYSTEM_USER_SENTINEL } from '../../base/tenant-aware-job';

import {
  SAFEGUARDING_NOTIFY_REVIEWERS_JOB,
  SAFEGUARDING_SCAN_MESSAGE_JOB,
  SafeguardingScanMessageProcessor,
  type SafeguardingScanMessagePayload,
} from './message-scan.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CONVERSATION_ID = '22222222-2222-2222-2222-222222222222';
const MESSAGE_ID = '33333333-3333-3333-3333-333333333333';
const USER_ID = '44444444-4444-4444-4444-444444444444';
const FLAG_ID = '55555555-5555-5555-5555-555555555555';

function buildJob(
  name: string,
  data: Partial<SafeguardingScanMessagePayload> = {},
): Job<SafeguardingScanMessagePayload> {
  return {
    name,
    data: {
      tenant_id: TENANT_ID,
      conversation_id: CONVERSATION_ID,
      message_id: MESSAGE_ID,
      ...data,
    },
  } as Job<SafeguardingScanMessagePayload>;
}

function buildPrisma(opts: {
  message?: {
    id: string;
    body: string;
    sender_user_id: string;
    deleted_at: Date | null;
  } | null;
  keywords?: Array<{ keyword: string; severity: 'low' | 'medium' | 'high'; category: string }>;
  existingFlag?: { id: string } | null;
}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    message: {
      findFirst: jest
        .fn()
        .mockResolvedValue(opts.message === undefined ? buildMessage() : opts.message),
    },
    safeguardingKeyword: {
      findMany: jest.fn().mockResolvedValue(opts.keywords ?? []),
    },
    messageFlag: {
      findFirst: jest.fn().mockResolvedValue(opts.existingFlag ?? null),
      create: jest.fn().mockResolvedValue({ id: FLAG_ID }),
      update: jest.fn().mockResolvedValue({ id: FLAG_ID }),
      delete: jest.fn().mockResolvedValue(undefined),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (cb: (txArg: unknown) => Promise<unknown>) => cb(tx)),
  } as unknown as PrismaClient;

  return { prisma, tx };
}

function buildMessage(
  overrides: Partial<{
    id: string;
    body: string;
    sender_user_id: string;
    deleted_at: Date | null;
  }> = {},
) {
  return {
    id: MESSAGE_ID,
    body: 'Nothing to see here',
    sender_user_id: USER_ID,
    deleted_at: null as Date | null,
    ...overrides,
  };
}

function buildQueue() {
  return { add: jest.fn().mockResolvedValue(undefined) } as unknown as Queue;
}

describe('SafeguardingScanMessageProcessor', () => {
  afterEach(() => jest.clearAllMocks());

  it('skips jobs with the wrong name', async () => {
    const { prisma } = buildPrisma({});
    const queue = buildQueue();
    const processor = new SafeguardingScanMessageProcessor(prisma, queue);
    await processor.process(buildJob('some:other-job'));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws when tenant_id or message_id is missing', async () => {
    const { prisma } = buildPrisma({});
    const queue = buildQueue();
    const processor = new SafeguardingScanMessageProcessor(prisma, queue);
    await expect(
      processor.process({
        name: SAFEGUARDING_SCAN_MESSAGE_JOB,
        data: { tenant_id: '', conversation_id: CONVERSATION_ID, message_id: '' },
      } as Job<SafeguardingScanMessagePayload>),
    ).rejects.toThrow(/missing tenant_id/);
  });

  it('skips if the message is not found', async () => {
    const { prisma, tx } = buildPrisma({ message: null });
    const queue = buildQueue();
    const processor = new SafeguardingScanMessageProcessor(prisma, queue);
    await processor.process(buildJob(SAFEGUARDING_SCAN_MESSAGE_JOB));
    expect(tx.safeguardingKeyword.findMany).not.toHaveBeenCalled();
    expect(tx.messageFlag.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('skips soft-deleted messages', async () => {
    const { prisma, tx } = buildPrisma({
      message: buildMessage({ deleted_at: new Date() }),
    });
    const queue = buildQueue();
    const processor = new SafeguardingScanMessageProcessor(prisma, queue);
    await processor.process(buildJob(SAFEGUARDING_SCAN_MESSAGE_JOB));
    expect(tx.safeguardingKeyword.findMany).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('skips system-authored messages', async () => {
    const { prisma, tx } = buildPrisma({
      message: buildMessage({ sender_user_id: SYSTEM_USER_SENTINEL }),
    });
    const queue = buildQueue();
    const processor = new SafeguardingScanMessageProcessor(prisma, queue);
    await processor.process(buildJob(SAFEGUARDING_SCAN_MESSAGE_JOB));
    expect(tx.safeguardingKeyword.findMany).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('creates a flag and enqueues notify-reviewers on a match', async () => {
    const { prisma, tx } = buildPrisma({
      message: buildMessage({ body: 'someone is going to bully me' }),
      keywords: [{ keyword: 'bully', severity: 'high', category: 'bullying' }],
    });
    const queue = buildQueue();
    const processor = new SafeguardingScanMessageProcessor(prisma, queue);
    await processor.process(buildJob(SAFEGUARDING_SCAN_MESSAGE_JOB));

    expect(tx.messageFlag.create).toHaveBeenCalledTimes(1);
    const createArgs = tx.messageFlag.create.mock.calls[0][0];
    expect(createArgs.data.matched_keywords).toContain('bully');
    expect(createArgs.data.highest_severity).toBe('high');
    expect(createArgs.data.review_state).toBe('pending');

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      SAFEGUARDING_NOTIFY_REVIEWERS_JOB,
      expect.objectContaining({ tenant_id: TENANT_ID, message_flag_id: FLAG_ID }),
      expect.any(Object),
    );
  });

  it('updates an existing flag when one is already present', async () => {
    const { prisma, tx } = buildPrisma({
      message: buildMessage({ body: 'bully everywhere' }),
      keywords: [{ keyword: 'bully', severity: 'medium', category: 'bullying' }],
      existingFlag: { id: FLAG_ID },
    });
    const queue = buildQueue();
    const processor = new SafeguardingScanMessageProcessor(prisma, queue);
    await processor.process(buildJob(SAFEGUARDING_SCAN_MESSAGE_JOB));

    expect(tx.messageFlag.create).not.toHaveBeenCalled();
    expect(tx.messageFlag.update).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('deletes an existing flag when a rescan has zero matches', async () => {
    const { prisma, tx } = buildPrisma({
      message: buildMessage({ body: 'nothing bad at all' }),
      keywords: [{ keyword: 'bully', severity: 'medium', category: 'bullying' }],
      existingFlag: { id: FLAG_ID },
    });
    const queue = buildQueue();
    const processor = new SafeguardingScanMessageProcessor(prisma, queue);
    await processor.process(buildJob(SAFEGUARDING_SCAN_MESSAGE_JOB));

    expect(tx.messageFlag.delete).toHaveBeenCalledWith({ where: { id: FLAG_ID } });
    expect(tx.messageFlag.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('does nothing when there are zero matches and no existing flag', async () => {
    const { prisma, tx } = buildPrisma({
      message: buildMessage({ body: 'nothing bad' }),
      keywords: [{ keyword: 'bully', severity: 'medium', category: 'bullying' }],
    });
    const queue = buildQueue();
    const processor = new SafeguardingScanMessageProcessor(prisma, queue);
    await processor.process(buildJob(SAFEGUARDING_SCAN_MESSAGE_JOB));

    expect(tx.messageFlag.create).not.toHaveBeenCalled();
    expect(tx.messageFlag.delete).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
