import { type PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import {
  BEHAVIOUR_CHECK_AWARDS_JOB,
  BehaviourCheckAwardsProcessor,
  type BehaviourCheckAwardsPayload,
} from './check-awards.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const INCIDENT_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_ID = '33333333-3333-3333-3333-333333333333';
const REPORTER_ID = '44444444-4444-4444-4444-444444444444';
const AWARD_TYPE_ID = '55555555-5555-5555-5555-555555555555';
const AWARD_ID = '66666666-6666-6666-6666-666666666666';
const PARENT_ID = '77777777-7777-7777-7777-777777777777';
const PARENT_USER_ID = '88888888-8888-8888-8888-888888888888';
const ACADEMIC_YEAR_ID = '99999999-9999-9999-9999-999999999999';

function buildJob(
  name: string,
  data: Partial<BehaviourCheckAwardsPayload> = {},
): Job<BehaviourCheckAwardsPayload> {
  return {
    data: {
      academic_period_id: null,
      academic_year_id: ACADEMIC_YEAR_ID,
      incident_id: INCIDENT_ID,
      student_ids: [STUDENT_ID],
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<BehaviourCheckAwardsPayload>;
}

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    behaviourAwardType: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: AWARD_TYPE_ID,
          name: 'Merit Award',
          points_threshold: 10,
          repeat_max_per_year: null,
          repeat_mode: 'unlimited',
          supersedes_lower_tiers: false,
          tier_group: null,
          tier_level: null,
        },
      ]),
    },
    behaviourGuardianRestriction: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    behaviourIncident: {
      findUnique: jest.fn().mockResolvedValue({
        reported_by_id: REPORTER_ID,
      }),
    },
    behaviourIncidentParticipant: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { points_awarded: 12 },
      }),
    },
    behaviourPublicationApproval: {
      create: jest.fn().mockResolvedValue({ id: 'publication-id' }),
    },
    behaviourRecognitionAward: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({ id: AWARD_ID }),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notification-id' }),
    },
    studentParent: {
      findMany: jest.fn().mockResolvedValue([
        {
          parent: {
            id: PARENT_ID,
            preferred_contact_channels: ['email'],
            status: 'active',
            user_id: PARENT_USER_ID,
          },
        },
      ]),
    },
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue({
        settings: {
          behaviour: {
            recognition_wall_admin_approval_required: false,
            recognition_wall_auto_populate: true,
            recognition_wall_requires_consent: false,
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

describe('BehaviourCheckAwardsProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const tx = buildMockTx();
    const processor = new BehaviourCheckAwardsProcessor(buildMockPrisma(tx));

    await processor.process(buildJob('behaviour:other-job'));

    expect(tx.behaviourAwardType.findMany).not.toHaveBeenCalled();
  });

  it('should create awards, parent notifications, and recognition wall records for eligible students', async () => {
    const tx = buildMockTx();
    const processor = new BehaviourCheckAwardsProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(BEHAVIOUR_CHECK_AWARDS_JOB));

    expect(tx.behaviourRecognitionAward.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        academic_year_id: ACADEMIC_YEAR_ID,
        award_type_id: AWARD_TYPE_ID,
        awarded_by_id: REPORTER_ID,
        points_at_award: 12,
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
        triggered_by_incident_id: INCIDENT_ID,
      }),
    });
    expect(tx.notification.create).toHaveBeenCalledTimes(2);
    expect(tx.behaviourPublicationApproval.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        admin_approved: true,
        entity_id: AWARD_ID,
        entity_type: 'award',
        parent_consent_status: 'granted',
        publication_type: 'recognition_wall_website',
        published_at: expect.any(Date),
        student_id: STUDENT_ID,
        tenant_id: TENANT_ID,
      }),
    });
  });

  it('should skip processing when no active auto-award types exist', async () => {
    const tx = buildMockTx();
    tx.behaviourAwardType.findMany.mockResolvedValue([]);
    const processor = new BehaviourCheckAwardsProcessor(buildMockPrisma(tx));

    await processor.process(buildJob(BEHAVIOUR_CHECK_AWARDS_JOB));

    expect(tx.behaviourRecognitionAward.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(tx.behaviourPublicationApproval.create).not.toHaveBeenCalled();
  });
});
