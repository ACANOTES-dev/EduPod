import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AcademicsModule } from '../../academics/academics.module';
import { AiModule } from '../../ai/ai.module';
import { AttendanceModule } from '../../attendance/attendance.module';
import { ClassesModule } from '../../classes/classes.module';
import { CommunicationsModule } from '../../communications/communications.module';
import { ConfigurationModule } from '../../configuration/configuration.module';
import { GdprModule } from '../../gdpr/gdpr.module';
import { ParentsModule } from '../../parents/parents.module';
import { PdfRenderingModule } from '../../pdf-rendering/pdf-rendering.module';
import { RbacModule } from '../../rbac/rbac.module';
import { S3Module } from '../../s3/s3.module';
import { SchedulingModule } from '../../scheduling/scheduling.module';
import { StaffProfilesModule } from '../../staff-profiles/staff-profiles.module';
import { StudentsModule } from '../../students/students.module';
import { TenantsModule } from '../../tenants/tenants.module';

import { GradeThresholdService } from './grade-threshold.service';
import { ReportCardAcknowledgmentService } from './report-card-acknowledgment.service';
import { ReportCardAiDraftService } from './report-card-ai-draft.service';
import { ReportCardAnalyticsService } from './report-card-analytics.service';
import { ReportCardApprovalService } from './report-card-approval.service';
import { ReportCardCustomFieldsService } from './report-card-custom-fields.service';
import { ReportCardDeliveryService } from './report-card-delivery.service';
import { ReportCardGenerationService } from './report-card-generation.service';
import { ReportCardOverallCommentsController } from './report-card-overall-comments.controller';
import { ReportCardOverallCommentsService } from './report-card-overall-comments.service';
import { ReportCardSubjectCommentsController } from './report-card-subject-comments.controller';
import { ReportCardSubjectCommentsService } from './report-card-subject-comments.service';
import { ReportCardTeacherRequestsController } from './report-card-teacher-requests.controller';
import { ReportCardTeacherRequestsService } from './report-card-teacher-requests.service';
import { ReportCardTemplateService } from './report-card-template.service';
import { ReportCardTenantSettingsController } from './report-card-tenant-settings.controller';
import { ReportCardTenantSettingsService } from './report-card-tenant-settings.service';
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
    CommunicationsModule,
    ConfigurationModule,
    GdprModule,
    ParentsModule,
    PdfRenderingModule,
    RbacModule,
    S3Module,
    SchedulingModule,
    StaffProfilesModule,
    StudentsModule,
    TenantsModule,
    BullModule.registerQueue({ name: 'gradebook' }),
  ],
  controllers: [
    // Register ReportCardsEnhancedController BEFORE ReportCardsController.
    // The primary controller has a catch-all `GET /report-cards/:id` route
    // that would otherwise shadow literal sub-paths declared in the enhanced
    // controller (templates, approval-configs, custom-fields, grade-thresholds,
    // analytics). NestJS/Express registers controllers in this order, and
    // the router walks them first-match-wins.
    ReportCardsEnhancedController,
    ReportCardsController,
    ReportCardVerificationController,
    ReportCommentWindowsController,
    ReportCardSubjectCommentsController,
    ReportCardOverallCommentsController,
    ReportCardTenantSettingsController,
    ReportCardTeacherRequestsController,
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

    // ─── Tenant Settings (impl 03) ───────────────────────────────────────────
    ReportCardTenantSettingsService,

    // ─── Generation runs (impl 04) ───────────────────────────────────────────
    ReportCardGenerationService,

    // ─── Teacher requests (impl 05) ──────────────────────────────────────────
    ReportCardTeacherRequestsService,
  ],
  exports: [
    ReportCardsService,
    ReportCardsQueriesService,
    ReportCommentWindowsService,
    // Exported so impl 04 (generation) can read tenant defaults and resolve
    // the correct template for a (scope, locale) pair.
    ReportCardTemplateService,
    ReportCardTenantSettingsService,
    // Exported so the parent gradebook controller can call acknowledge.
    ReportCardAcknowledgmentService,
    // Exported so impl 05 (teacher requests) can auto-execute approved
    // regeneration requests.
    ReportCardGenerationService,
    // Exported so other backend modules may mark requests completed when
    // their downstream flow finishes (housekeeping hook for impl 06+).
    ReportCardTeacherRequestsService,
  ],
})
export class ReportCardModule {}
