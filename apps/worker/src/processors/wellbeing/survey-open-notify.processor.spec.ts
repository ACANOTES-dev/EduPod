import { MembershipStatus, PrismaClient } from '@prisma/client';

import {
  SURVEY_OPEN_NOTIFY_JOB,
  SurveyOpenNotifyJob,
  SurveyOpenNotifyPayload,
  SurveyOpenNotifyProcessor,
} from './survey-open-notify.processor';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SURVEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID_1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID_2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function buildMockTx() {
  return {
    tenantMembership: {
      findMany: jest.fn().mockResolvedValue([
        { user_id: USER_ID_1 },
        { user_id: USER_ID_2 },
      ]),
    },
    notification: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockPrisma(mockTx: ReturnType<typeof buildMockTx>) {
  return {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  } as unknown as PrismaClient;
}

function buildPayload(
  overrides: Partial<SurveyOpenNotifyPayload> = {},
): SurveyOpenNotifyPayload {
  return {
    tenant_id: TENANT_ID,
    survey_id: SURVEY_ID,
    ...overrides,
  };
}

function buildJob(
  payload: SurveyOpenNotifyPayload,
  name: string = SURVEY_OPEN_NOTIFY_JOB,
) {
  return { name, data: payload };
}

// ─── SurveyOpenNotifyJob unit tests ─────────────────────────────────────────

describe('SurveyOpenNotifyJob', () => {
  let mockTx: ReturnType<typeof buildMockTx>;
  let mockPrisma: PrismaClient;

  beforeEach(() => {
    mockTx = buildMockTx();
    mockPrisma = buildMockPrisma(mockTx);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create notifications for all active members', async () => {
    const job = new SurveyOpenNotifyJob(mockPrisma);
    await job.execute(buildPayload());

    expect(mockTx.tenantMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          membership_status: MembershipStatus.active,
        }),
        select: { user_id: true },
      }),
    );

    expect(mockTx.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            tenant_id: TENANT_ID,
            recipient_user_id: USER_ID_1,
            channel: 'in_app',
            status: 'delivered',
            source_entity_type: 'staff_survey',
            source_entity_id: SURVEY_ID,
          }),
          expect.objectContaining({
            tenant_id: TENANT_ID,
            recipient_user_id: USER_ID_2,
            channel: 'in_app',
            status: 'delivered',
            source_entity_type: 'staff_survey',
            source_entity_id: SURVEY_ID,
          }),
        ]),
      }),
    );
  });

  it('should use the correct notification payload shape', async () => {
    const job = new SurveyOpenNotifyJob(mockPrisma);
    await job.execute(buildPayload());

    const createManyCall = mockTx.notification.createMany.mock.calls[0][0] as {
      data: Array<Record<string, unknown>>;
    };
    const firstRecord = createManyCall.data[0];

    expect(firstRecord).toMatchObject({
      payload_json: {
        title: 'Wellbeing Survey Available',
        body: 'A new staff wellbeing survey is available.',
        link: '/wellbeing/survey',
      },
      template_key: null,
      locale: 'en',
    });
  });

  it('should skip notification creation when there are no active members', async () => {
    mockTx.tenantMembership.findMany.mockResolvedValue([]);

    const job = new SurveyOpenNotifyJob(mockPrisma);
    await job.execute(buildPayload());

    expect(mockTx.notification.createMany).not.toHaveBeenCalled();
  });
});

// ─── SurveyOpenNotifyProcessor unit tests ────────────────────────────────────

describe('SurveyOpenNotifyProcessor', () => {
  let mockTx: ReturnType<typeof buildMockTx>;
  let processor: SurveyOpenNotifyProcessor;

  beforeEach(() => {
    mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    processor = new SurveyOpenNotifyProcessor(mockPrisma);
  });

  afterEach(() => jest.clearAllMocks());

  it('should process the job and create notifications for active members', async () => {
    await processor.process(buildJob(buildPayload()) as never);

    expect(mockTx.notification.createMany).toHaveBeenCalledTimes(1);
  });

  it('should ignore jobs with a non-matching name', async () => {
    await processor.process(buildJob(buildPayload(), 'some-other-job') as never);

    expect(mockTx.tenantMembership.findMany).not.toHaveBeenCalled();
    expect(mockTx.notification.createMany).not.toHaveBeenCalled();
  });

  it('should reject jobs missing tenant_id', async () => {
    const payload = { survey_id: SURVEY_ID } as SurveyOpenNotifyPayload;

    await expect(
      processor.process(buildJob(payload) as never),
    ).rejects.toThrow('tenant_id');
  });
});
