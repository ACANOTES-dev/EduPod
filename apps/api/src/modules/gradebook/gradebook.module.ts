import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { GdprModule } from '../gdpr/gdpr.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { RedisModule } from '../redis/redis.module';

import { AiCommentsService } from './ai/ai-comments.service';
import { AiGradingInstructionService } from './ai/ai-grading-instruction.service';
import { AiGradingService } from './ai/ai-grading.service';
import { AiProgressSummaryService } from './ai/ai-progress-summary.service';
import { NlQueryService } from './ai/nl-query.service';
import { AnalyticsService } from './analytics/analytics.service';
import { AssessmentCategoriesController } from './assessment-categories.controller';
import { AssessmentCategoriesService } from './assessment-categories.service';
import { AssessmentTemplateService } from './assessments/assessment-template.service';
import { AssessmentsService } from './assessments/assessments.service';
import { GradeCurveService } from './assessments/grade-curve.service';
import { BulkImportService } from './bulk-import.service';
import { ClassGradeConfigsService } from './class-grade-configs.service';
import { GradebookAdvancedController } from './gradebook-advanced.controller';
import { GradebookInsightsController } from './gradebook-insights.controller';
import { GradebookController } from './gradebook.controller';
import { GradesService } from './grades.service';
import { CompetencyScaleService } from './grading/competency-scale.service';
import { GpaService } from './grading/gpa.service';
import { GradePublishingService } from './grading/grade-publishing.service';
import { PeriodGradeComputationService } from './grading/period-grade-computation.service';
import { RubricService } from './grading/rubric.service';
import { StandardsService } from './grading/standards.service';
import { GradingScalesController } from './grading-scales.controller';
import { GradingScalesService } from './grading-scales.service';
import { ParentGradebookController } from './parent-gradebook.controller';
import { ProgressReportService } from './progress/progress-report.service';
import { GradeThresholdService } from './report-cards/grade-threshold.service';
import { ReportCardAcknowledgmentService } from './report-cards/report-card-acknowledgment.service';
import { ReportCardAnalyticsService } from './report-cards/report-card-analytics.service';
import { ReportCardApprovalService } from './report-cards/report-card-approval.service';
import { ReportCardCustomFieldsService } from './report-cards/report-card-custom-fields.service';
import { ReportCardDeliveryService } from './report-cards/report-card-delivery.service';
import { ReportCardTemplateService } from './report-cards/report-card-template.service';
import { ReportCardVerificationService } from './report-cards/report-card-verification.service';
import {
  ReportCardsEnhancedController,
  ReportCardVerificationController,
} from './report-cards/report-cards-enhanced.controller';
import { ReportCardsQueriesService } from './report-cards/report-cards-queries.service';
import { ReportCardsController } from './report-cards/report-cards.controller';
import { ReportCardsService } from './report-cards/report-cards.service';
import { ResultsMatrixService } from './results-matrix.service';
import { TranscriptsController } from './transcripts.controller';
import { TranscriptsService } from './transcripts.service';
import { YearGroupGradeWeightsService } from './year-group-grade-weights.service';

@Module({
  imports: [
    AcademicsModule,
    AuthModule,
    CommunicationsModule,
    ConfigurationModule,
    GdprModule,
    PdfRenderingModule,
    RedisModule,
    BullModule.registerQueue({ name: 'gradebook' }),
  ],
  controllers: [
    GradingScalesController,
    AssessmentCategoriesController,
    GradebookController,
    GradebookAdvancedController,
    GradebookInsightsController,
    ReportCardsController,
    TranscriptsController,
    ParentGradebookController,
    // Report Cards Enhancement
    ReportCardsEnhancedController,
    ReportCardVerificationController,
  ],
  providers: [
    GradingScalesService,
    AssessmentCategoriesService,
    ClassGradeConfigsService,
    AssessmentsService,
    GradesService,
    PeriodGradeComputationService,
    ResultsMatrixService,
    ReportCardsQueriesService,
    ReportCardsService,
    TranscriptsService,
    BulkImportService,
    YearGroupGradeWeightsService,
    // C1–C7 Advanced Grading
    RubricService,
    StandardsService,
    CompetencyScaleService,
    GpaService,
    GradeCurveService,
    AssessmentTemplateService,
    // A: Analytics
    AnalyticsService,
    // B: AI Features
    AiCommentsService,
    AiGradingService,
    AiGradingInstructionService,
    NlQueryService,
    AiProgressSummaryService,
    // D: Parent Experience
    GradePublishingService,
    ProgressReportService,
    // Report Cards World-Class Enhancement
    ReportCardTemplateService,
    ReportCardApprovalService,
    ReportCardDeliveryService,
    ReportCardCustomFieldsService,
    GradeThresholdService,
    ReportCardVerificationService,
    ReportCardAcknowledgmentService,
    ReportCardAnalyticsService,
  ],
  exports: [ReportCardsService, TranscriptsService],
})
export class GradebookModule {}
