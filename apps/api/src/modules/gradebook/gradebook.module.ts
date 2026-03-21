import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AuthModule } from '../auth/auth.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { RedisModule } from '../redis/redis.module';

import { AssessmentCategoriesController } from './assessment-categories.controller';
import { AssessmentCategoriesService } from './assessment-categories.service';
import { AssessmentsService } from './assessments.service';
import { BulkImportService } from './bulk-import.service';
import { ClassGradeConfigsService } from './class-grade-configs.service';
import { GradebookController } from './gradebook.controller';
import { GradesService } from './grades.service';
import { GradingScalesController } from './grading-scales.controller';
import { GradingScalesService } from './grading-scales.service';
import { ParentGradebookController } from './parent-gradebook.controller';
import { PeriodGradeComputationService } from './period-grade-computation.service';
import { ReportCardsController } from './report-cards.controller';
import { ReportCardsService } from './report-cards.service';
import { TranscriptsController } from './transcripts.controller';
import { TranscriptsService } from './transcripts.service';

@Module({
  imports: [AcademicsModule, AuthModule, PdfRenderingModule, RedisModule],
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
