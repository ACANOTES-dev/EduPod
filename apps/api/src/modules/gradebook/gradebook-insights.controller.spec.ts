import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AiCommentsService } from './ai/ai-comments.service';
import { AiGradingInstructionService } from './ai/ai-grading-instruction.service';
import { AiGradingService } from './ai/ai-grading.service';
import { AiProgressSummaryService } from './ai/ai-progress-summary.service';
import { NlQueryService } from './ai/nl-query.service';
import { AnalyticsService } from './analytics/analytics.service';
import { GradebookInsightsController } from './gradebook-insights.controller';
import { GradePublishingService } from './grading/grade-publishing.service';
import { ProgressReportService } from './progress/progress-report.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ASSESSMENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CLASS_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PERIOD_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const SUBJECT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const REPORT_CARD_ID = '11111111-1111-1111-1111-111111111111';
const INSTRUCTION_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = '33333333-3333-3333-3333-333333333333';

const tenantContext = { tenant_id: TENANT_ID };
const userContext = {
  sub: USER_ID,
  membership_id: '44444444-4444-4444-4444-444444444444',
  email: 'teacher@school.ie',
  tenant_id: TENANT_ID,
  type: 'access' as const,
  iat: 0,
  exp: 0,
};

const mockAnalyticsService = {
  getGradeDistribution: jest.fn(),
  getPeriodDistribution: jest.fn(),
  getStudentTrend: jest.fn(),
  getClassTrend: jest.fn(),
  getTeacherConsistency: jest.fn(),
  getBenchmark: jest.fn(),
};

const mockAiCommentsService = {
  generateComment: jest.fn(),
  generateBatchComments: jest.fn(),
};

const mockAiGradingService = {
  gradeInline: jest.fn(),
};

const mockAiGradingInstructionService = {
  upsertInstruction: jest.fn(),
  listInstructions: jest.fn(),
  findOneInstruction: jest.fn(),
  reviewInstruction: jest.fn(),
  deleteInstruction: jest.fn(),
  createReference: jest.fn(),
  listReferences: jest.fn(),
  reviewReference: jest.fn(),
  deleteReference: jest.fn(),
};

const mockAiProgressSummaryService = {
  generateSummary: jest.fn(),
};

const mockNlQueryService = {
  processQuery: jest.fn(),
  getQueryHistory: jest.fn(),
};

const mockGradePublishingService = {
  getReadinessDashboard: jest.fn(),
  publishGrades: jest.fn(),
  publishPeriodGrades: jest.fn(),
};

const mockProgressReportService = {
  generate: jest.fn(),
  list: jest.fn(),
  updateEntry: jest.fn(),
  send: jest.fn(),
};

describe('GradebookInsightsController', () => {
  let controller: GradebookInsightsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GradebookInsightsController],
      providers: [
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: AiCommentsService, useValue: mockAiCommentsService },
        { provide: AiGradingService, useValue: mockAiGradingService },
        { provide: AiGradingInstructionService, useValue: mockAiGradingInstructionService },
        { provide: AiProgressSummaryService, useValue: mockAiProgressSummaryService },
        { provide: NlQueryService, useValue: mockNlQueryService },
        { provide: GradePublishingService, useValue: mockGradePublishingService },
        { provide: ProgressReportService, useValue: mockProgressReportService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GradebookInsightsController>(GradebookInsightsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Analytics ──────────────────────────────────────────────────────────

  it('should return grade distribution for an assessment', async () => {
    const distribution = { buckets: [{ label: 'A', count: 10 }] };
    mockAnalyticsService.getGradeDistribution.mockResolvedValue(distribution);

    const result = await controller.getAssessmentDistribution(tenantContext, ASSESSMENT_ID);

    expect(result).toEqual(distribution);
    expect(mockAnalyticsService.getGradeDistribution).toHaveBeenCalledWith(
      TENANT_ID, ASSESSMENT_ID,
    );
  });

  it('should throw BadRequestException when period distribution is called without required query params', async () => {
    await expect(
      controller.getPeriodDistribution(tenantContext, {}),
    ).rejects.toThrow(BadRequestException);
  });

  it('should return period distribution when all required params are provided', async () => {
    const distribution = { buckets: [] };
    mockAnalyticsService.getPeriodDistribution.mockResolvedValue(distribution);

    const result = await controller.getPeriodDistribution(tenantContext, {
      class_id: CLASS_ID,
      subject_id: SUBJECT_ID,
      period_id: PERIOD_ID,
    });

    expect(result).toEqual(distribution);
    expect(mockAnalyticsService.getPeriodDistribution).toHaveBeenCalledWith(
      TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID,
    );
  });

  it('should return student grade trend', async () => {
    const trend = [{ period: 'T1', average: 82 }];
    mockAnalyticsService.getStudentTrend.mockResolvedValue(trend);

    const result = await controller.getStudentTrend(
      tenantContext,
      STUDENT_ID,
      { subject_id: SUBJECT_ID },
    );

    expect(result).toEqual(trend);
    expect(mockAnalyticsService.getStudentTrend).toHaveBeenCalledWith(
      TENANT_ID, STUDENT_ID, SUBJECT_ID,
    );
  });

  it('should return class grade trend', async () => {
    const trend = [{ period: 'T1', average: 78 }];
    mockAnalyticsService.getClassTrend.mockResolvedValue(trend);

    const result = await controller.getClassTrend(
      tenantContext,
      CLASS_ID,
      { subject_id: SUBJECT_ID, period_id: PERIOD_ID },
    );

    expect(result).toEqual(trend);
    expect(mockAnalyticsService.getClassTrend).toHaveBeenCalledWith(
      TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID,
    );
  });

  it('should return benchmark data for a year group', async () => {
    const benchmark = { average: 75, p25: 60, p75: 88 };
    mockAnalyticsService.getBenchmark.mockResolvedValue(benchmark);

    const YEAR_GROUP_ID = '55555555-5555-5555-5555-555555555555';
    const result = await controller.getBenchmark(tenantContext, {
      year_group_id: YEAR_GROUP_ID,
      subject_id: SUBJECT_ID,
      period_id: PERIOD_ID,
    });

    expect(result).toEqual(benchmark);
    expect(mockAnalyticsService.getBenchmark).toHaveBeenCalledWith(
      TENANT_ID, YEAR_GROUP_ID, SUBJECT_ID, PERIOD_ID,
    );
  });

  // ─── AI Comments ────────────────────────────────────────────────────────

  it('should generate a single AI comment for a report card', async () => {
    const generated = { comment: 'Excellent progress this term.' };
    mockAiCommentsService.generateComment.mockResolvedValue(generated);

    const result = await controller.generateComment(tenantContext, REPORT_CARD_ID);

    expect(result).toEqual(generated);
    expect(mockAiCommentsService.generateComment).toHaveBeenCalledWith(
      TENANT_ID, REPORT_CARD_ID,
    );
  });

  it('should generate batch AI comments for multiple report cards', async () => {
    const dto = { report_card_ids: [REPORT_CARD_ID] };
    const generated = { processed: 1, failed: 0 };
    mockAiCommentsService.generateBatchComments.mockResolvedValue(generated);

    const result = await controller.generateBatchComments(tenantContext, dto);

    expect(result).toEqual(generated);
    expect(mockAiCommentsService.generateBatchComments).toHaveBeenCalledWith(
      TENANT_ID, [REPORT_CARD_ID],
    );
  });

  // ─── AI Grading Instructions ─────────────────────────────────────────────

  it('should list AI grading instructions for the tenant', async () => {
    const instructions = [{ id: INSTRUCTION_ID, status: 'active' }];
    mockAiGradingInstructionService.listInstructions.mockResolvedValue(instructions);

    const result = await controller.listGradingInstructions(tenantContext, {});

    expect(result).toEqual(instructions);
    expect(mockAiGradingInstructionService.listInstructions).toHaveBeenCalledWith(TENANT_ID, {});
  });

  it('should upsert an AI grading instruction', async () => {
    const dto = {
      subject_id: SUBJECT_ID,
      class_id: CLASS_ID,
      instruction_text: 'Grade on clarity and argument structure.',
    };
    const upserted = { id: INSTRUCTION_ID, ...dto };
    mockAiGradingInstructionService.upsertInstruction.mockResolvedValue(upserted);

    const result = await controller.upsertGradingInstruction(tenantContext, userContext, dto);

    expect(result).toEqual(upserted);
    expect(mockAiGradingInstructionService.upsertInstruction).toHaveBeenCalledWith(
      TENANT_ID, USER_ID, dto,
    );
  });

  it('should throw BadRequestException when grading inline with no file uploaded', async () => {
    await expect(
      controller.gradeInline(
        tenantContext,
        undefined,
        { assessment_id: ASSESSMENT_ID, student_id: STUDENT_ID },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ─── Natural Language Query ───────────────────────────────────────────────

  it('should process a natural language query and return results', async () => {
    const dto = { question: 'Which students are at risk in Maths?' };
    const response = { answer: 'Students: Ali, Sara', query_id: 'q-1' };
    mockNlQueryService.processQuery.mockResolvedValue(response);

    const result = await controller.nlQuery(tenantContext, userContext, dto);

    expect(result).toEqual(response);
    expect(mockNlQueryService.processQuery).toHaveBeenCalledWith(
      TENANT_ID, USER_ID, dto.question,
    );
  });

  it('should return NL query history for the current user', async () => {
    const history = { data: [{ id: 'q-1', question: 'Which students are at risk?' }] };
    mockNlQueryService.getQueryHistory.mockResolvedValue(history);

    const result = await controller.getNlQueryHistory(
      tenantContext,
      userContext,
      { page: 1, pageSize: 20 },
    );

    expect(result).toEqual(history);
    expect(mockNlQueryService.getQueryHistory).toHaveBeenCalledWith(TENANT_ID, USER_ID, 1, 20);
  });

  // ─── Grade Publishing ──────────────────────────────────────────────────

  it('should return the grade publishing readiness dashboard', async () => {
    const dashboard = { classes: [], ready_count: 0, total: 5 };
    mockGradePublishingService.getReadinessDashboard.mockResolvedValue(dashboard);

    const result = await controller.getReadinessDashboard(tenantContext, {
      period_id: PERIOD_ID,
      class_id: CLASS_ID,
    });

    expect(result).toEqual(dashboard);
    expect(mockGradePublishingService.getReadinessDashboard).toHaveBeenCalledWith(
      TENANT_ID,
      { period_id: PERIOD_ID, class_id: CLASS_ID },
    );
  });

  it('should publish grades for a list of assessments', async () => {
    const dto = { assessment_ids: [ASSESSMENT_ID] };
    const published = { published: 1 };
    mockGradePublishingService.publishGrades.mockResolvedValue(published);

    const result = await controller.publishGrades(tenantContext, userContext, dto);

    expect(result).toEqual(published);
    expect(mockGradePublishingService.publishGrades).toHaveBeenCalledWith(
      TENANT_ID, USER_ID, [ASSESSMENT_ID],
    );
  });

  it('should publish period grades for a class/period pair', async () => {
    const dto = { class_id: CLASS_ID, period_id: PERIOD_ID };
    const published = { published: 20 };
    mockGradePublishingService.publishPeriodGrades.mockResolvedValue(published);

    const result = await controller.publishPeriodGrades(tenantContext, userContext, dto);

    expect(result).toEqual(published);
    expect(mockGradePublishingService.publishPeriodGrades).toHaveBeenCalledWith(
      TENANT_ID, USER_ID, CLASS_ID, PERIOD_ID,
    );
  });

  // ─── Progress Reports ──────────────────────────────────────────────────

  it('should generate progress reports for a class/period', async () => {
    const dto = { class_id: CLASS_ID, academic_period_id: PERIOD_ID };
    const generated = { generated: 25 };
    mockProgressReportService.generate.mockResolvedValue(generated);

    const result = await controller.generateProgressReports(tenantContext, userContext, dto);

    expect(result).toEqual(generated);
    expect(mockProgressReportService.generate).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      { class_id: CLASS_ID, academic_period_id: PERIOD_ID },
    );
  });

  it('should list progress reports with pagination', async () => {
    const listResult = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    mockProgressReportService.list.mockResolvedValue(listResult);

    const query = { page: 1, pageSize: 20 };
    const result = await controller.listProgressReports(tenantContext, query);

    expect(result).toEqual(listResult);
    expect(mockProgressReportService.list).toHaveBeenCalledWith(TENANT_ID, query);
  });
});
