import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AcademicsModule } from '../../academics/academics.module';
import { AiModule } from '../../ai/ai.module';
import { AttendanceModule } from '../../attendance/attendance.module';
import { ClassesModule } from '../../classes/classes.module';
import { ConfigurationModule } from '../../configuration/configuration.module';
import { GdprModule } from '../../gdpr/gdpr.module';
import { PdfRenderingModule } from '../../pdf-rendering/pdf-rendering.module';
import { StudentsModule } from '../../students/students.module';
import { TenantsModule } from '../../tenants/tenants.module';

import { GradeThresholdService } from './grade-threshold.service';
import { ReportCardAcknowledgmentService } from './report-card-acknowledgment.service';
import { ReportCardAiDraftService } from './report-card-ai-draft.service';
import { ReportCardAnalyticsService } from './report-card-analytics.service';
import { ReportCardApprovalService } from './report-card-approval.service';
import { ReportCardCustomFieldsService } from './report-card-custom-fields.service';
import { ReportCardDeliveryService } from './report-card-delivery.service';
import { ReportCardOverallCommentsController } from './report-card-overall-comments.controller';
import { ReportCardOverallCommentsService } from './report-card-overall-comments.service';
import { ReportCardSubjectCommentsController } from './report-card-subject-comments.controller';
import { ReportCardSubjectCommentsService } from './report-card-subject-comments.service';
import { ReportCardTemplateService } from './report-card-template.service';
import { ReportCardVerificationService } from './report-card-verification.service';
import {
  ReportCardVerificationController,
  ReportCardsEnhancedController,
} from './report-cards-enhanced.controller';
import { ReportCardsQueriesService } from './report-cards-queries.service';
import { ReportCardsController } from './report-cards.controller';
import { ReportCardsService } from './report-cards.service';
import { ReportCommentWindowsController } from './report-comment-windows.controller';
import { ReportCommentWindowsService } from './report-comment-windows.service';

// ─── Report Card Sub-Module ──────────────────────────────────────────────────
// Encapsulates all report card concerns: generation, templates, approval
// workflows, delivery, custom fields, verification, acknowledgment,
// analytics, and grade thresholds.
//
// Exports ReportCardsService for consumption by the parent GradebookModule
// (used by ParentGradebookController).

@Module({
  imports: [
    AcademicsModule,
    AiModule,
    AttendanceModule,
    ClassesModule,
    ConfigurationModule,
    GdprModule,
    PdfRenderingModule,
    StudentsModule,
    TenantsModule,
    BullModule.registerQueue({ name: 'gradebook' }),
  ],
  controllers: [
    ReportCardsController,
    ReportCardsEnhancedController,
    ReportCardVerificationController,
    ReportCommentWindowsController,
    ReportCardSubjectCommentsController,
    ReportCardOverallCommentsController,
  ],
  providers: [
    // ─── Core ────────────────────────────────────────────────────────────────
    ReportCardsService,
    ReportCardsQueriesService,

    // ─── Templates & Theming ─────────────────────────────────────────────────
    ReportCardTemplateService,
    GradeThresholdService,

    // ─── Approval Workflow ───────────────────────────────────────────────────
    ReportCardApprovalService,

    // ─── Delivery & Verification ─────────────────────────────────────────────
    ReportCardDeliveryService,
    ReportCardVerificationService,
    ReportCardAcknowledgmentService,

    // ─── Custom Fields ───────────────────────────────────────────────────────
    ReportCardCustomFieldsService,

    // ─── Analytics ───────────────────────────────────────────────────────────
    ReportCardAnalyticsService,

    // ─── Comment Subsystem (impl 02) ─────────────────────────────────────────
    ReportCommentWindowsService,
    ReportCardSubjectCommentsService,
    ReportCardOverallCommentsService,
    ReportCardAiDraftService,
  ],
  exports: [ReportCardsService, ReportCardsQueriesService, ReportCommentWindowsService],
})
export class ReportCardModule {}
