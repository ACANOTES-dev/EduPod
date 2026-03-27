/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuditLogService } from '../../audit-log/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SURVEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const QUESTION_ID_LIKERT = '11111111-1111-1111-1111-111111111111';
const QUESTION_ID_CHOICE = '22222222-2222-2222-2222-222222222222';
const QUESTION_ID_FREE = '33333333-3333-3333-3333-333333333333';
const RESPONSE_ID_1 = 'aaaa1111-1111-1111-1111-111111111111';
const RESPONSE_ID_2 = 'aaaa2222-2222-2222-2222-222222222222';
const RESPONSE_ID_3 = 'aaaa3333-3333-3333-3333-333333333333';

// ─── Helpers ────────────────────────────────────────────────────────────────

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

const makeLikertQuestion = () => ({
  id: QUESTION_ID_LIKERT,
  tenant_id: TENANT_ID,
  survey_id: SURVEY_ID,
  question_text: 'How satisfied are you?',
  question_type: 'likert_5',
  display_order: 0,
  options: null,
  is_required: true,
  created_at: new Date(),
});

const makeChoiceQuestion = () => ({
  id: QUESTION_ID_CHOICE,
  tenant_id: TENANT_ID,
  survey_id: SURVEY_ID,
  question_text: 'Preferred communication?',
  question_type: 'single_choice',
  display_order: 1,
  options: ['Email', 'Slack', 'In-person'],
  is_required: true,
  created_at: new Date(),
});

const makeFreeformQuestion = () => ({
  id: QUESTION_ID_FREE,
  tenant_id: TENANT_ID,
  survey_id: SURVEY_ID,
  question_text: 'Any feedback?',
  question_type: 'freeform',
  display_order: 2,
  options: null,
  is_required: false,
  created_at: new Date(),
});

const makeLikertResponses = () => [
  { id: 'r1', survey_id: SURVEY_ID, question_id: QUESTION_ID_LIKERT, answer_value: 4, answer_text: null, submitted_date: new Date('2026-01-02'), moderation_status: 'approved' },
  { id: 'r2', survey_id: SURVEY_ID, question_id: QUESTION_ID_LIKERT, answer_value: 3, answer_text: null, submitted_date: new Date('2026-01-02'), moderation_status: 'approved' },
  { id: 'r3', survey_id: SURVEY_ID, question_id: QUESTION_ID_LIKERT, answer_value: 5, answer_text: null, submitted_date: new Date('2026-01-03'), moderation_status: 'approved' },
  { id: 'r4', survey_id: SURVEY_ID, question_id: QUESTION_ID_LIKERT, answer_value: 2, answer_text: null, submitted_date: new Date('2026-01-03'), moderation_status: 'approved' },
  { id: 'r5', survey_id: SURVEY_ID, question_id: QUESTION_ID_LIKERT, answer_value: 4, answer_text: null, submitted_date: new Date('2026-01-04'), moderation_status: 'approved' },
];

const makeChoiceResponses = () => [
  { id: 'c1', survey_id: SURVEY_ID, question_id: QUESTION_ID_CHOICE, answer_value: 0, answer_text: null, submitted_date: new Date('2026-01-02'), moderation_status: 'approved' },
  { id: 'c2', survey_id: SURVEY_ID, question_id: QUESTION_ID_CHOICE, answer_value: 0, answer_text: null, submitted_date: new Date('2026-01-02'), moderation_status: 'approved' },
  { id: 'c3', survey_id: SURVEY_ID, question_id: QUESTION_ID_CHOICE, answer_value: 1, answer_text: null, submitted_date: new Date('2026-01-03'), moderation_status: 'approved' },
  { id: 'c4', survey_id: SURVEY_ID, question_id: QUESTION_ID_CHOICE, answer_value: 2, answer_text: null, submitted_date: new Date('2026-01-03'), moderation_status: 'approved' },
  { id: 'c5', survey_id: SURVEY_ID, question_id: QUESTION_ID_CHOICE, answer_value: 2, answer_text: null, submitted_date: new Date('2026-01-04'), moderation_status: 'approved' },
];

const makeFreeformResponses = () => [
  { id: RESPONSE_ID_1, survey_id: SURVEY_ID, question_id: QUESTION_ID_FREE, answer_value: null, answer_text: 'Great place to work', submitted_date: new Date('2026-01-02'), moderation_status: 'approved' },
  { id: RESPONSE_ID_2, survey_id: SURVEY_ID, question_id: QUESTION_ID_FREE, answer_value: null, answer_text: 'Needs improvement', submitted_date: new Date('2026-01-03'), moderation_status: 'pending' },
  { id: RESPONSE_ID_3, survey_id: SURVEY_ID, question_id: QUESTION_ID_FREE, answer_value: null, answer_text: '[Response redacted by moderator]', submitted_date: new Date('2026-01-04'), moderation_status: 'redacted' },
];

// ─── RLS Mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  staffSurvey: {
    findFirst: jest.fn(),
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

import { SurveyResultsService } from './survey-results.service';

describe('SurveyResultsService', () => {
  let service: SurveyResultsService;
  let mockAuditLogService: { write: jest.Mock };

  beforeEach(async () => {
    mockAuditLogService = { write: jest.fn().mockResolvedValue(undefined) };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const method of Object.values(model)) {
        (method as jest.Mock).mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyResultsService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<SurveyResultsService>(SurveyResultsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Helper: set up standard closed survey with sufficient responses ────

  const setupClosedSurvey = (overrides?: Parameters<typeof makeSurvey>[0]) => {
    const survey = makeSurvey(overrides);
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
    mockRlsTx.surveyParticipationToken.count.mockResolvedValue(10);
    mockRlsTx.staffProfile.groupBy.mockResolvedValue([]);
    return survey;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // C1 — AGGREGATION BY QUESTION TYPE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getResults — likert_5 aggregation', () => {
    it('should compute correct mean, median, and distribution for likert_5', async () => {
      setupClosedSurvey();
      mockRlsTx.surveyQuestion.findMany.mockResolvedValue([makeLikertQuestion()]);
      mockRlsTx.surveyResponse.findMany.mockResolvedValue(makeLikertResponses());

      const result = await service.getResults(TENANT_ID, SURVEY_ID);

      expect(result.suppressed).toBe(false);
      const likert = result.results?.find((r) => r.question_type === 'likert_5');
      expect(likert).toBeDefined();
      expect(likert?.response_count).toBe(5);

      // Values: [4, 3, 5, 2, 4] -> sorted: [2, 3, 4, 4, 5]
      // Mean = (4+3+5+2+4)/5 = 18/5 = 3.6
      expect(likert?.mean).toBe(3.6);
      // Median of [2,3,4,4,5] = 4 (middle element)
      expect(likert?.median).toBe(4);
      // Distribution
      expect(likert?.distribution).toEqual({ 1: 0, 2: 1, 3: 1, 4: 2, 5: 1 });
    });
  });

  describe('getResults — single_choice aggregation', () => {
    it('should compute correct counts and percentages for single_choice', async () => {
      setupClosedSurvey();
      mockRlsTx.surveyQuestion.findMany.mockResolvedValue([makeChoiceQuestion()]);
      mockRlsTx.surveyResponse.findMany.mockResolvedValue(makeChoiceResponses());

      const result = await service.getResults(TENANT_ID, SURVEY_ID);

      const choice = result.results?.find((r) => r.question_type === 'single_choice');
      expect(choice).toBeDefined();
      expect(choice?.response_count).toBe(5);

      // Email(idx=0): 2, Slack(idx=1): 1, In-person(idx=2): 2
      expect(choice?.options).toEqual([
        { option: 'Email', count: 2, percentage: 40 },
        { option: 'Slack', count: 1, percentage: 20 },
        { option: 'In-person', count: 2, percentage: 40 },
      ]);
    });
  });

  describe('getResults — freeform aggregation', () => {
    it('should return only approved and redacted counts, no text', async () => {
      setupClosedSurvey();
      mockRlsTx.surveyQuestion.findMany.mockResolvedValue([makeFreeformQuestion()]);
      mockRlsTx.surveyResponse.findMany.mockResolvedValue(makeFreeformResponses());

      const result = await service.getResults(TENANT_ID, SURVEY_ID);

      const freeform = result.results?.find((r) => r.question_type === 'freeform');
      expect(freeform).toBeDefined();
      expect(freeform?.response_count).toBe(3);
      expect(freeform?.approved_count).toBe(1);
      expect(freeform?.redacted_count).toBe(1);
      // No text fields
      expect(freeform?.mean).toBeUndefined();
      expect(freeform?.options).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C2 — MINIMUM RESPONSE THRESHOLD
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getResults — threshold suppression', () => {
    it('should suppress results when response count is below threshold', async () => {
      const survey = makeSurvey({ min_response_threshold: 5 });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyParticipationToken.count.mockResolvedValue(3);

      const result = await service.getResults(TENANT_ID, SURVEY_ID);

      expect(result.suppressed).toBe(true);
      expect(result.reason).toBe('Not enough responses to maintain anonymity.');
      expect(result.response_count).toBe(3);
      expect(result.threshold).toBe(5);
      expect(result.results).toBeUndefined();
    });

    it('should show results when response count equals threshold', async () => {
      const survey = makeSurvey({ min_response_threshold: 5 });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyParticipationToken.count.mockResolvedValue(5);
      mockRlsTx.staffProfile.groupBy.mockResolvedValue([]);
      mockRlsTx.surveyQuestion.findMany.mockResolvedValue([]);
      mockRlsTx.surveyResponse.findMany.mockResolvedValue([]);

      const result = await service.getResults(TENANT_ID, SURVEY_ID);

      expect(result.suppressed).toBe(false);
      expect(result.results).toBeDefined();
    });

    it('should show results when response count exceeds threshold', async () => {
      const survey = makeSurvey({ min_response_threshold: 5 });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyParticipationToken.count.mockResolvedValue(20);
      mockRlsTx.staffProfile.groupBy.mockResolvedValue([]);
      mockRlsTx.surveyQuestion.findMany.mockResolvedValue([]);
      mockRlsTx.surveyResponse.findMany.mockResolvedValue([]);

      const result = await service.getResults(TENANT_ID, SURVEY_ID);

      expect(result.suppressed).toBe(false);
      expect(result.response_count).toBe(20);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C3 — DEPARTMENT DRILL-DOWN
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getResults — department drill-down', () => {
    it('should mark departments below threshold as ineligible', async () => {
      setupClosedSurvey({ dept_drill_down_threshold: 10 });
      mockRlsTx.staffProfile.groupBy.mockResolvedValue([
        { department: 'Maths', _count: { _all: 5 } },
      ]);
      mockRlsTx.surveyQuestion.findMany.mockResolvedValue([]);
      mockRlsTx.surveyResponse.findMany.mockResolvedValue([]);

      const result = await service.getResults(TENANT_ID, SURVEY_ID);

      const maths = result.department_drill_down?.departments.find(
        (d) => d.department === 'Maths',
      );
      expect(maths).toBeDefined();
      expect(maths?.eligible).toBe(false);
      expect(maths?.staff_count).toBe(5);
    });

    it('should mark departments at or above threshold as eligible', async () => {
      setupClosedSurvey({ dept_drill_down_threshold: 10 });
      mockRlsTx.staffProfile.groupBy.mockResolvedValue([
        { department: 'Science', _count: { _all: 15 } },
      ]);
      mockRlsTx.surveyQuestion.findMany.mockResolvedValue([]);
      mockRlsTx.surveyResponse.findMany.mockResolvedValue([]);

      const result = await service.getResults(TENANT_ID, SURVEY_ID);

      const science = result.department_drill_down?.departments.find(
        (d) => d.department === 'Science',
      );
      expect(science).toBeDefined();
      expect(science?.eligible).toBe(true);
      expect(result.department_drill_down?.available).toBe(true);
    });

    it('should set available=false when no departments meet threshold', async () => {
      setupClosedSurvey({ dept_drill_down_threshold: 10 });
      mockRlsTx.staffProfile.groupBy.mockResolvedValue([
        { department: 'Art', _count: { _all: 3 } },
        { department: 'Music', _count: { _all: 2 } },
      ]);
      mockRlsTx.surveyQuestion.findMany.mockResolvedValue([]);
      mockRlsTx.surveyResponse.findMany.mockResolvedValue([]);

      const result = await service.getResults(TENANT_ID, SURVEY_ID);

      expect(result.department_drill_down?.available).toBe(false);
      expect(result.department_drill_down?.departments.every((d) => !d.eligible)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C4 — CROSS-FILTER BLOCKING + DEPARTMENT FILTER
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getResults — department filter', () => {
    it('should throw 403 FILTER_BELOW_THRESHOLD when dept staff count is below dept threshold', async () => {
      setupClosedSurvey({ dept_drill_down_threshold: 10, min_response_threshold: 5 });
      mockRlsTx.staffProfile.groupBy.mockResolvedValue([
        { department: 'Maths', _count: { _all: 4 } },
      ]);

      await expect(
        service.getResults(TENANT_ID, SURVEY_ID, { department: 'Maths' }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.getResults(TENANT_ID, SURVEY_ID, { department: 'Maths' }),
      ).rejects.toMatchObject({
        response: { error: { code: 'FILTER_BELOW_THRESHOLD' } },
      });
    });

    it('should return results normally when dept staff count is above threshold', async () => {
      setupClosedSurvey({ dept_drill_down_threshold: 10, min_response_threshold: 5 });
      mockRlsTx.staffProfile.groupBy.mockResolvedValue([
        { department: 'Science', _count: { _all: 20 } },
      ]);
      mockRlsTx.surveyQuestion.findMany.mockResolvedValue([]);
      mockRlsTx.surveyResponse.findMany.mockResolvedValue([]);

      const result = await service.getResults(TENANT_ID, SURVEY_ID, { department: 'Science' });

      expect(result.suppressed).toBe(false);
    });

    it('should throw 403 FILTER_BELOW_THRESHOLD when dept staff count is below min_response_threshold', async () => {
      // dept_drill_down_threshold=3 so it passes dept check,
      // but min_response_threshold=10 so cross-filter blocking kicks in
      setupClosedSurvey({ dept_drill_down_threshold: 3, min_response_threshold: 10 });
      mockRlsTx.staffProfile.groupBy.mockResolvedValue([
        { department: 'PE', _count: { _all: 5 } },
      ]);

      await expect(
        service.getResults(TENANT_ID, SURVEY_ID, { department: 'PE' }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.getResults(TENANT_ID, SURVEY_ID, { department: 'PE' }),
      ).rejects.toMatchObject({
        response: { error: { code: 'FILTER_BELOW_THRESHOLD' } },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // C5 — BATCH RELEASE ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getResults — batch release enforcement', () => {
    it('should throw 403 SURVEY_STILL_ACTIVE when survey is active', async () => {
      const survey = makeSurvey({ status: 'active' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

      await expect(
        service.getResults(TENANT_ID, SURVEY_ID),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.getResults(TENANT_ID, SURVEY_ID),
      ).rejects.toMatchObject({
        response: { error: { code: 'SURVEY_STILL_ACTIVE' } },
      });
    });

    it('should throw 404 when survey is draft', async () => {
      const survey = makeSurvey({ status: 'draft' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

      await expect(
        service.getResults(TENANT_ID, SURVEY_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return results when survey is closed', async () => {
      setupClosedSurvey({ status: 'closed' });
      mockRlsTx.surveyQuestion.findMany.mockResolvedValue([]);
      mockRlsTx.surveyResponse.findMany.mockResolvedValue([]);

      const result = await service.getResults(TENANT_ID, SURVEY_ID);

      expect(result.suppressed).toBe(false);
    });

    it('should return results when survey is archived', async () => {
      setupClosedSurvey({ status: 'archived' });
      mockRlsTx.surveyQuestion.findMany.mockResolvedValue([]);
      mockRlsTx.surveyResponse.findMany.mockResolvedValue([]);

      const result = await service.getResults(TENANT_ID, SURVEY_ID);

      expect(result.suppressed).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MODERATION QUEUE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('listModerationQueue', () => {
    it('should return only pending and flagged responses', async () => {
      const survey = makeSurvey();
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

      const pendingAndFlagged = [
        { id: RESPONSE_ID_1, answer_text: 'Some feedback', submitted_date: new Date('2026-01-02'), moderation_status: 'pending' },
        { id: RESPONSE_ID_2, answer_text: 'Flagged feedback', submitted_date: new Date('2026-01-03'), moderation_status: 'flagged' },
      ];
      mockRlsTx.surveyResponse.findMany.mockResolvedValue(pendingAndFlagged);

      const result = await service.listModerationQueue(TENANT_ID, SURVEY_ID);

      expect(result).toHaveLength(2);
      const first = result[0]!;
      const second = result[1]!;
      expect(first.id).toBe(RESPONSE_ID_1);
      expect(first.response_text).toBe('Some feedback');
      expect(first.moderation_status).toBe('pending');
      expect(second.moderation_status).toBe('flagged');

      // Verify the query used the correct filter
      expect(mockRlsTx.surveyResponse.findMany).toHaveBeenCalledWith({
        where: {
          survey_id: SURVEY_ID,
          moderation_status: { in: ['pending', 'flagged'] },
          answer_text: { not: null },
        },
        orderBy: { submitted_date: 'asc' },
      });
    });

    it('should return empty array when no items need moderation', async () => {
      const survey = makeSurvey();
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyResponse.findMany.mockResolvedValue([]);

      const result = await service.listModerationQueue(TENANT_ID, SURVEY_ID);

      expect(result).toEqual([]);
    });

    it('should throw 404 when survey does not exist', async () => {
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

      await expect(
        service.listModerationQueue(TENANT_ID, SURVEY_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MODERATE RESPONSE
  // ═══════════════════════════════════════════════════════════════════════════

  describe('moderateResponse', () => {
    it('should approve a response — status changes to approved', async () => {
      const survey = makeSurvey();
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyResponse.findFirst.mockResolvedValue({
        id: RESPONSE_ID_1,
        survey_id: SURVEY_ID,
        moderation_status: 'pending',
        answer_text: 'Some text',
      });
      mockRlsTx.surveyResponse.update.mockResolvedValue({});

      const result = await service.moderateResponse(
        TENANT_ID, SURVEY_ID, RESPONSE_ID_1,
        { status: 'approved' },
        USER_ID,
      );

      expect(result).toEqual({ moderated: true });
      expect(mockRlsTx.surveyResponse.update).toHaveBeenCalledWith({
        where: { id: RESPONSE_ID_1 },
        data: { moderation_status: 'approved' },
      });
    });

    it('should redact a response — overwrite text and update status, audit logged', async () => {
      const survey = makeSurvey();
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyResponse.findFirst.mockResolvedValue({
        id: RESPONSE_ID_1,
        survey_id: SURVEY_ID,
        moderation_status: 'pending',
        answer_text: 'Sensitive content',
      });
      mockRlsTx.surveyResponse.update.mockResolvedValue({});

      const result = await service.moderateResponse(
        TENANT_ID, SURVEY_ID, RESPONSE_ID_1,
        { status: 'redacted', reason: 'PII detected' },
        USER_ID,
      );

      expect(result).toEqual({ moderated: true });
      expect(mockRlsTx.surveyResponse.update).toHaveBeenCalledWith({
        where: { id: RESPONSE_ID_1 },
        data: {
          moderation_status: 'redacted',
          answer_text: '[Response redacted by moderator]',
        },
      });

      // Verify audit log was called
      expect(mockAuditLogService.write).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        'survey_response',
        RESPONSE_ID_1,
        'moderation.redacted',
        {
          reason: 'PII detected',
          response_id: RESPONSE_ID_1,
          survey_id: SURVEY_ID,
        },
        null,
      );
    });

    it('should flag a response — status changes to flagged', async () => {
      const survey = makeSurvey();
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyResponse.findFirst.mockResolvedValue({
        id: RESPONSE_ID_1,
        survey_id: SURVEY_ID,
        moderation_status: 'pending',
        answer_text: 'Some text',
      });
      mockRlsTx.surveyResponse.update.mockResolvedValue({});

      const result = await service.moderateResponse(
        TENANT_ID, SURVEY_ID, RESPONSE_ID_1,
        { status: 'flagged', reason: 'Needs review' },
        USER_ID,
      );

      expect(result).toEqual({ moderated: true });
      expect(mockRlsTx.surveyResponse.update).toHaveBeenCalledWith({
        where: { id: RESPONSE_ID_1 },
        data: { moderation_status: 'flagged' },
      });
    });

    it('should throw 404 when response does not exist', async () => {
      const survey = makeSurvey();
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyResponse.findFirst.mockResolvedValue(null);

      await expect(
        service.moderateResponse(
          TENANT_ID, SURVEY_ID, RESPONSE_ID_1,
          { status: 'approved' },
          USER_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw 404 when survey does not exist', async () => {
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

      await expect(
        service.moderateResponse(
          TENANT_ID, SURVEY_ID, RESPONSE_ID_1,
          { status: 'approved' },
          USER_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MODERATED COMMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getModeratedComments', () => {
    it('should return only approved and redacted comments', async () => {
      const survey = makeSurvey();
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyParticipationToken.count.mockResolvedValue(10);

      const comments = [
        { id: RESPONSE_ID_1, answer_text: 'Great workplace', submitted_date: new Date('2026-01-02'), moderation_status: 'approved' },
        { id: RESPONSE_ID_3, answer_text: '[Response redacted by moderator]', submitted_date: new Date('2026-01-04'), moderation_status: 'redacted' },
      ];
      mockRlsTx.surveyResponse.findMany.mockResolvedValue(comments);

      const result = await service.getModeratedComments(TENANT_ID, SURVEY_ID);

      expect(result.suppressed).toBe(false);
      expect(result.comments).toHaveLength(2);
      const firstComment = result.comments![0]!;
      const secondComment = result.comments![1]!;
      expect(firstComment.text).toBe('Great workplace');
      expect(firstComment.is_redacted).toBe(false);
      expect(secondComment.text).toBe('[Response redacted by moderator]');
      expect(secondComment.is_redacted).toBe(true);

      // Verify query filter
      expect(mockRlsTx.surveyResponse.findMany).toHaveBeenCalledWith({
        where: {
          survey_id: SURVEY_ID,
          moderation_status: { in: ['approved', 'redacted'] },
          answer_text: { not: null },
        },
        orderBy: { submitted_date: 'asc' },
      });
    });

    it('should suppress comments when below threshold', async () => {
      const survey = makeSurvey({ min_response_threshold: 5 });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
      mockRlsTx.surveyParticipationToken.count.mockResolvedValue(2);

      const result = await service.getModeratedComments(TENANT_ID, SURVEY_ID);

      expect(result.suppressed).toBe(true);
      expect(result.reason).toBe('Not enough responses to maintain anonymity.');
      expect(result.response_count).toBe(2);
      expect(result.comments).toBeUndefined();
    });

    it('should throw 403 SURVEY_STILL_ACTIVE when survey is active', async () => {
      const survey = makeSurvey({ status: 'active' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

      await expect(
        service.getModeratedComments(TENANT_ID, SURVEY_ID),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.getModeratedComments(TENANT_ID, SURVEY_ID),
      ).rejects.toMatchObject({
        response: { error: { code: 'SURVEY_STILL_ACTIVE' } },
      });
    });

    it('should throw 404 when survey is draft', async () => {
      const survey = makeSurvey({ status: 'draft' });
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);

      await expect(
        service.getModeratedComments(TENANT_ID, SURVEY_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw 404 when survey does not exist', async () => {
      mockRlsTx.staffSurvey.findFirst.mockResolvedValue(null);

      await expect(
        service.getModeratedComments(TENANT_ID, SURVEY_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FREEFORM IN DEPT DRILL-DOWN
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getResults — freeform text never shown in drill-down', () => {
    it('should never include freeform text regardless of department filter', async () => {
      setupClosedSurvey({ dept_drill_down_threshold: 5 });
      mockRlsTx.staffProfile.groupBy.mockResolvedValue([
        { department: 'English', _count: { _all: 20 } },
      ]);
      mockRlsTx.surveyQuestion.findMany.mockResolvedValue([makeFreeformQuestion()]);
      mockRlsTx.surveyResponse.findMany.mockResolvedValue(makeFreeformResponses());

      const result = await service.getResults(TENANT_ID, SURVEY_ID, { department: 'English' });

      const freeform = result.results?.find((r) => r.question_type === 'freeform');
      expect(freeform).toBeDefined();
      // Only counts, no text
      expect(freeform?.approved_count).toBeDefined();
      expect(freeform?.redacted_count).toBeDefined();
      // Verify no text fields leaked
      const asRecord = freeform as unknown as Record<string, unknown>;
      expect(asRecord['text']).toBeUndefined();
      expect(asRecord['answer_text']).toBeUndefined();
      expect(asRecord['response_text']).toBeUndefined();
    });
  });
});
