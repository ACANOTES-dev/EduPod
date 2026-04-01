import type { Job } from 'bullmq';

import {
  GENERATE_TRIP_PACK_JOB,
  type GenerateTripPackPayload,
  GenerateTripPackProcessor,
} from './engagement-generate-trip-pack.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const EVENT_ID = '22222222-2222-2222-2222-222222222222';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    engagementEvent: {
      findFirst: jest.fn().mockResolvedValue({
        end_date: new Date('2026-04-10T00:00:00.000Z'),
        end_time: '17:00',
        event_type: 'school_trip',
        id: EVENT_ID,
        location: 'Dublin Zoo',
        location_ar: null,
        risk_assessment_approved: true,
        staff: [],
        start_date: new Date('2026-04-10T00:00:00.000Z'),
        start_time: '09:00',
        status: 'published',
        title: 'School Trip',
        title_ar: null,
      }),
    },
    engagementEventParticipant: {
      findMany: jest.fn().mockResolvedValue([
        {
          student: {
            allergy_details: null,
            class_enrolments: [],
            date_of_birth: new Date('2010-03-15T00:00:00.000Z'),
            first_name: 'Amina',
            full_name: 'Amina OBrien',
            has_allergy: false,
            household: { emergency_contacts: [] },
            id: 'student-1',
            last_name: 'OBrien',
            medical_notes: null,
          },
        },
      ]),
    },
    engagementFormSubmission: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { student_id: 'student-1', submitted_at: new Date('2026-04-01T00:00:00.000Z') },
        ]),
    },
    tenant: {
      findFirst: jest.fn().mockResolvedValue({ name: 'EduPod School', settings: {} }),
    },
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(mockTx)),
  };
}

function buildJob(
  name: string = GENERATE_TRIP_PACK_JOB,
  data: Partial<GenerateTripPackPayload> = {},
): Job<GenerateTripPackPayload> {
  return {
    data: {
      event_id: EVENT_ID,
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<GenerateTripPackPayload>;
}

describe('GenerateTripPackProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new GenerateTripPackProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('engagement:other-job'));

    expect(mockTx.engagementEvent.findFirst).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new GenerateTripPackProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(GENERATE_TRIP_PACK_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id');
  });

  it('should aggregate trip-pack source data for eligible trip events', async () => {
    const mockTx = buildMockTx();
    const processor = new GenerateTripPackProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.engagementEventParticipant.findMany).toHaveBeenCalledWith({
      where: {
        event_id: EVENT_ID,
        tenant_id: TENANT_ID,
        status: { notIn: ['withdrawn', 'consent_declined'] },
      },
      include: {
        student: {
          select: expect.any(Object),
        },
      },
    });
    expect(mockTx.engagementFormSubmission.findMany).toHaveBeenCalledWith({
      where: {
        event_id: EVENT_ID,
        tenant_id: TENANT_ID,
        status: { in: ['submitted', 'acknowledged'] },
      },
      select: {
        student_id: true,
        submitted_at: true,
      },
    });
  });
});
