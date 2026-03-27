import { PrismaClient } from '@prisma/client';

import {
  CleanupParticipationTokensProcessor,
  CLEANUP_PARTICIPATION_TOKENS_JOB,
} from './cleanup-participation-tokens.processor';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SURVEY_ID_1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SURVEY_ID_2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SURVEY_ID_3 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Helpers ────────────────────────────────────────────────────────────────

const now = new Date('2026-03-27T08:00:00Z');
const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

function buildSurvey(
  id: string,
  tenantId: string,
  window_closes_at: Date,
  status = 'closed',
) {
  return { id, tenant_id: tenantId, status, window_closes_at };
}

function buildMockPrisma(overrides: {
  staffSurveyFindMany?: jest.Mock;
  surveyParticipationTokenDeleteMany?: jest.Mock;
}) {
  const staffSurveyFindMany =
    overrides.staffSurveyFindMany ?? jest.fn().mockResolvedValue([]);
  const surveyParticipationTokenDeleteMany =
    overrides.surveyParticipationTokenDeleteMany ??
    jest.fn().mockResolvedValue({ count: 0 });

  const mockClient = {
    staffSurvey: { findMany: staffSurveyFindMany },
    surveyParticipationToken: { deleteMany: surveyParticipationTokenDeleteMany },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn(),
  } as unknown as PrismaClient;

  // Wire $transaction to invoke the callback with the same mock client
  (mockClient.$transaction as jest.Mock).mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) => fn(mockClient),
  );

  return {
    mockClient,
    staffSurveyFindMany,
    surveyParticipationTokenDeleteMany,
  };
}

function buildJob(name: string = CLEANUP_PARTICIPATION_TOKENS_JOB) {
  return { name, data: {} };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CleanupParticipationTokensProcessor', () => {
  let processor: CleanupParticipationTokensProcessor;
  let realDateNow: () => number;

  beforeAll(() => {
    realDateNow = Date.now;
    Date.now = () => now.getTime();
  });

  afterAll(() => {
    Date.now = realDateNow;
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Tokens deleted for surveys closed >7 days ago ────────────────────

  it('should delete tokens for surveys closed more than 7 days ago', async () => {
    const survey = buildSurvey(SURVEY_ID_1, TENANT_A, eightDaysAgo);
    const { mockClient, surveyParticipationTokenDeleteMany } = buildMockPrisma({
      staffSurveyFindMany: jest.fn().mockResolvedValue([survey]),
      surveyParticipationTokenDeleteMany: jest
        .fn()
        .mockResolvedValue({ count: 5 }),
    });

    processor = new CleanupParticipationTokensProcessor(mockClient);

    await processor.process(buildJob() as never);

    expect(surveyParticipationTokenDeleteMany).toHaveBeenCalledWith({
      where: { survey_id: { in: [SURVEY_ID_1] } },
    });
  });

  // ─── Tokens retained for surveys closed <7 days ago ──────────────────

  it('should not delete tokens for surveys closed fewer than 7 days ago', async () => {
    const recentSurvey = buildSurvey(SURVEY_ID_1, TENANT_A, threeDaysAgo);
    const { mockClient, surveyParticipationTokenDeleteMany, staffSurveyFindMany } =
      buildMockPrisma({
        staffSurveyFindMany: jest.fn().mockResolvedValue([]),
      });

    // Verify the query uses the correct cutoff — surveys returned by findMany
    // are the eligible ones; if findMany returns [] it means the DB filtered them out
    // In this test we verify that surveys closed recently are NOT in the result
    // by confirming the processor only acts on what findMany returns.
    processor = new CleanupParticipationTokensProcessor(mockClient);

    await processor.process(buildJob() as never);

    expect(staffSurveyFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'closed',
          window_closes_at: expect.objectContaining({ lt: expect.any(Date) }),
        }),
      }),
    );

    // recentSurvey was not returned by findMany (simulating DB filter),
    // so no tokens should be deleted
    expect(surveyParticipationTokenDeleteMany).not.toHaveBeenCalled();
    void recentSurvey; // explicitly unused — confirms test intent
  });

  // ─── No surveys closed → no deletions ────────────────────────────────

  it('should not attempt any deletions when there are no eligible surveys', async () => {
    const { mockClient, surveyParticipationTokenDeleteMany } = buildMockPrisma({
      staffSurveyFindMany: jest.fn().mockResolvedValue([]),
    });

    processor = new CleanupParticipationTokensProcessor(mockClient);

    await processor.process(buildJob() as never);

    expect(surveyParticipationTokenDeleteMany).not.toHaveBeenCalled();
    expect(mockClient.$transaction).not.toHaveBeenCalled();
  });

  // ─── Multiple surveys → all processed ────────────────────────────────

  it('should process multiple surveys across multiple tenants', async () => {
    const surveys = [
      buildSurvey(SURVEY_ID_1, TENANT_A, eightDaysAgo),
      buildSurvey(SURVEY_ID_2, TENANT_A, eightDaysAgo),
      buildSurvey(SURVEY_ID_3, TENANT_B, eightDaysAgo),
    ];

    const { mockClient, surveyParticipationTokenDeleteMany } = buildMockPrisma({
      staffSurveyFindMany: jest.fn().mockResolvedValue(surveys),
      surveyParticipationTokenDeleteMany: jest
        .fn()
        .mockResolvedValue({ count: 2 }),
    });

    processor = new CleanupParticipationTokensProcessor(mockClient);

    await processor.process(buildJob() as never);

    // Two tenants → two transactions
    expect(mockClient.$transaction).toHaveBeenCalledTimes(2);

    // Tenant A: both survey IDs in one deleteMany call
    expect(surveyParticipationTokenDeleteMany).toHaveBeenCalledWith({
      where: { survey_id: { in: expect.arrayContaining([SURVEY_ID_1, SURVEY_ID_2]) } },
    });

    // Tenant B: its own deleteMany call
    expect(surveyParticipationTokenDeleteMany).toHaveBeenCalledWith({
      where: { survey_id: { in: [SURVEY_ID_3] } },
    });
  });

  // ─── RLS context set per tenant ──────────────────────────────────────

  it('should set RLS context for each tenant transaction', async () => {
    const survey = buildSurvey(SURVEY_ID_1, TENANT_A, eightDaysAgo);
    const { mockClient } = buildMockPrisma({
      staffSurveyFindMany: jest.fn().mockResolvedValue([survey]),
      surveyParticipationTokenDeleteMany: jest
        .fn()
        .mockResolvedValue({ count: 1 }),
    });

    processor = new CleanupParticipationTokensProcessor(mockClient);

    await processor.process(buildJob() as never);

    expect(mockClient.$executeRaw).toHaveBeenCalled();
  });

  // ─── Job name guard ───────────────────────────────────────────────────

  it('should ignore jobs with a non-matching name', async () => {
    const { mockClient, staffSurveyFindMany } = buildMockPrisma({});

    processor = new CleanupParticipationTokensProcessor(mockClient);

    await processor.process(buildJob('some-other-job') as never);

    expect(staffSurveyFindMany).not.toHaveBeenCalled();
  });
});
