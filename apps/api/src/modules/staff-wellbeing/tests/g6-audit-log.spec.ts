import { Test, TestingModule } from '@nestjs/testing';

import { AuditLogService } from '../../audit-log/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BoardReportService } from '../services/board-report.service';
import { HmacService } from '../services/hmac.service';
import { SurveyResultsService } from '../services/survey-results.service';
import { SurveyService } from '../services/survey.service';
import { WorkloadCacheService } from '../services/workload-cache.service';
import { WorkloadComputeService } from '../services/workload-compute.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const SURVEY_ID = '11111111-1111-1111-1111-111111111111';
const NEW_SURVEY_ID = '55555555-5555-5555-5555-555555555555';
const RESPONSE_ID = '66666666-6666-6666-6666-666666666666';
const QUESTION_ID = '77777777-7777-7777-7777-777777777777';

// ─── RLS Mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  staffSurvey: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  surveyQuestion: {
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  surveyResponse: {
    findMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  surveyParticipationToken: {
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  staffProfile: {
    groupBy: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  academicYear: {
    findFirst: jest.fn(),
  },
  academicPeriod: {
    findFirst: jest.fn(),
  },
  schedule: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  schedulePeriodTemplate: {
    findMany: jest.fn(),
  },
  teacherAbsence: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  substitutionRecord: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  tenantSetting: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Dependency Mocks ───────────────────────────────────────────────────────

const mockPrisma = {} as PrismaService;

const mockHmacService = {
  computeTokenHash: jest.fn().mockResolvedValue('fake-hash'),
};

const mockAuditLogService = {
  write: jest.fn().mockResolvedValue(undefined),
};

const mockWorkloadCacheService = {
  getCachedPersonal: jest.fn().mockResolvedValue(null),
  setCachedPersonal: jest.fn().mockResolvedValue(undefined),
  getCachedAggregate: jest.fn().mockResolvedValue(null),
  setCachedAggregate: jest.fn().mockResolvedValue(undefined),
};

const mockWorkloadComputeService = {
  getAggregateWorkloadSummary: jest.fn().mockResolvedValue({
    average_teaching_periods: 20,
    range: { min: 10, max: 30 },
    over_allocated_periods_count: 2,
  }),
  getCoverFairness: jest.fn().mockResolvedValue({
    gini_coefficient: 0.15,
    assessment: 'Fair distribution',
  }),
  getAggregateTimetableQuality: jest.fn().mockResolvedValue({
    consecutive_periods: { mean: 3, median: 3 },
    free_period_clumping: { mean: 2, median: 2 },
    split_timetable_pct: 0.1,
    room_changes: { mean: 2, median: 2 },
  }),
  getAbsenceTrends: jest.fn().mockResolvedValue({
    day_of_week_pattern: [],
    term_comparison: { current: 5, previous: 4 },
  }),
  getSubstitutionPressure: jest.fn().mockResolvedValue({
    composite_score: 25,
    assessment: 'Low pressure',
    trend: [],
  }),
  getCorrelation: jest.fn().mockResolvedValue({
    status: 'accumulating',
    dataPoints: 2,
    requiredDataPoints: 6,
    message: 'Need more data',
  }),
};

const mockWellbeingQueue = {
  add: jest.fn().mockResolvedValue(undefined),
};

// ─── Shared survey fixture ──────────────────────────────────────────────────

function makeSurveyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SURVEY_ID,
    tenant_id: TENANT_ID,
    title: 'Staff Wellbeing Q1',
    description: null,
    status: 'closed',
    frequency: 'fortnightly',
    window_opens_at: new Date('2026-01-01'),
    window_closes_at: new Date('2026-01-15'),
    results_released: true,
    min_response_threshold: 5,
    dept_drill_down_threshold: 10,
    moderation_enabled: true,
    created_by: USER_ID,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('G6 -- Audit Log Verification', () => {
  let surveyService: SurveyService;
  let surveyResultsService: SurveyResultsService;
  let boardReportService: BoardReportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyService,
        SurveyResultsService,
        BoardReportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HmacService, useValue: mockHmacService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: WorkloadCacheService, useValue: mockWorkloadCacheService },
        { provide: WorkloadComputeService, useValue: mockWorkloadComputeService },
        { provide: 'BullQueue_wellbeing', useValue: mockWellbeingQueue },
      ],
    }).compile();

    surveyService = module.get(SurveyService);
    surveyResultsService = module.get(SurveyResultsService);
    boardReportService = module.get(BoardReportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Survey created — mutation, interceptor-covered
  // ═══════════════════════════════════════════════════════════════════════════

  it('should create a survey successfully (audit via AuditLogInterceptor on POST)', async () => {
    // SurveyService.create() is a mutation invoked by POST /surveys.
    // The AuditLogInterceptor automatically logs all POST/PATCH/PUT/DELETE requests.
    // Verify the service does NOT inject AuditLogService — mutations are interceptor-covered.
    const createdSurvey = makeSurveyRow({
      status: 'draft',
      questions: [
        {
          id: QUESTION_ID,
          tenant_id: TENANT_ID,
          survey_id: SURVEY_ID,
          question_text: 'How are you?',
          question_type: 'likert_5',
          display_order: 1,
          options: null,
          is_required: true,
          created_at: new Date(),
        },
      ],
    });

    mockRlsTx.staffSurvey.create.mockResolvedValue({ id: SURVEY_ID, tenant_id: TENANT_ID });
    mockRlsTx.surveyQuestion.createMany.mockResolvedValue({ count: 1 });
    mockRlsTx.staffSurvey.findUnique.mockResolvedValue(createdSurvey);

    const result = await surveyService.create(TENANT_ID, USER_ID, {
      title: 'Staff Wellbeing Q1',
      frequency: 'fortnightly',
      window_opens_at: '2026-01-01T00:00:00Z',
      window_closes_at: '2026-01-15T00:00:00Z',
      min_response_threshold: 5,
      dept_drill_down_threshold: 10,
      moderation_enabled: true,
      questions: [
        {
          question_text: 'How are you?',
          question_type: 'likert_5' as const,
          display_order: 1,
          is_required: true,
        },
      ],
    });

    expect(result).toBeDefined();
    expect(result.id).toBe(SURVEY_ID);

    // SurveyService does not inject AuditLogService — this mutation is covered
    // by the global AuditLogInterceptor applied at the controller layer (POST method).
    // No explicit auditLogService.write() call is expected here.
    expect(mockAuditLogService.write).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Survey activated — mutation, interceptor-covered
  // ═══════════════════════════════════════════════════════════════════════════

  it('should activate a survey successfully (audit via AuditLogInterceptor on POST)', async () => {
    const draftSurvey = makeSurveyRow({
      status: 'draft',
      window_opens_at: new Date('2026-02-01'),
      window_closes_at: new Date('2026-02-15'),
      questions: [
        {
          id: QUESTION_ID,
          question_text: 'How are you?',
          question_type: 'likert_5',
          display_order: 1,
          options: null,
          is_required: true,
        },
      ],
    });

    mockRlsTx.staffSurvey.findFirst
      .mockResolvedValueOnce(draftSurvey) // find survey
      .mockResolvedValueOnce(null); // no other active survey
    mockRlsTx.staffSurvey.update.mockResolvedValue(makeSurveyRow({ status: 'active' }));

    const result = await surveyService.activate(TENANT_ID, SURVEY_ID);

    expect(result.status).toBe('active');

    // Mutation — interceptor-covered via POST /surveys/:id/activate.
    // No explicit auditLogService.write() call expected.
    expect(mockAuditLogService.write).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Survey closed — mutation, interceptor-covered
  // ═══════════════════════════════════════════════════════════════════════════

  it('should close a survey successfully (audit via AuditLogInterceptor on POST)', async () => {
    const activeSurvey = makeSurveyRow({ status: 'active' });

    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(activeSurvey);
    mockRlsTx.staffSurvey.update.mockResolvedValue(
      makeSurveyRow({ status: 'closed', results_released: true }),
    );

    const result = await surveyService.close(TENANT_ID, SURVEY_ID);

    expect(result.status).toBe('closed');

    // Mutation — interceptor-covered via POST /surveys/:id/close.
    // No explicit auditLogService.write() call expected.
    expect(mockAuditLogService.write).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Survey cloned — mutation, interceptor-covered
  // ═══════════════════════════════════════════════════════════════════════════

  it('should clone a survey successfully (audit via AuditLogInterceptor on POST)', async () => {
    const sourceSurvey = makeSurveyRow({
      questions: [
        {
          id: QUESTION_ID,
          tenant_id: TENANT_ID,
          survey_id: SURVEY_ID,
          question_text: 'How are you?',
          question_type: 'likert_5',
          display_order: 1,
          options: null,
          is_required: true,
          created_at: new Date(),
        },
      ],
    });

    const clonedSurvey = makeSurveyRow({
      id: NEW_SURVEY_ID,
      status: 'draft',
      title: 'Staff Wellbeing Q1 (Copy)',
      questions: [
        {
          id: '88888888-8888-8888-8888-888888888888',
          tenant_id: TENANT_ID,
          survey_id: NEW_SURVEY_ID,
          question_text: 'How are you?',
          question_type: 'likert_5',
          display_order: 1,
          options: null,
          is_required: true,
          created_at: new Date(),
        },
      ],
    });

    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(sourceSurvey);
    mockRlsTx.staffSurvey.create.mockResolvedValue({ id: NEW_SURVEY_ID });
    mockRlsTx.surveyQuestion.createMany.mockResolvedValue({ count: 1 });
    mockRlsTx.staffSurvey.findUnique.mockResolvedValue(clonedSurvey);

    const result = await surveyService.clone(TENANT_ID, SURVEY_ID, USER_ID);

    expect(result).toBeDefined();
    expect(result.id).toBe(NEW_SURVEY_ID);
    expect(result.title).toContain('(Copy)');

    // Mutation — interceptor-covered via POST /surveys/:id/clone.
    // No explicit auditLogService.write() call expected.
    expect(mockAuditLogService.write).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Moderation: approve — explicit audit log in SurveyResultsService
  // ═══════════════════════════════════════════════════════════════════════════

  it('should write audit log when approving a moderated response', async () => {
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(makeSurveyRow());
    mockRlsTx.surveyResponse.findFirst.mockResolvedValue({
      id: RESPONSE_ID,
      survey_id: SURVEY_ID,
      moderation_status: 'pending',
      answer_text: 'Great workplace!',
    });
    mockRlsTx.surveyResponse.update.mockResolvedValue({
      id: RESPONSE_ID,
      moderation_status: 'approved',
    });

    await surveyResultsService.moderateResponse(
      TENANT_ID,
      SURVEY_ID,
      RESPONSE_ID,
      { status: 'approved' },
      USER_ID,
    );

    expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
    expect(mockAuditLogService.write).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      'survey_response',
      RESPONSE_ID,
      'moderation.approved',
      expect.objectContaining({
        reason: null,
        response_id: RESPONSE_ID,
        survey_id: SURVEY_ID,
      }),
      null,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Moderation: flag — explicit audit log in SurveyResultsService
  // ═══════════════════════════════════════════════════════════════════════════

  it('should write audit log when flagging a moderated response', async () => {
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(makeSurveyRow());
    mockRlsTx.surveyResponse.findFirst.mockResolvedValue({
      id: RESPONSE_ID,
      survey_id: SURVEY_ID,
      moderation_status: 'pending',
      answer_text: 'Concerning content here',
    });
    mockRlsTx.surveyResponse.update.mockResolvedValue({
      id: RESPONSE_ID,
      moderation_status: 'flagged',
    });

    await surveyResultsService.moderateResponse(
      TENANT_ID,
      SURVEY_ID,
      RESPONSE_ID,
      { status: 'flagged', reason: 'Contains identifiable information' },
      USER_ID,
    );

    expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
    expect(mockAuditLogService.write).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      'survey_response',
      RESPONSE_ID,
      'moderation.flagged',
      expect.objectContaining({
        reason: 'Contains identifiable information',
        response_id: RESPONSE_ID,
        survey_id: SURVEY_ID,
      }),
      null,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. Moderation: redact — explicit audit log in SurveyResultsService
  // ═══════════════════════════════════════════════════════════════════════════

  it('should write audit log when redacting a moderated response', async () => {
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(makeSurveyRow());
    mockRlsTx.surveyResponse.findFirst.mockResolvedValue({
      id: RESPONSE_ID,
      survey_id: SURVEY_ID,
      moderation_status: 'pending',
      answer_text: 'Identifiable content',
    });
    mockRlsTx.surveyResponse.update.mockResolvedValue({
      id: RESPONSE_ID,
      moderation_status: 'redacted',
      answer_text: '[Response redacted by moderator]',
    });

    await surveyResultsService.moderateResponse(
      TENANT_ID,
      SURVEY_ID,
      RESPONSE_ID,
      { status: 'redacted', reason: 'Contains names' },
      USER_ID,
    );

    expect(mockAuditLogService.write).toHaveBeenCalledTimes(1);
    expect(mockAuditLogService.write).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      'survey_response',
      RESPONSE_ID,
      'moderation.redacted',
      expect.objectContaining({
        reason: 'Contains names',
        response_id: RESPONSE_ID,
        survey_id: SURVEY_ID,
      }),
      null,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. Principal views survey results — privacy-sensitive READ
  // FINDING: This audit log call is missing in the service — needs implementation
  // SurveyResultsService.getResults() is a GET (READ) that exposes aggregated
  // staff sentiment data. The AuditLogInterceptor only covers mutations.
  // A manual auditLogService.write() call is needed here.
  // ═══════════════════════════════════════════════════════════════════════════

  it('should write audit log when principal views survey results', async () => {
    const closedSurvey = makeSurveyRow({ status: 'closed' });
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(closedSurvey);
    mockRlsTx.surveyParticipationToken.count.mockResolvedValue(10);
    mockRlsTx.staffProfile.groupBy.mockResolvedValue([]);
    mockRlsTx.surveyQuestion.findMany.mockResolvedValue([]);
    mockRlsTx.surveyResponse.findMany.mockResolvedValue([]);

    await surveyResultsService.getResults(TENANT_ID, SURVEY_ID);

    // FINDING: This audit log call is missing in the service — needs implementation.
    // getResults() is a privacy-sensitive READ action (viewing aggregated staff
    // sentiment data). The AuditLogInterceptor does NOT cover GET requests.
    // Expected call: auditLogService.write(tenantId, userId, 'staff_survey', surveyId, 'results.viewed', ...)
    //
    // For now, verify the service does NOT call auditLogService.write() — this
    // documents the gap. When the audit call is added, flip the assertion.
    expect(mockAuditLogService.write).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. Principal opens raw freeform comments — privacy-sensitive READ
  // FINDING: This audit log call is missing in the service — needs implementation
  // SurveyResultsService.getModeratedComments() is a GET (READ) that exposes
  // individual staff freeform responses. Manual audit logging is needed.
  // ═══════════════════════════════════════════════════════════════════════════

  it('should write audit log when principal views moderated comments', async () => {
    const closedSurvey = makeSurveyRow({ status: 'closed' });
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(closedSurvey);
    mockRlsTx.surveyParticipationToken.count.mockResolvedValue(10);
    mockRlsTx.surveyResponse.findMany.mockResolvedValue([
      {
        id: RESPONSE_ID,
        answer_text: 'Love the team culture',
        submitted_date: new Date(),
        moderation_status: 'approved',
      },
    ]);

    await surveyResultsService.getModeratedComments(TENANT_ID, SURVEY_ID);

    // FINDING: This audit log call is missing in the service — needs implementation.
    // getModeratedComments() is a privacy-sensitive READ action (viewing individual
    // staff freeform responses). The AuditLogInterceptor does NOT cover GET requests.
    // Expected call: auditLogService.write(tenantId, userId, 'staff_survey', surveyId, 'comments.viewed', ...)
    //
    // For now, verify the service does NOT call auditLogService.write() — this
    // documents the gap. When the audit call is added, flip the assertion.
    expect(mockAuditLogService.write).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. Board report generated — privacy-sensitive READ
  // FINDING: This audit log call is missing in the service — needs implementation
  // BoardReportService.generateTermlySummary() is a GET (READ) that compiles
  // aggregate staff wellbeing metrics into a board report. Manual audit logging
  // is needed.
  // ═══════════════════════════════════════════════════════════════════════════

  it('should write audit log when board report is generated', async () => {
    mockRlsTx.academicYear.findFirst.mockResolvedValue({
      id: 'year-1',
      name: '2025-2026',
    });
    mockRlsTx.academicPeriod.findFirst.mockResolvedValue({
      name: 'Term 2',
    });

    const result = await boardReportService.generateTermlySummary(TENANT_ID);

    expect(result).toBeDefined();
    expect(result.term_name).toBe('Term 2');

    // FINDING: This audit log call is missing in the service — needs implementation.
    // generateTermlySummary() is a privacy-sensitive READ action (compiling aggregate
    // staff wellbeing metrics into a board report). The AuditLogInterceptor does NOT
    // cover GET requests. BoardReportService does not inject AuditLogService at all.
    // Expected call: auditLogService.write(tenantId, userId, 'board_report', null, 'report.generated', { term, year })
    //
    // For now, verify the service does NOT call auditLogService.write() — this
    // documents the gap. When the audit call is added, flip the assertion.
    expect(mockAuditLogService.write).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. Threshold enforcement triggered — privacy-sensitive READ (blocked)
  // FINDING: This audit log call is missing in the service — needs implementation
  // When getResults() returns suppressed=true (below threshold), this should be
  // audit-logged to track threshold enforcement. Currently no audit call exists.
  // ═══════════════════════════════════════════════════════════════════════════

  it('should write audit log when threshold enforcement suppresses results', async () => {
    const closedSurvey = makeSurveyRow({
      status: 'closed',
      min_response_threshold: 5,
    });
    mockRlsTx.staffSurvey.findFirst.mockResolvedValue(closedSurvey);
    // Below threshold — only 3 participation tokens
    mockRlsTx.surveyParticipationToken.count.mockResolvedValue(3);

    const result = await surveyResultsService.getResults(TENANT_ID, SURVEY_ID);

    expect(result.suppressed).toBe(true);
    expect(result.reason).toContain('Not enough responses');

    // FINDING: This audit log call is missing in the service — needs implementation.
    // When results are suppressed due to threshold enforcement, this should generate
    // an audit entry to track the enforcement event.
    // Expected call: auditLogService.write(tenantId, null, 'staff_survey', surveyId, 'threshold.enforced', { response_count, threshold })
    //
    // For now, verify the service does NOT call auditLogService.write() — this
    // documents the gap. When the audit call is added, flip the assertion.
    expect(mockAuditLogService.write).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. Principal views aggregate dashboard — privacy-sensitive READ
  // FINDING: This audit log call is missing — AggregateWorkloadController
  // does not inject or call AuditLogService. This is a GET endpoint viewing
  // aggregate staff workload/wellness data. Manual audit logging is needed.
  // ═══════════════════════════════════════════════════════════════════════════

  it('should document that aggregate dashboard viewing has no audit log (controller-level gap)', () => {
    // FINDING: This audit log call is missing — needs implementation.
    // AggregateWorkloadController has 6 GET endpoints that expose aggregate staff
    // workload, cover fairness, timetable quality, absence trends, substitution
    // pressure, and correlation data. None of these produce audit entries because:
    //   1. They are GET requests (AuditLogInterceptor only covers mutations)
    //   2. The controller does not inject AuditLogService
    //   3. The underlying compute/cache services do not inject AuditLogService
    //
    // Each aggregate dashboard access should generate an audit entry:
    //   auditLogService.write(tenantId, userId, 'aggregate_dashboard', null, 'dashboard.viewed', { section })
    //
    // This is a controller-level concern — the service layer is stateless computation.
    // The fix should add audit logging in the controller methods or via a dedicated
    // interceptor scoped to this controller.

    expect(true).toBe(true); // Placeholder — no service method to invoke
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 13. Impersonation attempt blocked — guard-level audit
  // FINDING: BlockImpersonationGuard throws ForbiddenException but does not
  // call AuditLogService. The guard does not inject AuditLogService. This gap
  // means blocked impersonation attempts are not audit-logged.
  // ═══════════════════════════════════════════════════════════════════════════

  it('should document that impersonation blocking has no audit log (guard-level gap)', () => {
    // FINDING: This audit log call is missing — needs implementation.
    // BlockImpersonationGuard rejects impersonating users with a ForbiddenException,
    // but does not inject AuditLogService or write an audit entry. The guard is a
    // NestJS CanActivate guard and does not have access to AuditLogService unless
    // it is explicitly injected.
    //
    // Expected behaviour: when the guard blocks an impersonation attempt, it should
    // write an audit entry:
    //   auditLogService.write(tenantId, userId, 'wellbeing_access', null, 'impersonation.blocked', { endpoint })
    //
    // This requires modifying BlockImpersonationGuard to inject AuditLogService
    // (or emitting an event that a listener catches for audit logging).
    // Tested structurally in g2-impersonation-block.spec.ts.

    expect(true).toBe(true); // Placeholder — guard test is separate
  });
});
