import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  PRECOMPUTE_AGENDA_JOB,
  PrecomputeAgendaProcessor,
  type PrecomputeAgendaPayload,
} from './precompute-agenda.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const MEETING_ID = '33333333-3333-3333-3333-333333333333';
const CASE_ID = '44444444-4444-4444-4444-444444444444';
const SECOND_CASE_ID = '55555555-5555-5555-5555-555555555555';
const STUDENT_ID = '66666666-6666-6666-6666-666666666666';
const CONCERN_ID = '77777777-7777-7777-7777-777777777777';

function buildJob(
  name: string,
  data: Partial<PrecomputeAgendaPayload> = {},
): Job<PrecomputeAgendaPayload> {
  return {
    data: {
      meeting_id: MEETING_ID,
      tenant_id: TENANT_ID,
      user_id: USER_ID,
      ...data,
    },
    name,
  } as Job<PrecomputeAgendaPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    pastoralConcern: {
      findMany: jest.fn().mockResolvedValue([
        {
          case_id: CASE_ID,
          category: 'attendance',
          created_at: new Date('2026-03-28T12:00:00.000Z'),
          id: CONCERN_ID,
          severity: 'urgent',
          student: {
            first_name: 'Lina',
            last_name: 'Murphy',
          },
          student_id: STUDENT_ID,
        },
      ]),
    },
    pastoralEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-id' }),
    },
    pastoralIntervention: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    pastoralInterventionAction: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    pastoralReferral: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    pastoralCase: {
      findMany: jest.fn().mockResolvedValue([
        {
          case_number: 'PC-001',
          id: SECOND_CASE_ID,
          status: 'active',
          student: {
            first_name: 'Omar',
            last_name: 'Keane',
          },
          student_id: STUDENT_ID,
        },
      ]),
    },
    sstMeeting: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce({
          agenda_precomputed_at: null,
          id: MEETING_ID,
          scheduled_at: new Date('2026-04-03T10:00:00.000Z'),
          status: 'scheduled',
        })
        .mockResolvedValueOnce({
          scheduled_at: new Date('2026-03-20T10:00:00.000Z'),
        }),
      update: jest.fn().mockResolvedValue({ id: MEETING_ID }),
    },
    sstMeetingAction: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    sstMeetingAgendaItem: {
      create: jest.fn().mockResolvedValue({ id: 'agenda-item-id' }),
      findMany: jest
        .fn()
        .mockResolvedValueOnce([
          {
            case_id: CASE_ID,
            concern_id: null,
            source: 'auto_case_review',
            student_id: STUDENT_ID,
          },
        ])
        .mockResolvedValueOnce([{ display_order: 5 }]),
    },
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue({
        settings: {
          pastoral: {
            sst: {
              auto_agenda_sources: ['new_concerns', 'case_reviews'],
            },
          },
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

describe('PrecomputeAgendaProcessor', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new PrecomputeAgendaProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('pastoral:other-job'));

    expect(tx.sstMeeting.findFirst).not.toHaveBeenCalled();
  });

  it('should generate deduplicated agenda items and write an audit event', async () => {
    const tx = buildMockTx();
    const processor = new PrecomputeAgendaProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(PRECOMPUTE_AGENDA_JOB));

    expect(tx.sstMeetingAgendaItem.create).toHaveBeenCalledTimes(2);
    expect(tx.sstMeetingAgendaItem.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        concern_id: CONCERN_ID,
        display_order: 6,
        meeting_id: MEETING_ID,
        source: 'auto_new_concern',
        tenant_id: TENANT_ID,
      }),
    });
    expect(tx.sstMeetingAgendaItem.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        case_id: SECOND_CASE_ID,
        display_order: 7,
        meeting_id: MEETING_ID,
        source: 'auto_case_review',
        tenant_id: TENANT_ID,
      }),
    });
    expect(tx.sstMeeting.update).toHaveBeenCalledWith({
      data: { agenda_precomputed_at: new Date('2026-04-01T12:00:00.000Z') },
      where: { id: MEETING_ID },
    });
    expect(tx.pastoralEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actor_user_id: USER_ID,
        entity_id: MEETING_ID,
        event_type: 'agenda_precomputed',
        tenant_id: TENANT_ID,
      }),
    });
  });

  it('should skip meetings that were already precomputed inside the idempotency window', async () => {
    const tx = buildMockTx();
    tx.sstMeeting.findFirst.mockReset();
    tx.sstMeeting.findFirst.mockResolvedValue({
      agenda_precomputed_at: new Date('2026-04-01T11:57:00.000Z'),
      id: MEETING_ID,
      scheduled_at: new Date('2026-04-03T10:00:00.000Z'),
      status: 'scheduled',
    });

    const processor = new PrecomputeAgendaProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(PRECOMPUTE_AGENDA_JOB));

    expect(tx.sstMeetingAgendaItem.create).not.toHaveBeenCalled();
    expect(tx.sstMeeting.update).not.toHaveBeenCalled();
    expect(tx.pastoralEvent.create).not.toHaveBeenCalled();
  });
});
