import { Job, Queue } from 'bullmq';

import {
  INBOX_FALLBACK_CHECK_JOB,
  InboxFallbackCheckProcessor,
} from './inbox-fallback-check.processor';
import { INBOX_FALLBACK_SCAN_TENANT_JOB } from './inbox-fallback-scan-tenant.processor';

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';

function buildMockPrisma() {
  return {
    tenantSettingsInbox: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

type MockPrisma = ReturnType<typeof buildMockPrisma>;

function buildMockQueue() {
  return { add: jest.fn().mockResolvedValue(undefined) } as unknown as Queue & {
    add: jest.Mock;
  };
}

function buildJob(name: string = INBOX_FALLBACK_CHECK_JOB): Job {
  return { data: {}, name } as unknown as Job;
}

describe('InboxFallbackCheckProcessor', () => {
  let prisma: MockPrisma;
  let queue: Queue & { add: jest.Mock };
  let processor: InboxFallbackCheckProcessor;

  beforeEach(() => {
    prisma = buildMockPrisma();
    queue = buildMockQueue();
    processor = new InboxFallbackCheckProcessor(prisma as never, queue);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('ignores jobs with a different name', async () => {
    await processor.process(buildJob('inbox:something-else'));

    expect(prisma.tenantSettingsInbox.findMany).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('skips fan-out when no tenant has fallback enabled', async () => {
    prisma.tenantSettingsInbox.findMany.mockResolvedValue([]);

    await processor.process(buildJob());

    expect(prisma.tenantSettingsInbox.findMany).toHaveBeenCalledWith({
      where: {
        messaging_enabled: true,
        OR: [{ fallback_admin_enabled: true }, { fallback_teacher_enabled: true }],
      },
      select: { tenant_id: true },
    });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('fans out one per-tenant scan job per eligible tenant', async () => {
    prisma.tenantSettingsInbox.findMany.mockResolvedValue([
      { tenant_id: TENANT_A_ID },
      { tenant_id: TENANT_B_ID },
    ]);

    await processor.process(buildJob());

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      INBOX_FALLBACK_SCAN_TENANT_JOB,
      { tenant_id: TENANT_A_ID },
      expect.objectContaining({ removeOnComplete: 50, removeOnFail: 100 }),
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      INBOX_FALLBACK_SCAN_TENANT_JOB,
      { tenant_id: TENANT_B_ID },
      expect.objectContaining({ removeOnComplete: 50, removeOnFail: 100 }),
    );
  });

  it('only queries tenants where messaging is enabled and at least one fallback bucket is on', async () => {
    // Implicit test — the `where` clause has already been asserted in the
    // "skips fan-out" case. This case locks the shape so a future refactor
    // that drops the OR or the messaging_enabled filter fails loudly.
    prisma.tenantSettingsInbox.findMany.mockResolvedValue([{ tenant_id: TENANT_A_ID }]);

    await processor.process(buildJob());

    const [[callArgs]] = prisma.tenantSettingsInbox.findMany.mock.calls;
    expect(callArgs.where).toEqual({
      messaging_enabled: true,
      OR: [{ fallback_admin_enabled: true }, { fallback_teacher_enabled: true }],
    });
  });
});
