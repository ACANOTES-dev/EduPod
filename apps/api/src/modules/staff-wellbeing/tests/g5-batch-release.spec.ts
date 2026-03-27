/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { AuditLogService } from '../../audit-log/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SURVEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OTHER_SURVEY_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Helpers ────────────────────────────────────────────────────────────────

const futureDate = (daysFromNow: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
};

const makeSurvey = (overrides: Partial<{
  id: string;
  status: string;
  min_response_threshold: number;
  dept_drill_down_threshold: number;
  results_released: boolean;
  moderation_enabled: boolean;
}> = {}) => ({
  id: overrides.id ?? SURVEY_ID,
  tenant_id: TENANT_ID,
  title: 'Staff Wellbeing Check',
  description: 'Weekly check-in',
  status: overrides.status ?? 'closed',
  frequency: 'fortnightly',
  window_opens_at: new Date('2026-01-01T00:00:00Z'),
  window_closes_at: new Date('2026-01-08T00:00:00Z'),
  results_released: overrides.results_released ?? true,
  min_response_threshold: overrides.min_response_threshold ?? 5,
  dept_drill_down_threshold: overrides.dept_drill_down_threshold ?? 10,
  moderation_enabled: overrides.moderation_enabled ?? true,
  created_by: USER_ID,
  created_at: new Date(),
  updated_at: new Date(),
});

const makeDraftSurveyWithQuestions = () => ({
  ...makeSurvey({ status: 'draft' }),
  window_opens_at: futureDate(1),
  window_closes_at: futureDate(8),
  questions: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      tenant_id: TENANT_ID,
      survey_id: SURVEY_ID,
      question_text: 'How are you?',
      question_type: 'likert_5',
      display_order: 0,
      options: null,
      is_required: true,
      created_at: new Date(),
    },
  ],
});

// ─── RLS Mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  staffSurvey: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  surveyQuestion: {
    findMany: jest.fn(),
  },
  surveyResponse: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  surveyParticipationToken: {
    count: jest.fn(),
  },
  staffProfile: {
    groupBy: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Test Suite ─────────────────────────────────────────────────────────────

import { HmacService } from '../services/hmac.service';
import { SurveyResultsService } from '../services/survey-results.service';
import { SurveyService } from '../services/survey.service';

describe('G5 — Batch Release', () => {
  let surveyResultsService: SurveyResultsService;
  let surveyService: SurveyService;

  beforeEach(async () => {
    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const method of Object.values(model)) {
        (method as jest.Mock).mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyResultsService,
        SurveyService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditLogService, useValue: { write: jest.fn().mockResolvedValue(undefined) } },
        { provide: HmacService, useValue: { computeTokenHash: jest.fn().mockResolvedValue('fake-hash') } },
        { provide: getQueueToken('wellbeing'), useValue: { add: jest.fn().mockResolvedValue({}) } },
      ],
    }).compile();

    surveyResultsService = module.get<SurveyResultsService>(SurveyResultsService);
    surveyService = module.get<SurveyService>(SurveyService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Results during active — 403 SURVEY_STILL_ACTIVE
  // ═══════════════════════════════════════════════════════════════════════════

  it('should throw ForbiddenException SURVEY_STILL_ACTIVE when getResults is called on active survey', async () => {
    const survey = makeSurvey({ status: 'active' });
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

    await expect(
      surveyResultsService.getResults(TENANT_ID, SURVEY_ID),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      surveyResultsService.getResults(TENANT_ID, SURVEY_ID),
    ).rejects.toMatchObject({
      response: { error: { code: 'SURVEY_STILL_ACTIVE' } },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Comments during active — 403 SURVEY_STILL_ACTIVE
  // ═══════════════════════════════════════════════════════════════════════════

  it('should throw ForbiddenException SURVEY_STILL_ACTIVE when getModeratedComments is called on active survey', async () => {
    const survey = makeSurvey({ status: 'active' });
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

    await expect(
      surveyResultsService.getModeratedComments(TENANT_ID, SURVEY_ID),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      surveyResultsService.getModeratedComments(TENANT_ID, SURVEY_ID),
    ).rejects.toMatchObject({
      response: { error: { code: 'SURVEY_STILL_ACTIVE' } },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Results after close — 200 with data
  // ═══════════════════════════════════════════════════════════════════════════

  it('should return results with suppressed=false when survey is closed', async () => {
    const survey = makeSurvey({ status: 'closed' });
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
    mockRlsTx.surveyParticipationToken.count.mockResolvedValue(10);
    mockRlsTx.staffProfile.groupBy.mockResolvedValue([]);
    mockRlsTx.surveyQuestion.findMany.mockResolvedValue([]);
    mockRlsTx.surveyResponse.findMany.mockResolvedValue([]);

    const result = await surveyResultsService.getResults(TENANT_ID, SURVEY_ID);

    expect(result.suppressed).toBe(false);
    expect(result.response_count).toBe(10);
    expect(result.survey_id).toBe(SURVEY_ID);
    expect(result.results).toBeDefined();
    expect(result.department_drill_down).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Single active enforcement — ConflictException SURVEY_ALREADY_ACTIVE
  // ═══════════════════════════════════════════════════════════════════════════

  it('should throw ConflictException SURVEY_ALREADY_ACTIVE when another survey is already active', async () => {
    const draftSurvey = makeDraftSurveyWithQuestions();
    const activeSurvey = makeSurvey({ id: OTHER_SURVEY_ID, status: 'active' });

    // activate() calls findFirst twice inside the transaction:
    //   1st: fetch the survey to activate (draft with questions)
    //   2nd: check for existing active surveys (returns an active survey)
    // We call activate() twice (toThrow + toMatchObject), so provide 4 values.
    mockRlsTx.staffSurvey.findFirst
      .mockResolvedValueOnce(draftSurvey)
      .mockResolvedValueOnce(activeSurvey)
      .mockResolvedValueOnce(draftSurvey)
      .mockResolvedValueOnce(activeSurvey);

    await expect(
      surveyService.activate(TENANT_ID, SURVEY_ID),
    ).rejects.toThrow(ConflictException);

    await expect(
      surveyService.activate(TENANT_ID, SURVEY_ID),
    ).rejects.toMatchObject({
      response: { error: { code: 'SURVEY_ALREADY_ACTIVE' } },
    });
  });
});
