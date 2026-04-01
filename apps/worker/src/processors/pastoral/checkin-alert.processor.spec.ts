import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  CHECKIN_ALERT_JOB,
  CheckinAlertProcessor,
  type CheckinAlertPayload,
} from './checkin-alert.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const CHECKIN_ID = '33333333-3333-3333-3333-333333333333';
const OWNER_ID = '44444444-4444-4444-4444-444444444444';

function buildJob(name: string, data: Partial<CheckinAlertPayload> = {}): Job<CheckinAlertPayload> {
  return {
    data: {
      checkin_id: CHECKIN_ID,
      flag_reason: 'low_mood',
      monitoring_owner_user_ids: [OWNER_ID],
      student_id: STUDENT_ID,
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<CheckinAlertPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    student: {
      findFirst: jest.fn().mockResolvedValue({
        first_name: 'Amina',
        id: STUDENT_ID,
        last_name: 'Hassan',
      }),
    },
    studentCheckin: {
      findFirst: jest.fn().mockResolvedValue({
        checkin_date: new Date('2026-04-01T00:00:00.000Z'),
        flag_reason: 'low_mood',
        flagged: true,
        id: CHECKIN_ID,
        mood_score: 2,
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

describe('CheckinAlertProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new CheckinAlertProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('pastoral:other-job'));

    expect(tx.studentCheckin.findFirst).not.toHaveBeenCalled();
    expect(tx.student.findFirst).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const processor = new CheckinAlertProcessor(buildMockPrisma(buildMockTx()));

    await expect(
      processor.process(buildJob(CHECKIN_ALERT_JOB, { tenant_id: undefined })),
    ).rejects.toThrow('missing tenant_id');
  });

  it('should load the flagged check-in and student for matching jobs', async () => {
    const tx = buildMockTx();
    const processor = new CheckinAlertProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(CHECKIN_ALERT_JOB));

    expect(tx.studentCheckin.findFirst).toHaveBeenCalledWith({
      select: {
        checkin_date: true,
        flag_reason: true,
        flagged: true,
        id: true,
        mood_score: true,
      },
      where: { id: CHECKIN_ID },
    });
    expect(tx.student.findFirst).toHaveBeenCalledWith({
      select: {
        first_name: true,
        id: true,
        last_name: true,
      },
      where: { id: STUDENT_ID },
    });
  });
});
