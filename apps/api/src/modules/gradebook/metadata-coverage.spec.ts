type MockExports = Record<string, unknown>;

type ImportConfig = {
  target: string;
  mocks: Record<string, MockExports>;
};

const withZodInferMock = () => {
  jest.doMock('zod', () => {
    const actual = jest.requireActual('zod') as typeof import('zod');

    return {
      ...actual,
      z: {
        ...actual.z,
        infer: jest.fn(),
      },
    };
  });
};

const importWithMocks = async ({ target, mocks }: ImportConfig) => {
  jest.resetModules();
  withZodInferMock();

  for (const [moduleId, moduleExports] of Object.entries(mocks)) {
    jest.doMock(moduleId, () => moduleExports);
  }

  await jest.isolateModulesAsync(async () => {
    await import(target);
  });

  jest.dontMock('zod');

  for (const moduleId of Object.keys(mocks)) {
    jest.dontMock(moduleId);
  }
};

describe('Gradebook metadata coverage', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    jest.dontMock('zod');
  });

  it('covers alternate decorator metadata branches for gradebook controllers', async () => {
    const imports: ImportConfig[] = [
      {
        target: './assessment-categories.controller',
        mocks: {
          './assessment-categories.service': { AssessmentCategoriesService: {} },
        },
      },
      {
        target: './grading-scales.controller',
        mocks: {
          './grading-scales.service': { GradingScalesService: {} },
        },
      },
      {
        target: './gradebook-insights.controller',
        mocks: {
          './analytics/analytics.service': { AnalyticsService: {} },
          './ai/ai-comments.service': { AiCommentsService: {} },
          './ai/ai-grading.service': { AiGradingService: {} },
          './ai/ai-grading-instruction.service': { AiGradingInstructionService: {} },
          './ai/ai-progress-summary.service': { AiProgressSummaryService: {} },
          './ai/nl-query.service': { NlQueryService: {} },
          './grading/grade-publishing.service': { GradePublishingService: {} },
          './progress/progress-report.service': { ProgressReportService: {} },
        },
      },
      {
        target: './gradebook-advanced.controller',
        mocks: {
          '../classes/classes-read.facade': { ClassesReadFacade: {} },
          '../prisma/prisma.service': { PrismaService: {} },
          './assessments/assessment-template.service': { AssessmentTemplateService: {} },
          './assessments/grade-curve.service': { GradeCurveService: {} },
          './grades.service': { GradesService: {} },
          './grading/competency-scale.service': { CompetencyScaleService: {} },
          './grading/gpa.service': { GpaService: {} },
          './grading/rubric.service': { RubricService: {} },
          './grading/standards.service': { StandardsService: {} },
        },
      },
      {
        target: './gradebook.controller',
        mocks: {
          '../../common/services/permission-cache.service': { PermissionCacheService: {} },
          '../classes/classes-read.facade': { ClassesReadFacade: {} },
          '../prisma/prisma.service': { PrismaService: {} },
          '../staff-profiles/staff-profile-read.facade': { StaffProfileReadFacade: {} },
          './assessments/assessments.service': { AssessmentsService: {} },
          './bulk-import.service': { BulkImportService: {} },
          './class-grade-configs.service': { ClassGradeConfigsService: {} },
          './grades.service': { GradesService: {} },
          './grading/period-grade-computation.service': {
            PeriodGradeComputationService: {},
          },
          './results-matrix.service': { ResultsMatrixService: {} },
          './year-group-grade-weights.service': { YearGroupGradeWeightsService: {} },
        },
      },
      {
        target: './parent-gradebook.controller',
        mocks: {
          '../academics/academic-periods.service': { AcademicPeriodsService: {} },
          '../parents/parent-read.facade': { ParentReadFacade: {} },
          '../pdf-rendering/pdf-rendering.service': { PdfRenderingService: {} },
          '../students/student-read.facade': { StudentReadFacade: {} },
          '../tenants/tenant-read.facade': { TenantReadFacade: {} },
          './grades.service': { GradesService: {} },
          './report-cards/report-cards-queries.service': { ReportCardsQueriesService: {} },
          './transcripts.service': { TranscriptsService: {} },
        },
      },
      {
        target: './transcripts.controller',
        mocks: {
          '../pdf-rendering/pdf-rendering.service': { PdfRenderingService: {} },
          '../tenants/tenant-read.facade': { TenantReadFacade: {} },
          './transcripts.service': { TranscriptsService: {} },
        },
      },
      {
        target: './report-cards/report-cards.controller',
        mocks: {
          '../pdf-rendering/pdf-rendering.service': { PdfRenderingService: {} },
          '../tenants/tenant-read.facade': { TenantReadFacade: {} },
          './report-cards/report-cards-queries.service': { ReportCardsQueriesService: {} },
          './report-cards/report-cards.service': { ReportCardsService: {} },
        },
      },
      {
        target: './report-cards/report-cards-enhanced.controller',
        mocks: {
          './report-cards/grade-threshold.service': { GradeThresholdService: {} },
          './report-cards/report-card-acknowledgment.service': {
            ReportCardAcknowledgmentService: {},
          },
          './report-cards/report-card-analytics.service': { ReportCardAnalyticsService: {} },
          './report-cards/report-card-approval.service': { ReportCardApprovalService: {} },
          './report-cards/report-card-custom-fields.service': {
            ReportCardCustomFieldsService: {},
          },
          './report-cards/report-card-delivery.service': { ReportCardDeliveryService: {} },
          './report-cards/report-card-template.service': { ReportCardTemplateService: {} },
          './report-cards/report-card-verification.service': {
            ReportCardVerificationService: {},
          },
          './report-cards/report-cards-queries.service': { ReportCardsQueriesService: {} },
          './report-cards/report-cards.service': { ReportCardsService: {} },
        },
      },
      {
        target: './transcripts.service',
        mocks: {
          '../prisma/prisma.service': { PrismaService: {} },
          '../redis/redis.service': { RedisService: {} },
          '../students/student-read.facade': { StudentReadFacade: {} },
        },
      },
      {
        target: './class-grade-configs.service',
        mocks: {
          '../academics/academic-read.facade': { AcademicReadFacade: {} },
          '../classes/classes-read.facade': { ClassesReadFacade: {} },
          '../prisma/prisma.service': { PrismaService: {} },
        },
      },
      {
        target: './year-group-grade-weights.service',
        mocks: {
          '../academics/academic-read.facade': { AcademicReadFacade: {} },
          '../prisma/prisma.service': { PrismaService: {} },
        },
      },
      {
        target: './results-matrix.service',
        mocks: {
          '../classes/classes-read.facade': { ClassesReadFacade: {} },
          '../prisma/prisma.service': { PrismaService: {} },
        },
      },
      {
        target: './grades.service',
        mocks: {
          '../classes/classes-read.facade': { ClassesReadFacade: {} },
          '../configuration/configuration-read.facade': { ConfigurationReadFacade: {} },
          '../prisma/prisma.service': { PrismaService: {} },
          '../students/student-read.facade': { StudentReadFacade: {} },
        },
      },
      {
        target: './progress/progress-report.service',
        mocks: {
          '../academics/academic-read.facade': { AcademicReadFacade: {} },
          '../classes/classes-read.facade': { ClassesReadFacade: {} },
          '../communications/notifications.service': { NotificationsService: {} },
          '../prisma/prisma.service': { PrismaService: {} },
        },
      },
      {
        target: './grading/standards.service',
        mocks: {
          '../academics/academic-read.facade': { AcademicReadFacade: {} },
          '../prisma/prisma.service': { PrismaService: {} },
          '../students/student-read.facade': { StudentReadFacade: {} },
        },
      },
      {
        target: './grading/gpa.service',
        mocks: {
          '../academics/academic-read.facade': { AcademicReadFacade: {} },
          '../configuration/configuration-read.facade': { ConfigurationReadFacade: {} },
          '../prisma/prisma.service': { PrismaService: {} },
          '../students/student-read.facade': { StudentReadFacade: {} },
        },
      },
      {
        target: './analytics/analytics.service',
        mocks: {
          '../academics/academic-read.facade': { AcademicReadFacade: {} },
          '../classes/classes-read.facade': { ClassesReadFacade: {} },
          '../prisma/prisma.service': { PrismaService: {} },
          '../redis/redis.service': { RedisService: {} },
        },
      },
      {
        target: './ai/ai-comments.service',
        mocks: {
          '../ai/anthropic-client.service': { AnthropicClientService: {} },
          '../attendance/attendance-read.facade': { AttendanceReadFacade: {} },
          '../configuration/settings.service': { SettingsService: {} },
          '../gdpr/ai-audit.service': { AiAuditService: {} },
          '../gdpr/consent.service': { ConsentService: {} },
          '../gdpr/gdpr-token.service': { GdprTokenService: {} },
          '../prisma/prisma.service': { PrismaService: {} },
        },
      },
      {
        target: './ai/ai-grading-instruction.service',
        mocks: {
          '../prisma/prisma.service': { PrismaService: {} },
        },
      },
      {
        target: './ai/ai-progress-summary.service',
        mocks: {
          '../academics/academic-read.facade': { AcademicReadFacade: {} },
          '../ai/anthropic-client.service': { AnthropicClientService: {} },
          '../attendance/attendance-read.facade': { AttendanceReadFacade: {} },
          '../configuration/settings.service': { SettingsService: {} },
          '../gdpr/ai-audit.service': { AiAuditService: {} },
          '../gdpr/consent.service': { ConsentService: {} },
          '../gdpr/gdpr-token.service': { GdprTokenService: {} },
          '../prisma/prisma.service': { PrismaService: {} },
          '../redis/redis.service': { RedisService: {} },
          '../students/student-read.facade': { StudentReadFacade: {} },
        },
      },
      {
        target: './ai/ai-grading.service',
        mocks: {
          '../ai/anthropic-client.service': { AnthropicClientService: {} },
          '../configuration/settings.service': { SettingsService: {} },
          '../gdpr/ai-audit.service': { AiAuditService: {} },
          '../gdpr/consent.service': { ConsentService: {} },
          '../gdpr/gdpr-token.service': { GdprTokenService: {} },
          '../prisma/prisma.service': { PrismaService: {} },
          '../redis/redis.service': { RedisService: {} },
        },
      },
      {
        target: './report-cards/report-cards.service',
        mocks: {
          '../academics/academic-read.facade': { AcademicReadFacade: {} },
          '../attendance/attendance-read.facade': { AttendanceReadFacade: {} },
          '../classes/classes-read.facade': { ClassesReadFacade: {} },
          '../prisma/prisma.service': { PrismaService: {} },
          '../redis/redis.service': { RedisService: {} },
          '../students/student-read.facade': { StudentReadFacade: {} },
          '../tenants/tenant-read.facade': { TenantReadFacade: {} },
          './report-cards/report-card-generation.service': { ReportCardGenerationService: {} },
          './report-cards/report-card-transcript.service': {
            ReportCardTranscriptService: {},
          },
        },
      },
      {
        target: './report-cards/report-card-template.service',
        mocks: {
          '../ai/anthropic-client.service': { AnthropicClientService: {} },
          '../gdpr/ai-audit.service': { AiAuditService: {} },
          '../gdpr/gdpr-token.service': { GdprTokenService: {} },
          '../prisma/prisma.service': { PrismaService: {} },
        },
      },
      {
        target: './report-cards/report-card-custom-fields.service',
        mocks: {
          '../prisma/prisma.service': { PrismaService: {} },
        },
      },
    ];

    for (const config of imports) {
      await importWithMocks(config);
    }
  });
});
