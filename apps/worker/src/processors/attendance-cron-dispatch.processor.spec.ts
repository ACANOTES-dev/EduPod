import { Job, Queue } from 'bullmq';

import { ATTENDANCE_AUTO_LOCK_JOB } from './attendance-auto-lock.processor';
import {
  ATTENDANCE_CRON_DISPATCH_GENERATE_JOB,
  ATTENDANCE_CRON_DISPATCH_LOCK_JOB,
  ATTENDANCE_CRON_DISPATCH_PATTERNS_JOB,
  ATTENDANCE_CRON_DISPATCH_PENDING_JOB,
  AttendanceCronDispatchProcessor,
} from './attendance-cron-dispatch.processor';
import { ATTENDANCE_DETECT_PATTERNS_JOB } from './attendance-pattern-detection.processor';
import { ATTENDANCE_DETECT_PENDING_JOB } from './attendance-pending-detection.processor';
import { ATTENDANCE_GENERATE_SESSIONS_JOB } from './attendance-session-generation.processor';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

function buildMockPrisma() {
  return {
    tenant: {
      findMany: jest.fn().mockResolvedValue([{ id: TENANT_A }, { id: TENANT_B }]),
    },
  };
}

function buildMockQueue(): Pick<Queue, 'add'> {
  return {
    add: jest.fn().mockResolvedValue(undefined),
  } as unknown as Pick<Queue, 'add'>;
}

describe('AttendanceCronDispatchProcessor', () => {
  afterEach(() => jest.clearAllMocks());

  it('dispatches generate-sessions for every active tenant', async () => {
    const prisma = buildMockPrisma();
    const queue = buildMockQueue();
    const processor = new AttendanceCronDispatchProcessor(prisma as never, queue as never);

    await processor.process({
      name: ATTENDANCE_CRON_DISPATCH_GENERATE_JOB,
      data: {},
    } as Job);

    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: { status: 'active' },
      select: { id: true },
    });
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      ATTENDANCE_GENERATE_SESSIONS_JOB,
      expect.objectContaining({ tenant_id: TENANT_A, date: expect.any(String) }),
      expect.any(Object),
    );
    expect(queue.add).toHaveBeenCalledWith(
      ATTENDANCE_GENERATE_SESSIONS_JOB,
      expect.objectContaining({ tenant_id: TENANT_B, date: expect.any(String) }),
      expect.any(Object),
    );
  });

  it('dispatches auto-lock for every active tenant', async () => {
    const prisma = buildMockPrisma();
    const queue = buildMockQueue();
    const processor = new AttendanceCronDispatchProcessor(prisma as never, queue as never);

    await processor.process({ name: ATTENDANCE_CRON_DISPATCH_LOCK_JOB, data: {} } as Job);

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      ATTENDANCE_AUTO_LOCK_JOB,
      { tenant_id: TENANT_A },
      expect.any(Object),
    );
    expect(queue.add).toHaveBeenCalledWith(
      ATTENDANCE_AUTO_LOCK_JOB,
      { tenant_id: TENANT_B },
      expect.any(Object),
    );
  });

  it('dispatches detect-patterns for every active tenant', async () => {
    const prisma = buildMockPrisma();
    const queue = buildMockQueue();
    const processor = new AttendanceCronDispatchProcessor(prisma as never, queue as never);

    await processor.process({
      name: ATTENDANCE_CRON_DISPATCH_PATTERNS_JOB,
      data: {},
    } as Job);

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      ATTENDANCE_DETECT_PATTERNS_JOB,
      { tenant_id: TENANT_A },
      expect.any(Object),
    );
  });

  it('dispatches detect-pending for every active tenant with today date', async () => {
    const prisma = buildMockPrisma();
    const queue = buildMockQueue();
    const processor = new AttendanceCronDispatchProcessor(prisma as never, queue as never);

    await processor.process({
      name: ATTENDANCE_CRON_DISPATCH_PENDING_JOB,
      data: {},
    } as Job);

    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      ATTENDANCE_DETECT_PENDING_JOB,
      expect.objectContaining({ tenant_id: TENANT_A, date: expect.any(String) }),
      expect.any(Object),
    );
  });

  it('throws loudly on unrelated job names (dispatcher is authoritative)', async () => {
    const prisma = buildMockPrisma();
    const queue = buildMockQueue();
    const processor = new AttendanceCronDispatchProcessor(prisma as never, queue as never);

    await expect(
      processor.process({ name: 'some:unrelated-job', data: {} } as Job),
    ).rejects.toThrow('Unknown attendance cron-dispatch job name');

    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues nothing when there are no active tenants', async () => {
    const prisma = buildMockPrisma();
    prisma.tenant.findMany.mockResolvedValueOnce([]);
    const queue = buildMockQueue();
    const processor = new AttendanceCronDispatchProcessor(prisma as never, queue as never);

    await processor.process({
      name: ATTENDANCE_CRON_DISPATCH_GENERATE_JOB,
      data: {},
    } as Job);

    expect(queue.add).not.toHaveBeenCalled();
  });
});
