import { forwardRef, Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AdmissionsModule } from '../admissions/admissions.module';
import { AiModule } from '../ai/ai.module';
import { AiFlagsModule } from '../ai-flags/ai-flags.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ClassesModule } from '../classes/classes.module';
import { CommunicationsModule } from '../communications/communications.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { FinanceModule } from '../finance/finance.module';
import { GdprModule } from '../gdpr/gdpr.module';
import { GradebookModule } from '../gradebook/gradebook.module';
import { HouseholdsModule } from '../households/households.module';
import { InboxModule } from '../inbox/inbox.module';
import { PayrollModule } from '../payroll/payroll.module';
import { S3Module } from '../s3/s3.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';
import { StudentsModule } from '../students/students.module';

import { AdmissionsAnalyticsService } from './admissions-analytics.service';
import { AiAskAiController } from './ai-ask-ai/ai-ask-ai.controller';
import { AiAskAiService } from './ai-ask-ai/ai-ask-ai.service';
import { AiPredictionsController } from './ai-predictions.controller';
import { AiPredictionsService } from './ai-predictions.service';
import { AiReportNarratorService } from './ai-report-narrator.service';
import { AttendanceAnalyticsService } from './attendance-analytics.service';
import {
  AcademicSectionAggregator,
  AttendanceSectionAggregator,
  BehaviourSectionAggregator,
  EnrolmentSectionAggregator,
  ExecutiveSummarySectionAggregator,
  FinanceSectionAggregator,
  SafeguardingSectionAggregator,
  StaffingSectionAggregator,
} from './board-report/sections';
import { BoardReportService } from './board-report.service';
import { ComplianceGenerationService } from './compliance-report/compliance-generation.service';
import { ComplianceReportController } from './compliance-report/compliance-report.controller';
import { ComplianceReportService } from './compliance-report.service';
import { CrossModuleInsightsService } from './cross-module-insights.service';
import { CustomReportBuilderService } from './custom-report-builder.service';
import { DemographicsService } from './demographics.service';
// New export pipeline (impl 04) — fronts three format-specific renderers
// (PDF / Excel / Word) and is consumed by impl 13 (sharing) plus impl 08
// (scheduled-reports worker, via reuse of the same buffer contract).
import { ExcelRenderer } from './exports/renderers/excel-renderer';
import { PdfRenderer } from './exports/renderers/pdf-renderer';
import { WordRenderer } from './exports/renderers/word-renderer';
import { ReportExportService } from './exports/report-export.service';
import { GradeAnalyticsService } from './grade-analytics.service';
import { QueryEngineService } from './query-engine/query-engine.service';
import { ReportAlertsService } from './report-alerts.service';
// Legacy export service — only consumed by the legacy
// `POST /v1/reports/export/excel` endpoint on `ReportsEnhancedController`.
// Renamed in impl 13 so the new pipeline (`exports/report-export.service`)
// can land alongside it without DI-token collision.
import { LegacyReportExportService } from './report-export.service';
import { ReportSharingController } from './report-sharing/report-sharing.controller';
import { ReportSharingService } from './report-sharing/report-sharing.service';
import { SnapshotStorageService } from './report-sharing/snapshot-storage.service';
import { ReportsDataAccessService } from './reports-data-access.service';
import { ReportsEnhancedController } from './reports-enhanced.controller';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SavedReportDraftController } from './saved-report-draft/saved-report-draft.controller';
import { SavedReportDraftService } from './saved-report-draft/saved-report-draft.service';
import { ScheduledReportsService } from './scheduled-reports.service';
import { StaffAnalyticsService } from './staff-analytics.service';
import { StudentProgressService } from './student-progress.service';
import { ReportsSubjectRegistryService } from './subject-registry/reports-subject-registry.service';
import { SubjectRegistryController } from './subject-registry/subject-registry.controller';
import { UnifiedDashboardService } from './unified-dashboard.service';

@Module({
  imports: [
    AiModule,
    // impl 12: imported so `AiFlagsService` resolves for the per-handler
    // `@UseGuards(AiFlagGuard)` on AiPredictionsController. The guard
    // itself is registered globally via APP_GUARD inside AiFlagsModule;
    // this import wires the DI provider into the reports scope. Mirrors
    // the `BehaviourAIModule` pattern. Forthcoming impls 10 (narration)
    // and 11 (ask-AI) reuse the same import without re-adding it.
    AiFlagsModule,
    ConfigurationModule,
    GdprModule,
    // Impl 13 (Report Sharing) — exposes ConversationsService for the
    // share → inbox broadcast pipeline, plus S3Service for snapshot
    // artifact uploads. InboxModule re-exports ConversationsService;
    // S3Module exports S3Service. Neither needs `forwardRef` —
    // there's no circular dependency between reports and inbox/s3.
    InboxModule,
    S3Module,
    forwardRef(() => AcademicsModule),
    forwardRef(() => AdmissionsModule),
    forwardRef(() => ApprovalsModule),
    forwardRef(() => AttendanceModule),
    forwardRef(() => AuditLogModule),
    forwardRef(() => ClassesModule),
    forwardRef(() => CommunicationsModule),
    forwardRef(() => FinanceModule),
    forwardRef(() => GradebookModule),
    forwardRef(() => HouseholdsModule),
    forwardRef(() => PayrollModule),
    forwardRef(() => SchedulesModule),
    forwardRef(() => StaffProfilesModule),
    forwardRef(() => StudentsModule),
  ],
  controllers: [
    ReportsController,
    // The draft controller must be registered before ReportsEnhancedController:
    // Express matches routes in registration order and the enhanced controller
    // has `@Get('builder/:reportId')` which otherwise intercepts
    // `/v1/reports/builder/draft` (interpreting `draft` as a UUID).
    SavedReportDraftController,
    SubjectRegistryController,
    // ComplianceReportController (impl 07) owns `/v1/reports/compliance/
    // generate` and `/v1/reports/compliance/history`. Registered before
    // ReportsEnhancedController so its routes aren't shadowed by the
    // compliance-template routes that live on the enhanced controller.
    ComplianceReportController,
    // AiPredictionsController (impl 12) owns `/v1/reports/predictions/*`.
    // Registered before ReportsEnhancedController; the controller itself
    // declares `student-risk/bulk` before the dynamic `student-risk/:id`
    // (route-order lesson from impl 02's `builder/draft` fix).
    AiPredictionsController,
    // AiAskAiController (impl 11) owns `/v1/reports/ai-ask-ai*`. Registered
    // before ReportsEnhancedController so its specific path prefix is
    // matched ahead of any dynamic segment on the enhanced controller.
    AiAskAiController,
    // ReportSharingController (impl 13) owns
    // `/v1/reports/builder/:reportId/share`,
    // `/v1/reports/builder/:reportId/shares`, and
    // `/v1/reports/shared/:shareId`. Registered before
    // `ReportsEnhancedController` so the more-specific suffix routes
    // (`/share`, `/shares`) resolve ahead of the enhanced controller's
    // generic `builder/:reportId` route which uses `ParseUUIDPipe`.
    ReportSharingController,
    ReportsEnhancedController,
  ],
  providers: [
    ReportsDataAccessService,
    ReportsService,
    UnifiedDashboardService,
    CrossModuleInsightsService,
    AttendanceAnalyticsService,
    GradeAnalyticsService,
    DemographicsService,
    StudentProgressService,
    AdmissionsAnalyticsService,
    StaffAnalyticsService,
    CustomReportBuilderService,
    BoardReportService,
    // impl 06: per-section aggregators injected into BoardReportService.
    // Each runs inside a single `createRlsClient` transaction to build
    // one section of the board packet.
    ExecutiveSummarySectionAggregator,
    EnrolmentSectionAggregator,
    AttendanceSectionAggregator,
    AcademicSectionAggregator,
    BehaviourSectionAggregator,
    SafeguardingSectionAggregator,
    FinanceSectionAggregator,
    StaffingSectionAggregator,
    ComplianceReportService,
    // impl 07: generation orchestrator — loads the aggregator registry,
    // runs every aggregator inside one RLS transaction, persists an audit
    // row to `compliance_report_generations`.
    ComplianceGenerationService,
    ScheduledReportsService,
    ReportAlertsService,
    AiReportNarratorService,
    AiPredictionsService,
    // Ask-AI service (impl 11) — translates natural-language questions
    // into builder query proposals via the curated subject registry.
    AiAskAiService,
    LegacyReportExportService,
    // New export pipeline (impl 04). The renderer trio is wired here so
    // every consumer (sharing, scheduled-reports, on-demand HTTP export)
    // resolves the same instance.
    ReportExportService,
    PdfRenderer,
    ExcelRenderer,
    WordRenderer,
    // Subject registry + query engine + builder drafts (impl 02)
    ReportsSubjectRegistryService,
    QueryEngineService,
    SavedReportDraftService,
    // Report sharing (impl 13) — orchestrator for the
    // export → S3 → inbox broadcast → audit pipeline plus the
    // read-only snapshot view.
    ReportSharingService,
    SnapshotStorageService,
  ],
  exports: [
    ReportsDataAccessService,
    ReportsService,
    UnifiedDashboardService,
    ScheduledReportsService,
    ReportAlertsService,
    ReportsSubjectRegistryService,
    QueryEngineService,
    SavedReportDraftService,
  ],
})
export class ReportsModule {}
