import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  INTERVENTION_REVIEW_REMINDER_JOB,
  InterventionReviewReminderProcessor,
  type InterventionReviewReminderPayload,
} from './intervention-review-reminder.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const INTERVENTION_ID = '33333333-3333-3333-3333-333333333333';
const CASE_ID = '44444444-4444-4444-4444-444444444444';
const STUDENT_ID = '55555555-5555-5555-5555-555555555555';
const OWNER_ID = '66666666-6666-6666-6666-666666666666';
const SST_ID = '77777777-7777-7777-7777-777777777777';

function buildJob(
  name: string,
  data: Partial<InterventionReviewReminderPayload> = {},
): Job<InterventionReviewReminderPayload> {
  return {
    data: {
      case_id: CASE_ID,
      intervention_id: INTERVENTION_ID,
      next_review_date: '2026-04-08T00:00:00.000Z',
      student_id: STUDENT_ID,
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      ...data,
    },
    name,
  } as Job<InterventionReviewReminderPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    pastoralCase: {
      findFirst: jest.fn().mockResolvedValue({
        owner_user_id: OWNER_ID,
      }),
    },
    pastoralEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-id' }),
    },
    pastoralIntervention: {
      findFirst: jest.fn().mockResolvedValue({
        id: INTERVENTION_ID,
        intervention_type: 'attendance_support',
        next_review_date: new Date('2026-04-08T00:00:00.000Z'),
        status: 'pc_active',
        student: {
          first_name: 'Lina',
          id: STUDENT_ID,
          last_name: 'Murphy',
        },
      }),
    },
    sstMember: {
      findMany: jest.fn().mockResolvedValue([{ user_id: OWNER_ID }, { user_id: SST_ID }]),
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

describe('InterventionReviewReminderProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new InterventionReviewReminderProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('pastoral:other-job'));

    expect(tx.pastoralIntervention.findFirst).not.toHaveBeenCalled();
    expect(tx.pastoralEvent.create).not.toHaveBeenCalled();
  });

  it('should create a pastoral event with deduplicated recipients when the intervention is still due', async () => {
    const tx = buildMockTx();
    const processor = new InterventionReviewReminderProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(INTERVENTION_REVIEW_REMINDER_JOB));

    expect(tx.pastoralEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor_user_id: USER_ID,
        entity_id: INTERVENTION_ID,
        entity_type: 'intervention',
        event_type: 'intervention_review_reminder_sent',
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
        tier: 1,
        payload: expect.objectContaining({
          case_id: CASE_ID,
          intervention_id: INTERVENTION_ID,
          next_review_date: '2026-04-08T00:00:00.000Z',
          recipients: [OWNER_ID, SST_ID],
          student_id: STUDENT_ID,
        }),
      }),
    });
  });

  it('should skip when the intervention review date has changed', async () => {
    const tx = buildMockTx();
    tx.pastoralIntervention.findFirst.mockResolvedValue({
      id: INTERVENTION_ID,
      intervention_type: 'attendance_support',
      next_review_date: new Date('2026-04-09T00:00:00.000Z'),
      status: 'pc_active',
      student: {
        first_name: 'Lina',
        id: STUDENT_ID,
        last_name: 'Murphy',
      },
    });

    const processor = new InterventionReviewReminderProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(INTERVENTION_REVIEW_REMINDER_JOB));

    expect(tx.pastoralCase.findFirst).not.toHaveBeenCalled();
    expect(tx.sstMember.findMany).not.toHaveBeenCalled();
    expect(tx.pastoralEvent.create).not.toHaveBeenCalled();
  });
});
