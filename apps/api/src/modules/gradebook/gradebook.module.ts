import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { RedisModule } from '../redis/redis.module';

import { AiCommentsService } from './ai-comments.service';
import { AiGradingInstructionService } from './ai-grading-instruction.service';
import { AiGradingService } from './ai-grading.service';
import { AiProgressSummaryService } from './ai-progress-summary.service';
import { AnalyticsService } from './analytics.service';
import { AssessmentCategoriesController } from './assessment-categories.controller';
import { AssessmentCategoriesService } from './assessment-categories.service';
import { AssessmentTemplateService } from './assessment-template.service';
import { AssessmentsService } from './assessments.service';
import { BulkImportService } from './bulk-import.service';
import { ClassGradeConfigsService } from './class-grade-configs.service';
import { CompetencyScaleService } from './competency-scale.service';
import { GpaService } from './gpa.service';
import { GradeCurveService } from './grade-curve.service';
import { GradePublishingService } from './grade-publishing.service';
import { GradeThresholdService } from './grade-threshold.service';
import { GradebookAdvancedController } from './gradebook-advanced.controller';
import { GradebookInsightsController } from './gradebook-insights.controller';
import { GradebookController } from './gradebook.controller';
import { GradesService } from './grades.service';
import { GradingScalesController } from './grading-scales.controller';
import { GradingScalesService } from './grading-scales.service';
import { NlQueryService } from './nl-query.service';
import { ParentGradebookController } from './parent-gradebook.controller';
import { PeriodGradeComputationService } from './period-grade-computation.service';
import { ProgressReportService } from './progress-report.service';
import { ReportCardAcknowledgmentService } from './report-card-acknowledgment.service';
import { ReportCardAnalyticsService } from './report-card-analytics.service';
import { ReportCardApprovalService } from './report-card-approval.service';
import { ReportCardCustomFieldsService } from './report-card-custom-fields.service';
import { ReportCardDeliveryService } from './report-card-delivery.service';
import { ReportCardTemplateService } from './report-card-template.service';
import { ReportCardVerificationService } from './report-card-verification.service';
import { ReportCardsEnhancedController, ReportCardVerificationController } from './report-cards-enhanced.controller';
import { ReportCardsController } from './report-cards.controller';
import { ReportCardsService } from './report-cards.service';
import { ResultsMatrixService } from './results-matrix.service';
import { RubricService } from './rubric.service';
import { StandardsService } from './standards.service';
import { TranscriptsController } from './transcripts.controller';
import { TranscriptsService } from './transcripts.service';
import { YearGroupGradeWeightsService } from './year-group-grade-weights.service';

@Module({
  imports: [
    AcademicsModule,
    AuthModule,
    CommunicationsModule,
    ConfigurationModule,
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
