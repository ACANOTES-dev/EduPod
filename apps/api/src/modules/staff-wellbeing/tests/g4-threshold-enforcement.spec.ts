/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuditLogService } from '../../audit-log/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SURVEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const QUESTION_ID_LIKERT = '11111111-1111-1111-1111-111111111111';
const QUESTION_ID_FREE = '33333333-3333-3333-3333-333333333333';

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

const makeFreeformQuestion = () => ({
  id: QUESTION_ID_FREE,
  tenant_id: TENANT_ID,
  survey_id: SURVEY_ID,
  question_text: 'Any feedback?',
  question_type: 'freeform',
  display_order: 1,
  options: null,
  is_required: false,
  created_at: new Date(),
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

const makeFreeformResponses = () => [
  { id: 'f1', survey_id: SURVEY_ID, question_id: QUESTION_ID_FREE, answer_value: null, answer_text: 'Great place to work', submitted_date: new Date('2026-01-02'), moderation_status: 'approved' },
  { id: 'f2', survey_id: SURVEY_ID, question_id: QUESTION_ID_FREE, answer_value: null, answer_text: '[Response redacted by moderator]', submitted_date: new Date('2026-01-03'), moderation_status: 'redacted' },
  { id: 'f3', survey_id: SURVEY_ID, question_id: QUESTION_ID_FREE, answer_value: null, answer_text: 'Needs improvement', submitted_date: new Date('2026-01-04'), moderation_status: 'pending' },
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

import { SurveyResultsService } from '../services/survey-results.service';

describe('G4 — Threshold Enforcement', () => {
  let service: SurveyResultsService;

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
        { provide: PrismaService, useValue: {} },
        { provide: AuditLogService, useValue: { write: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<SurveyResultsService>(SurveyResultsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Helper: set up a closed survey with dept metadata ──────────────────

  const setupClosedSurvey = (overrides?: Parameters<typeof makeSurvey>[0]) => {
    const survey = makeSurvey(overrides);
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(survey);
    return survey;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Below min threshold — suppressed
  // ═══════════════════════════════════════════════════════════════════════════

  it('should suppress results when participation count is below min_response_threshold', async () => {
    setupClosedSurvey({ min_response_threshold: 5 });
    mockRlsTx.surveyParticipationToken.count.mockResolvedValue(3);

    const result = await service.getResults(TENANT_ID, SURVEY_ID);

    expect(result.suppressed).toBe(true);
    expect(result.reason).toBe('Not enough responses to maintain anonymity.');
    expect(result.response_count).toBe(3);
    expect(result.threshold).toBe(5);
    expect(result.results).toBeUndefined();
    expect(result.department_drill_down).toBeUndefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. At min threshold — results visible
  // ═══════════════════════════════════════════════════════════════════════════

  it('should show results when participation count equals min_response_threshold', async () => {
    setupClosedSurvey({ min_response_threshold: 5 });
    mockRlsTx.surveyParticipationToken.count.mockResolvedValue(5);
    mockRlsTx.staffProfile.groupBy.mockResolvedValue([]);
    mockRlsTx.surveyQuestion.findMany.mockResolvedValue([makeLikertQuestion()]);
    mockRlsTx.surveyResponse.findMany.mockResolvedValue([
      { id: 'r1', survey_id: SURVEY_ID, question_id: QUESTION_ID_LIKERT, answer_value: 4, answer_text: null, submitted_date: new Date(), moderation_status: 'approved' },
    ]);

    const result = await service.getResults(TENANT_ID, SURVEY_ID);

    expect(result.suppressed).toBe(false);
    expect(result.response_count).toBe(5);
    expect(result.threshold).toBe(5);
    expect(result.results).toBeDefined();
    expect(result.results).toHaveLength(1);
    expect(result.department_drill_down).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Department below dept_drill_down_threshold — marked ineligible
  // ═══════════════════════════════════════════════════════════════════════════

  it('should mark department as ineligible when staff count is below dept_drill_down_threshold', async () => {
    setupClosedSurvey({ dept_drill_down_threshold: 10 });
    mockRlsTx.surveyParticipationToken.count.mockResolvedValue(20);
    mockRlsTx.staffProfile.groupBy.mockResolvedValue([
      { department: 'Art', _count: { _all: 5 } },
      { department: 'Science', _count: { _all: 15 } },
    ]);
    mockRlsTx.surveyQuestion.findMany.mockResolvedValue([]);
    mockRlsTx.surveyResponse.findMany.mockResolvedValue([]);

    const result = await service.getResults(TENANT_ID, SURVEY_ID);

    const art = result.department_drill_down?.departments.find((d) => d.department === 'Art');
    const science = result.department_drill_down?.departments.find((d) => d.department === 'Science');

    expect(art).toBeDefined();
    expect(art?.eligible).toBe(false);
    expect(art?.staff_count).toBe(5);

    expect(science).toBeDefined();
    expect(science?.eligible).toBe(true);
    expect(science?.staff_count).toBe(15);

    // available should be true because at least one department is eligible
    expect(result.department_drill_down?.available).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Cross-filter attack — department filter isolating small group
  // ═══════════════════════════════════════════════════════════════════════════

  it('should throw ForbiddenException FILTER_BELOW_THRESHOLD when department filter isolates small staff group', async () => {
    setupClosedSurvey({ dept_drill_down_threshold: 10, min_response_threshold: 5 });
    mockRlsTx.surveyParticipationToken.count.mockResolvedValue(20);
    mockRlsTx.staffProfile.groupBy.mockResolvedValue([
      { department: 'Isolated', _count: { _all: 3 } },
      { department: 'Large', _count: { _all: 50 } },
    ]);

    await expect(
      service.getResults(TENANT_ID, SURVEY_ID, { department: 'Isolated' }),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.getResults(TENANT_ID, SURVEY_ID, { department: 'Isolated' }),
    ).rejects.toMatchObject({
      response: { error: { code: 'FILTER_BELOW_THRESHOLD' } },
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Freeform in dept drill-down — only counts, no text
  // ═══════════════════════════════════════════════════════════════════════════

  it('should return only counts for freeform questions when department filter is applied — no text fields', async () => {
    setupClosedSurvey({ dept_drill_down_threshold: 5, min_response_threshold: 5 });
    mockRlsTx.surveyParticipationToken.count.mockResolvedValue(20);
    mockRlsTx.staffProfile.groupBy.mockResolvedValue([
      { department: 'English', _count: { _all: 20 } },
    ]);
    mockRlsTx.surveyQuestion.findMany.mockResolvedValue([makeFreeformQuestion()]);
    mockRlsTx.surveyResponse.findMany.mockResolvedValue(makeFreeformResponses());

    const result = await service.getResults(TENANT_ID, SURVEY_ID, { department: 'English' });

    expect(result.suppressed).toBe(false);
    const freeform = result.results?.find((r) => r.question_type === 'freeform');
    expect(freeform).toBeDefined();
    expect(freeform?.approved_count).toBe(1);
    expect(freeform?.redacted_count).toBe(1);

    // Verify no text fields leaked into the freeform aggregation
    const asRecord = freeform as unknown as Record<string, unknown>;
    expect(asRecord['text']).toBeUndefined();
    expect(asRecord['answer_text']).toBeUndefined();
    expect(asRecord['response_text']).toBeUndefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Small-N cycle comparison — response_count near threshold still suppressed
  // ═══════════════════════════════════════════════════════════════════════════

  it('should suppress results when response_count is just below threshold (4 vs threshold 5)', async () => {
    setupClosedSurvey({ min_response_threshold: 5 });
    mockRlsTx.surveyParticipationToken.count.mockResolvedValue(4);

    const result = await service.getResults(TENANT_ID, SURVEY_ID);

    expect(result.suppressed).toBe(true);
    expect(result.reason).toBe('Not enough responses to maintain anonymity.');
    expect(result.response_count).toBe(4);
    expect(result.threshold).toBe(5);
    expect(result.results).toBeUndefined();
    // No department drill-down should be present when suppressed
    expect(result.department_drill_down).toBeUndefined();
  });
});
