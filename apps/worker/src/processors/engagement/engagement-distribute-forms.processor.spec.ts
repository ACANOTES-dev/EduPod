import { Job } from 'bullmq';

import {
  DISTRIBUTE_FORMS_JOB,
  type DistributeFormsPayload,
  EngagementDistributeFormsProcessor,
} from './engagement-distribute-forms.processor';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TEMPLATE_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_ID = '33333333-3333-3333-3333-333333333333';
const PARENT_USER_ID = '44444444-4444-4444-4444-444444444444';

function buildMockTx() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    academicYear: {
      findFirst: jest.fn().mockResolvedValue({ id: 'academic-year-1' }),
    },
    classEnrolment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    engagementFormSubmission: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    engagementFormTemplate: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce({ id: TEMPLATE_ID, status: 'published' })
        .mockResolvedValueOnce({ name: 'Trip Consent' }),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notification-id' }),
    },
    student: {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([{ id: STUDENT_ID }])
        .mockResolvedValueOnce([
          {
            first_name: 'Amina',
            household: {
              household_parents: [{ parent: { user_id: PARENT_USER_ID } }],
            },
            id: STUDENT_ID,
            last_name: 'OBrien',
          },
        ]),
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
  name: string = DISTRIBUTE_FORMS_JOB,
  data: Partial<DistributeFormsPayload> = {},
): Job<DistributeFormsPayload> {
  return {
    data: {
      form_template_id: TEMPLATE_ID,
      target_type: 'whole_school',
      tenant_id: TENANT_ID,
      ...data,
    },
    name,
  } as Job<DistributeFormsPayload>;
}

describe('EngagementDistributeFormsProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockTx = buildMockTx();
    const processor = new EngagementDistributeFormsProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob('engagement:other-job'));

    expect(mockTx.engagementFormTemplate.findFirst).not.toHaveBeenCalled();
  });

  it('should reject jobs without tenant_id', async () => {
    const mockTx = buildMockTx();
    const processor = new EngagementDistributeFormsProcessor(buildMockPrisma(mockTx) as never);

    await expect(
      processor.process(buildJob(DISTRIBUTE_FORMS_JOB, { tenant_id: '' })),
    ).rejects.toThrow('Job rejected: missing tenant_id');
  });

  it('should create submissions for resolved students and notify grouped parents', async () => {
    const mockTx = buildMockTx();
    const processor = new EngagementDistributeFormsProcessor(buildMockPrisma(mockTx) as never);

    await processor.process(buildJob());

    expect(mockTx.student.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, status: 'active' },
      select: { id: true },
    });
    expect(mockTx.engagementFormSubmission.createMany).toHaveBeenCalledWith({
      data: [
        {
          tenant_id: TENANT_ID,
          form_template_id: TEMPLATE_ID,
          event_id: null,
          student_id: STUDENT_ID,
          responses_json: {},
          status: 'pending',
          academic_year_id: 'academic-year-1',
        },
      ],
    });
    expect(mockTx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipient_user_id: PARENT_USER_ID,
        template_key: 'engagement_form_distributed',
        tenant_id: TENANT_ID,
        payload_json: expect.objectContaining({
          child_count: 1,
          child_names: ['Amina OBrien'],
          form_name: 'Trip Consent',
          student_ids: [STUDENT_ID],
        }),
      }),
    });
  });
});
