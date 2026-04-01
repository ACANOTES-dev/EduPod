import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { GdprModule } from '../../gdpr/gdpr.module';
import { PdfRenderingModule } from '../../pdf-rendering/pdf-rendering.module';

import { GradeThresholdService } from './grade-threshold.service';
import { ReportCardAcknowledgmentService } from './report-card-acknowledgment.service';
import { ReportCardAnalyticsService } from './report-card-analytics.service';
import { ReportCardApprovalService } from './report-card-approval.service';
import { ReportCardCustomFieldsService } from './report-card-custom-fields.service';
import { ReportCardDeliveryService } from './report-card-delivery.service';
import { ReportCardTemplateService } from './report-card-template.service';
import { ReportCardVerificationService } from './report-card-verification.service';
import {
  ReportCardVerificationController,
  ReportCardsEnhancedController,
} from './report-cards-enhanced.controller';
import { ReportCardsController } from './report-cards.controller';
import { ReportCardsService } from './report-cards.service';

// ─── Report Card Sub-Module ──────────────────────────────────────────────────
// Encapsulates all report card concerns: generation, templates, approval
// workflows, delivery, custom fields, verification, acknowledgment,
// analytics, and grade thresholds.
//
// Exports ReportCardsService for consumption by the parent GradebookModule
// (used by ParentGradebookController).

@Module({
  imports: [GdprModule, PdfRenderingModule, BullModule.registerQueue({ name: 'gradebook' })],
  controllers: [
    ReportCardsController,
    ReportCardsEnhancedController,
    ReportCardVerificationController,
  ],
  providers: [
    // ─── Core ────────────────────────────────────────────────────────────────
    ReportCardsService,

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
  ],
  exports: [ReportCardsService],
})
export class ReportCardModule {}
