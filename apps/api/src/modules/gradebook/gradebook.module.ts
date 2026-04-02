import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { GdprModule } from '../gdpr/gdpr.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';

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
import { ReportCardModule } from './report-cards/report-card.module';
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
    // ─── Report Card Sub-Module ──────────────────────────────────────────────
    ReportCardModule,
  ],
  controllers: [
    GradingScalesController,
    AssessmentCategoriesController,
    GradebookController,
    GradebookAdvancedController,
    GradebookInsightsController,
    TranscriptsController,
    ParentGradebookController,
  ],
  providers: [
    // ─── Core Grading ────────────────────────────────────────────────────────
    GradingScalesService,
    AssessmentCategoriesService,
    ClassGradeConfigsService,
    AssessmentsService,
    GradesService,
    PeriodGradeComputationService,
    ResultsMatrixService,
    TranscriptsService,
    BulkImportService,
    YearGroupGradeWeightsService,

    // ─── Advanced Grading (C1-C7) ────────────────────────────────────────────
    RubricService,
    StandardsService,
    CompetencyScaleService,
    GpaService,
    GradeCurveService,
    AssessmentTemplateService,

    // ─── Analytics ───────────────────────────────────────────────────────────
    AnalyticsService,

    // ─── AI Features ─────────────────────────────────────────────────────────
    AiCommentsService,
    AiGradingService,
    AiGradingInstructionService,
    NlQueryService,
    AiProgressSummaryService,

    // ─── Parent Experience ───────────────────────────────────────────────────
    GradePublishingService,
    ProgressReportService,
  ],
  exports: [ReportCardModule, TranscriptsService],
})
export class GradebookModule {}
