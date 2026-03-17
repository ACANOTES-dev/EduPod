import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { RedisModule } from '../redis/redis.module';
import { GradingScalesController } from './grading-scales.controller';
import { AssessmentCategoriesController } from './assessment-categories.controller';
import { GradebookController } from './gradebook.controller';
import { ReportCardsController } from './report-cards.controller';
import { TranscriptsController } from './transcripts.controller';
import { ParentGradebookController } from './parent-gradebook.controller';
import { GradingScalesService } from './grading-scales.service';
import { AssessmentCategoriesService } from './assessment-categories.service';
import { ClassGradeConfigsService } from './class-grade-configs.service';
import { AssessmentsService } from './assessments.service';
import { GradesService } from './grades.service';
import { PeriodGradeComputationService } from './period-grade-computation.service';
import { ReportCardsService } from './report-cards.service';
import { TranscriptsService } from './transcripts.service';
import { BulkImportService } from './bulk-import.service';

@Module({
  imports: [AuthModule, PdfRenderingModule, RedisModule],
  controllers: [
    GradingScalesController,
    AssessmentCategoriesController,
    GradebookController,
    ReportCardsController,
    TranscriptsController,
    ParentGradebookController,
  ],
  providers: [
    GradingScalesService,
    AssessmentCategoriesService,
    ClassGradeConfigsService,
    AssessmentsService,
    GradesService,
    PeriodGradeComputationService,
    ReportCardsService,
    TranscriptsService,
    BulkImportService,
  ],
  exports: [ReportCardsService, TranscriptsService],
})
export class GradebookModule {}
