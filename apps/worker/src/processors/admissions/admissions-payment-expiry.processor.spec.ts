import { type PrismaClient } from '@prisma/client';
import { Job, type Queue } from 'bullmq';

import {
  ADMISSIONS_PAYMENT_EXPIRED_NOTIFICATION_JOB,
  ADMISSIONS_PAYMENT_EXPIRY_JOB,
  AdmissionsPaymentExpiryProcessor,
} from './admissions-payment-expiry.processor';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const APP_A1 = '11111111-1111-1111-1111-111111111111';
const APP_A2 = '22222222-2222-2222-2222-222222222222';
const APP_B1 = '33333333-3333-3333-3333-333333333333';
const ACADEMIC_YEAR_ID = '44444444-4444-4444-4444-444444444444';
const YEAR_GROUP_ID = '55555555-5555-5555-5555-555555555555';
const REVIEWER_ID = '66666666-6666-6666-6666-666666666666';
const WAITING_APP = '77777777-7777-7777-7777-777777777777';
const CLASS_ID = '88888888-8888-8888-8888-888888888888';
const STUDENT_ID = '99999999-9999-9999-9999-999999999999';

const NOW = new Date('2026-04-11T12:00:00.000Z');

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildJob(name: string): Job {
  return { name, data: {} } as Job;
}

interface MockTx {
  $executeRaw: jest.Mock;
  application: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  applicationNote: {
    create: jest.Mock;
  };
  class: {
    findMany: jest.Mock;
  };
  classEnrolment: {
    findMany: jest.Mock;
  };
}

function buildTx(): MockTx {
  return {
    $executeRaw: jest.fn().mockResolvedValue(1),
    application: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    applicationNote: {
      create: jest.fn().mockResolvedValue({}),
    },
    class: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    classEnrolment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

interface MockPrisma {
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
  _tx: MockTx;
}

function buildPrisma(): MockPrisma {
  const tx = buildTx();
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(async (callback: (t: MockTx) => Promise<unknown>) => callback(tx)),
    _tx: tx,
  };
  return prisma as MockPrisma;
}

function buildQueue(): { queue: Queue; add: jest.Mock } {
  const add = jest.fn().mockResolvedValue(undefined);
  return { queue: { add } as unknown as Queue, add };
}

function buildProcessor(prisma: MockPrisma, queue: Queue): AdmissionsPaymentExpiryProcessor {
  return new AdmissionsPaymentExpiryProcessor(prisma as unknown as PrismaClient, queue);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('AdmissionsPaymentExpiryProcessor', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('ignores jobs with a different name', async () => {
    const prisma = buildPrisma();
    const { queue } = buildQueue();
    const processor = buildProcessor(prisma, queue);

    await processor.process(buildJob('admissions:something-else'));

    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('exits cleanly when no expired applications are found', async () => {
    const prisma = buildPrisma();
    prisma.$queryRaw.mockResolvedValue([]);
    const { queue } = buildQueue();
    const processor = buildProcessor(prisma, queue);

    await processor.process(buildJob(ADMISSIONS_PAYMENT_EXPIRY_JOB));

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reverts an expired application and fires the notification', async () => {
    const prisma = buildPrisma();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: APP_A1,
        tenant_id: TENANT_A,
        target_academic_year_id: ACADEMIC_YEAR_ID,
        target_year_group_id: YEAR_GROUP_ID,
      },
    ]);
    prisma._tx.application.findFirst.mockResolvedValue({
      id: APP_A1,
      reviewed_by_user_id: REVIEWER_ID,
      payment_deadline: new Date('2026-04-10T00:00:00.000Z'),
    });
    prisma._tx.class.findMany.mockResolvedValue([{ id: CLASS_ID, max_capacity: 25 }]);
    prisma._tx.classEnrolment.findMany.mockResolvedValue(
      Array.from({ length: 25 }, () => ({ student_id: STUDENT_ID })),
    );
    prisma._tx.application.count.mockResolvedValue(0);
    prisma._tx.application.findMany.mockResolvedValue([]);

    const { queue, add } = buildQueue();
    const processor = buildProcessor(prisma, queue);

    await processor.process(buildJob(ADMISSIONS_PAYMENT_EXPIRY_JOB));

    expect(prisma._tx.application.update).toHaveBeenCalledWith({
      where: { id: APP_A1 },
      data: {
        status: 'waiting_list',
        waiting_list_substatus: null,
        payment_amount_cents: null,
        payment_deadline: null,
      },
    });
    expect(prisma._tx.applicationNote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenant_id: TENANT_A,
        application_id: APP_A1,
        author_user_id: REVIEWER_ID,
        is_internal: true,
        note: expect.stringContaining('Reverted to waiting list'),
      }),
    });
    expect(add).toHaveBeenCalledWith(
      ADMISSIONS_PAYMENT_EXPIRED_NOTIFICATION_JOB,
      { tenant_id: TENANT_A, application_id: APP_A1 },
      expect.objectContaining({ attempts: 3 }),
    );
  });

  it('promotes waiting-list applications FIFO into freed seats after a revert', async () => {
    const prisma = buildPrisma();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: APP_A1,
        tenant_id: TENANT_A,
        target_academic_year_id: ACADEMIC_YEAR_ID,
        target_year_group_id: YEAR_GROUP_ID,
      },
    ]);
    // Revert phase
    prisma._tx.application.findFirst.mockResolvedValueOnce({
      id: APP_A1,
      reviewed_by_user_id: REVIEWER_ID,
      payment_deadline: new Date('2026-04-10T00:00:00.000Z'),
    });
    // Promotion phase: 25 seats, 24 enrolled, 0 conditional => 1 seat free
    prisma._tx.class.findMany.mockResolvedValue([{ id: CLASS_ID, max_capacity: 25 }]);
    prisma._tx.classEnrolment.findMany.mockResolvedValue(
      Array.from({ length: 24 }, (_, i) => ({ student_id: `student-${i}` })),
    );
    prisma._tx.application.count.mockResolvedValue(0);
    // Waiting-list FIFO candidate
    prisma._tx.application.findMany.mockResolvedValue([{ id: WAITING_APP }]);

    const { queue } = buildQueue();
    const processor = buildProcessor(prisma, queue);

    await processor.process(buildJob(ADMISSIONS_PAYMENT_EXPIRY_JOB));

    // Revert update + promote update = 2 application.update calls
    expect(prisma._tx.application.update).toHaveBeenCalledTimes(2);
    expect(prisma._tx.application.update).toHaveBeenNthCalledWith(2, {
      where: { id: WAITING_APP },
      data: { status: 'ready_to_admit' },
    });

    // Waiting list query must skip awaiting_year_setup rows and take = available
    expect(prisma._tx.application.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_A,
          target_academic_year_id: ACADEMIC_YEAR_ID,
          target_year_group_id: YEAR_GROUP_ID,
          status: 'waiting_list',
          waiting_list_substatus: null,
        }),
        orderBy: { apply_date: 'asc' },
        take: 1,
      }),
    );

    // Promotion note attributed to the expired admin
    expect(prisma._tx.applicationNote.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        application_id: WAITING_APP,
        author_user_id: REVIEWER_ID,
        note: expect.stringContaining('Auto-promoted'),
      }),
    });
  });

  it('does not promote when no seats remain after conditional approvals are counted', async () => {
    const prisma = buildPrisma();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: APP_A1,
        tenant_id: TENANT_A,
        target_academic_year_id: ACADEMIC_YEAR_ID,
        target_year_group_id: YEAR_GROUP_ID,
      },
    ]);
    prisma._tx.application.findFirst.mockResolvedValueOnce({
      id: APP_A1,
      reviewed_by_user_id: REVIEWER_ID,
      payment_deadline: new Date('2026-04-10T00:00:00.000Z'),
    });
    // 25 seats, 20 enrolled, 5 conditional still held => 0 available
    prisma._tx.class.findMany.mockResolvedValue([{ id: CLASS_ID, max_capacity: 25 }]);
    prisma._tx.classEnrolment.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({ student_id: `student-${i}` })),
    );
    prisma._tx.application.count.mockResolvedValue(5);

    const { queue } = buildQueue();
    const processor = buildProcessor(prisma, queue);

    await processor.process(buildJob(ADMISSIONS_PAYMENT_EXPIRY_JOB));

    // The revert still happens — its update is call #1.
    expect(prisma._tx.application.update).toHaveBeenCalledTimes(1);
    // The waiting-list findMany must NOT be called when available = 0.
    expect(prisma._tx.application.findMany).not.toHaveBeenCalled();
  });

  it('skips promotion when the year group has no active classes', async () => {
    const prisma = buildPrisma();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: APP_A1,
        tenant_id: TENANT_A,
        target_academic_year_id: ACADEMIC_YEAR_ID,
        target_year_group_id: YEAR_GROUP_ID,
      },
    ]);
    prisma._tx.application.findFirst.mockResolvedValueOnce({
      id: APP_A1,
      reviewed_by_user_id: REVIEWER_ID,
      payment_deadline: new Date('2026-04-10T00:00:00.000Z'),
    });
    prisma._tx.class.findMany.mockResolvedValue([]);

    const { queue } = buildQueue();
    const processor = buildProcessor(prisma, queue);

    await processor.process(buildJob(ADMISSIONS_PAYMENT_EXPIRY_JOB));

    expect(prisma._tx.application.update).toHaveBeenCalledTimes(1); // only the revert
    expect(prisma._tx.application.findMany).not.toHaveBeenCalled();
  });

  it('is idempotent when a row has already left conditional_approval', async () => {
    const prisma = buildPrisma();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: APP_A1,
        tenant_id: TENANT_A,
        target_academic_year_id: ACADEMIC_YEAR_ID,
        target_year_group_id: YEAR_GROUP_ID,
      },
    ]);
    // A concurrent path already promoted/reverted this row.
    prisma._tx.application.findFirst.mockResolvedValue(null);

    const { queue, add } = buildQueue();
    const processor = buildProcessor(prisma, queue);

    await processor.process(buildJob(ADMISSIONS_PAYMENT_EXPIRY_JOB));

    expect(prisma._tx.application.update).not.toHaveBeenCalled();
    expect(prisma._tx.applicationNote.create).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('does not revert a row whose deadline was extended into the future', async () => {
    const prisma = buildPrisma();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: APP_A1,
        tenant_id: TENANT_A,
        target_academic_year_id: ACADEMIC_YEAR_ID,
        target_year_group_id: YEAR_GROUP_ID,
      },
    ]);
    prisma._tx.application.findFirst.mockResolvedValue({
      id: APP_A1,
      reviewed_by_user_id: REVIEWER_ID,
      payment_deadline: new Date('2026-04-20T00:00:00.000Z'),
    });

    const { queue, add } = buildQueue();
    const processor = buildProcessor(prisma, queue);

    await processor.process(buildJob(ADMISSIONS_PAYMENT_EXPIRY_JOB));

    expect(prisma._tx.application.update).not.toHaveBeenCalled();
    expect(prisma._tx.applicationNote.create).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('isolates failures — one bad revert does not block subsequent ones', async () => {
    const prisma = buildPrisma();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: APP_A1,
        tenant_id: TENANT_A,
        target_academic_year_id: ACADEMIC_YEAR_ID,
        target_year_group_id: YEAR_GROUP_ID,
      },
      {
        id: APP_A2,
        tenant_id: TENANT_A,
        target_academic_year_id: ACADEMIC_YEAR_ID,
        target_year_group_id: YEAR_GROUP_ID,
      },
    ]);

    // First revert throws; second succeeds.
    let call = 0;
    prisma.$transaction.mockImplementation(async (callback: (t: MockTx) => Promise<unknown>) => {
      call += 1;
      if (call === 1) {
        throw new Error('simulated DB failure');
      }
      return callback(prisma._tx);
    });
    prisma._tx.application.findFirst.mockResolvedValue({
      id: APP_A2,
      reviewed_by_user_id: REVIEWER_ID,
      payment_deadline: new Date('2026-04-10T00:00:00.000Z'),
    });
    prisma._tx.class.findMany.mockResolvedValue([]);

    const { queue, add } = buildQueue();
    const processor = buildProcessor(prisma, queue);

    // Must not throw — the processor should catch and continue.
    await expect(
      processor.process(buildJob(ADMISSIONS_PAYMENT_EXPIRY_JOB)),
    ).resolves.toBeUndefined();

    // Second application still got notified.
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      ADMISSIONS_PAYMENT_EXPIRED_NOTIFICATION_JOB,
      { tenant_id: TENANT_A, application_id: APP_A2 },
      expect.any(Object),
    );
  });

  it('groups expired applications by tenant and processes each bucket independently', async () => {
    const prisma = buildPrisma();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: APP_A1,
        tenant_id: TENANT_A,
        target_academic_year_id: ACADEMIC_YEAR_ID,
        target_year_group_id: YEAR_GROUP_ID,
      },
      {
        id: APP_B1,
        tenant_id: TENANT_B,
        target_academic_year_id: ACADEMIC_YEAR_ID,
        target_year_group_id: YEAR_GROUP_ID,
      },
    ]);

    prisma._tx.application.findFirst
      .mockResolvedValueOnce({
        id: APP_A1,
        reviewed_by_user_id: REVIEWER_ID,
        payment_deadline: new Date('2026-04-10T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: APP_B1,
        reviewed_by_user_id: REVIEWER_ID,
        payment_deadline: new Date('2026-04-10T00:00:00.000Z'),
      });
    prisma._tx.class.findMany.mockResolvedValue([]);

    const { queue, add } = buildQueue();
    const processor = buildProcessor(prisma, queue);

    await processor.process(buildJob(ADMISSIONS_PAYMENT_EXPIRY_JOB));

    // Two reverts, two notifications.
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenNthCalledWith(
      1,
      ADMISSIONS_PAYMENT_EXPIRED_NOTIFICATION_JOB,
      { tenant_id: TENANT_A, application_id: APP_A1 },
      expect.any(Object),
    );
    expect(add).toHaveBeenNthCalledWith(
      2,
      ADMISSIONS_PAYMENT_EXPIRED_NOTIFICATION_JOB,
      { tenant_id: TENANT_B, application_id: APP_B1 },
      expect.any(Object),
    );
  });

  it('runs one promotion pass per unique year group, not per application', async () => {
    const prisma = buildPrisma();
    const OTHER_YEAR_GROUP = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    prisma.$queryRaw.mockResolvedValue([
      {
        id: APP_A1,
        tenant_id: TENANT_A,
        target_academic_year_id: ACADEMIC_YEAR_ID,
        target_year_group_id: YEAR_GROUP_ID,
      },
      {
        id: APP_A2,
        tenant_id: TENANT_A,
        target_academic_year_id: ACADEMIC_YEAR_ID,
        target_year_group_id: YEAR_GROUP_ID, // same year group
      },
      {
        id: APP_B1,
        tenant_id: TENANT_A,
        target_academic_year_id: ACADEMIC_YEAR_ID,
        target_year_group_id: OTHER_YEAR_GROUP, // different year group
      },
    ]);

    prisma._tx.application.findFirst.mockImplementation(async ({ where }) => ({
      id: (where as { id: string }).id,
      reviewed_by_user_id: REVIEWER_ID,
      payment_deadline: new Date('2026-04-10T00:00:00.000Z'),
    }));
    prisma._tx.class.findMany.mockResolvedValue([]);

    const { queue } = buildQueue();
    const processor = buildProcessor(prisma, queue);

    await processor.process(buildJob(ADMISSIONS_PAYMENT_EXPIRY_JOB));

    // 3 revert transactions + 2 promotion transactions = 5 total
    expect(prisma.$transaction).toHaveBeenCalledTimes(5);
  });
});
