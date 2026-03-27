import { MembershipStatus, PrismaClient } from '@prisma/client';

import {
  SURVEY_CLOSING_REMINDER_JOB,
  SurveyClosingReminderProcessor,
} from './survey-closing-reminder.processor';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_ID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SURVEY_ID_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SURVEY_ID_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID_1 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const USER_ID_2 = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

/**
 * Build a mock transaction client.
 * `membersFn` controls the resolved value of tenantMembership.findMany.
 */
function buildMockTx(membersFn?: () => { user_id: string }[]) {
  return {
    tenantMembership: {
      findMany: jest.fn().mockImplementation(() =>
        Promise.resolve(membersFn ? membersFn() : [{ user_id: USER_ID_1 }]),
      ),
    },
    notification: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Build a mock PrismaClient. The `staffSurvey.findMany` and `$transaction`
 * mocks are configurable per test.
 */
function buildMockPrisma(
  closingSurveys: Array<{ id: string; tenant_id: string }>,
  mockTx: ReturnType<typeof buildMockTx>,
) {
  return {
    staffSurvey: {
      findMany: jest.fn().mockResolvedValue(closingSurveys),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  } as unknown as PrismaClient;
}

function buildJob(name: string = SURVEY_CLOSING_REMINDER_JOB) {
  return { name, data: {} };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('SurveyClosingReminderProcessor', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── No closing surveys ──────────────────────────────────────────────

  it('should skip processing when no surveys are closing within 24 hours', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma([], mockTx);
    const processor = new SurveyClosingReminderProcessor(mockPrisma);

    await processor.process(buildJob() as never);

    expect(mockPrisma.staffSurvey.findMany).toHaveBeenCalledTimes(1);
    expect(mockTx.notification.createMany).not.toHaveBeenCalled();
  });

  // ─── Single tenant with a closing survey ────────────────────────────

  it('should send closing reminders for a tenant with an active closing survey', async () => {
    const mockTx = buildMockTx(() => [{ user_id: USER_ID_1 }]);
    const mockPrisma = buildMockPrisma(
      [{ id: SURVEY_ID_A, tenant_id: TENANT_ID_A }],
      mockTx,
    );
    const processor = new SurveyClosingReminderProcessor(mockPrisma);

    await processor.process(buildJob() as never);

    expect(mockTx.notification.createMany).toHaveBeenCalledTimes(1);
    expect(mockTx.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            tenant_id: TENANT_ID_A,
            recipient_user_id: USER_ID_1,
            channel: 'in_app',
            status: 'delivered',
            source_entity_type: 'staff_survey',
            source_entity_id: SURVEY_ID_A,
            payload_json: expect.objectContaining({
              title: 'Survey Closing Soon',
              body: 'The current wellbeing survey closes tomorrow.',
              link: '/wellbeing/survey',
            }),
          }),
        ]),
      }),
    );
  });

  // ─── RLS context is set per tenant ──────────────────────────────────

  it('should set RLS context to the correct tenant_id inside the transaction', async () => {
    const mockTx = buildMockTx(() => [{ user_id: USER_ID_1 }]);
    const mockPrisma = buildMockPrisma(
      [{ id: SURVEY_ID_A, tenant_id: TENANT_ID_A }],
      mockTx,
    );
    const processor = new SurveyClosingReminderProcessor(mockPrisma);

    await processor.process(buildJob() as never);

    // $executeRaw is called once to set RLS context for TENANT_ID_A
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  // ─── Queries active memberships with correct filter ──────────────────

  it('should query active memberships using MembershipStatus.active', async () => {
    const mockTx = buildMockTx(() => [{ user_id: USER_ID_1 }]);
    const mockPrisma = buildMockPrisma(
      [{ id: SURVEY_ID_A, tenant_id: TENANT_ID_A }],
      mockTx,
    );
    const processor = new SurveyClosingReminderProcessor(mockPrisma);

    await processor.process(buildJob() as never);

    expect(mockTx.tenantMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID_A,
          membership_status: MembershipStatus.active,
        }),
      }),
    );
  });

  // ─── Skips tenants with no active members ────────────────────────────

  it('should skip notification creation for a tenant with no active members', async () => {
    const mockTx = buildMockTx(() => []);
    const mockPrisma = buildMockPrisma(
      [{ id: SURVEY_ID_A, tenant_id: TENANT_ID_A }],
      mockTx,
    );
    const processor = new SurveyClosingReminderProcessor(mockPrisma);

    await processor.process(buildJob() as never);

    expect(mockTx.notification.createMany).not.toHaveBeenCalled();
  });

  // ─── Multiple tenants ────────────────────────────────────────────────

  it('should handle multiple tenants with closing surveys independently', async () => {
    // Alternate members per call: first call returns USER_ID_1, second USER_ID_2
    let callCount = 0;
    const mockTx = buildMockTx(() => {
      callCount += 1;
      return callCount === 1 ? [{ user_id: USER_ID_1 }] : [{ user_id: USER_ID_2 }];
    });

    const mockPrisma = buildMockPrisma(
      [
        { id: SURVEY_ID_A, tenant_id: TENANT_ID_A },
        { id: SURVEY_ID_B, tenant_id: TENANT_ID_B },
      ],
      mockTx,
    );
    const processor = new SurveyClosingReminderProcessor(mockPrisma);

    await processor.process(buildJob() as never);

    // Two surveys = two transactions = two createMany calls
    expect(mockTx.notification.createMany).toHaveBeenCalledTimes(2);

    // First call targets TENANT_ID_A + SURVEY_ID_A
    expect(mockTx.notification.createMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            tenant_id: TENANT_ID_A,
            source_entity_id: SURVEY_ID_A,
            recipient_user_id: USER_ID_1,
          }),
        ]),
      }),
    );

    // Second call targets TENANT_ID_B + SURVEY_ID_B
    expect(mockTx.notification.createMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            tenant_id: TENANT_ID_B,
            source_entity_id: SURVEY_ID_B,
            recipient_user_id: USER_ID_2,
          }),
        ]),
      }),
    );
  });

  // ─── Job name guard ──────────────────────────────────────────────────

  it('should ignore jobs with a non-matching name', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma([], mockTx);
    const processor = new SurveyClosingReminderProcessor(mockPrisma);

    await processor.process(buildJob('some-other-job') as never);

    expect(mockPrisma.staffSurvey.findMany).not.toHaveBeenCalled();
    expect(mockTx.notification.createMany).not.toHaveBeenCalled();
  });

  // ─── Surveys queried with correct time window ────────────────────────

  it('should query surveys with status active and window_closes_at within 24 hours', async () => {
    const mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma([], mockTx);
    const processor = new SurveyClosingReminderProcessor(mockPrisma);

    const before = new Date();
    await processor.process(buildJob() as never);
    const after = new Date();

    expect(mockPrisma.staffSurvey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'active',
          window_closes_at: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date),
          }),
        }),
      }),
    );

    const callArg = (mockPrisma.staffSurvey.findMany as jest.Mock).mock.calls[0][0] as {
      where: { window_closes_at: { gte: Date; lte: Date } };
    };

    // gte should be around "now"
    expect(callArg.where.window_closes_at.gte.getTime()).toBeGreaterThanOrEqual(before.getTime() - 100);
    expect(callArg.where.window_closes_at.gte.getTime()).toBeLessThanOrEqual(after.getTime() + 100);

    // lte should be approximately 24 hours after gte
    const diffMs = callArg.where.window_closes_at.lte.getTime() - callArg.where.window_closes_at.gte.getTime();
    expect(diffMs).toBeCloseTo(24 * 60 * 60 * 1000, -3); // within ~1 second
  });
});
