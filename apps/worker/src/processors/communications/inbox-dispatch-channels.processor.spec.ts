import type { PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { DISPATCH_NOTIFICATIONS_JOB } from './dispatch-notifications.processor';
import {
  INBOX_DISPATCH_CHANNELS_JOB,
  InboxDispatchChannelsPayload,
  InboxDispatchChannelsProcessor,
} from './inbox-dispatch-channels.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CONVERSATION_ID = '22222222-2222-2222-2222-222222222222';
const MESSAGE_ID = '33333333-3333-3333-3333-333333333333';
const SENDER_ID = '44444444-4444-4444-4444-444444444444';
const R1 = '55555555-5555-5555-5555-555555555555';
const R2 = '66666666-6666-6666-6666-666666666666';

// ─── Mock builders ──────────────────────────────────────────────────────────

function buildMockTx(
  overrides: {
    message?: { id: string; body: string } | null;
    conversation?: { id: string; subject: string | null; kind: string } | null;
    createdIds?: string[];
  } = {},
) {
  const message =
    'message' in overrides
      ? overrides.message
      : { id: MESSAGE_ID, body: 'hello world', sender_user_id: SENDER_ID, created_at: new Date() };
  const conversation =
    'conversation' in overrides
      ? overrides.conversation
      : { id: CONVERSATION_ID, subject: 'Snow day', kind: 'broadcast' };
  const createdIds = overrides.createdIds ?? ['n1', 'n2', 'n3', 'n4'];
  return {
    message: { findFirst: jest.fn().mockResolvedValue(message) },
    conversation: { findFirst: jest.fn().mockResolvedValue(conversation) },
    notification: {
      createMany: jest.fn().mockResolvedValue({ count: createdIds.length }),
      findMany: jest.fn().mockResolvedValue(createdIds.map((id) => ({ id }))),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx): PrismaClient {
  return {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  } as unknown as PrismaClient;
}

function buildMockQueue(): { queue: Queue; addMock: jest.Mock } {
  const addMock = jest.fn().mockResolvedValue({ id: 'new-job' });
  return { queue: { add: addMock } as unknown as Queue, addMock };
}

function buildJob(name: string, data: Partial<InboxDispatchChannelsPayload> = {}): Job {
  return {
    id: 'job-1',
    name,
    data: {
      tenant_id: TENANT_ID,
      conversation_id: CONVERSATION_ID,
      message_id: MESSAGE_ID,
      sender_user_id: SENDER_ID,
      recipient_user_ids: [R1, R2],
      extra_channels: ['sms', 'email'],
      disable_fallback: false,
      ...data,
    },
  } as unknown as Job;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('InboxDispatchChannelsProcessor', () => {
  afterEach(() => jest.clearAllMocks());

  it('ignores jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const prisma = buildMockPrisma(mockTx);
    const { queue, addMock } = buildMockQueue();

    const processor = new InboxDispatchChannelsProcessor(prisma, queue);
    await processor.process(buildJob('unrelated:job'));

    expect(mockTx.notification.createMany).not.toHaveBeenCalled();
    expect(addMock).not.toHaveBeenCalled();
  });

  it('rejects jobs missing tenant_id', async () => {
    const mockTx = buildMockTx();
    const prisma = buildMockPrisma(mockTx);
    const { queue } = buildMockQueue();

    const processor = new InboxDispatchChannelsProcessor(prisma, queue);
    const job = buildJob(INBOX_DISPATCH_CHANNELS_JOB, {
      tenant_id: undefined as unknown as string,
    });

    await expect(processor.process(job)).rejects.toThrow(/tenant_id/);
  });

  it('skips dispatch when recipients list is empty', async () => {
    const mockTx = buildMockTx();
    const prisma = buildMockPrisma(mockTx);
    const { queue, addMock } = buildMockQueue();

    const processor = new InboxDispatchChannelsProcessor(prisma, queue);
    await processor.process(buildJob(INBOX_DISPATCH_CHANNELS_JOB, { recipient_user_ids: [] }));

    expect(mockTx.notification.createMany).not.toHaveBeenCalled();
    expect(addMock).not.toHaveBeenCalled();
  });

  it('skips dispatch when extra_channels is empty', async () => {
    const mockTx = buildMockTx();
    const prisma = buildMockPrisma(mockTx);
    const { queue, addMock } = buildMockQueue();

    const processor = new InboxDispatchChannelsProcessor(prisma, queue);
    await processor.process(buildJob(INBOX_DISPATCH_CHANNELS_JOB, { extra_channels: [] }));

    expect(mockTx.notification.createMany).not.toHaveBeenCalled();
    expect(addMock).not.toHaveBeenCalled();
  });

  it('creates notification rows for each recipient × channel and hands off to the dispatcher', async () => {
    const mockTx = buildMockTx();
    const prisma = buildMockPrisma(mockTx);
    const { queue, addMock } = buildMockQueue();

    const processor = new InboxDispatchChannelsProcessor(prisma, queue);
    await processor.process(buildJob(INBOX_DISPATCH_CHANNELS_JOB));

    expect(mockTx.notification.createMany).toHaveBeenCalledTimes(1);
    const rows = mockTx.notification.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(4);
    expect(rows.map((r: { channel: string }) => r.channel).sort()).toEqual([
      'email',
      'email',
      'sms',
      'sms',
    ]);
    expect(rows[0].source_entity_type).toBe('inbox_message');
    expect(rows[0].source_entity_id).toBe(MESSAGE_ID);
    expect(rows[0].status).toBe('queued');
    expect(rows[0].template_key).toBe('inbox.message');

    // Forwards to DISPATCH_NOTIFICATIONS_JOB
    expect(addMock).toHaveBeenCalledTimes(1);
    const [jobName, payload] = addMock.mock.calls[0];
    expect(jobName).toBe(DISPATCH_NOTIFICATIONS_JOB);
    expect(payload.tenant_id).toBe(TENANT_ID);
    expect(payload.notification_ids).toEqual(['n1', 'n2', 'n3', 'n4']);
  });

  it('does not enqueue dispatch when message is missing', async () => {
    const mockTx = buildMockTx({ message: null });
    const prisma = buildMockPrisma(mockTx);
    const { queue, addMock } = buildMockQueue();

    const processor = new InboxDispatchChannelsProcessor(prisma, queue);
    await processor.process(buildJob(INBOX_DISPATCH_CHANNELS_JOB));

    expect(mockTx.notification.createMany).not.toHaveBeenCalled();
    expect(addMock).not.toHaveBeenCalled();
  });

  it('does not enqueue dispatch when conversation is missing', async () => {
    const mockTx = buildMockTx({ conversation: null });
    const prisma = buildMockPrisma(mockTx);
    const { queue, addMock } = buildMockQueue();

    const processor = new InboxDispatchChannelsProcessor(prisma, queue);
    await processor.process(buildJob(INBOX_DISPATCH_CHANNELS_JOB));

    expect(mockTx.notification.createMany).not.toHaveBeenCalled();
    expect(addMock).not.toHaveBeenCalled();
  });
});
