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
import { PayrollModule } from '../payroll/payroll.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';
import { StudentsModule } from '../students/students.module';

import { AdmissionsAnalyticsService } from './admissions-analytics.service';
import { AiAskAiController } from './ai-ask-ai/ai-ask-ai.controller';
import { AiAskAiService } from './ai-ask-ai/ai-ask-ai.service';
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
import { GradeAnalyticsService } from './grade-analytics.service';
import { QueryEngineService } from './query-engine/query-engine.service';
import { ReportAlertsService } from './report-alerts.service';
import { ReportExportService } from './report-export.service';
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
    // impl 10: declares the dependency on the AI-flags subsystem for
    // intent. `AiFlagGuard` is registered globally via `APP_GUARD` in
    // `AiFlagsModule`, so importing it here is documentary; without the
    // import, `@RequiresAiFlag('reports_narration')` on the new
    // narration endpoints would still resolve. Kept explicit so the
    // module dependency surface is honest and matches the pattern used
    // by `BehaviourAIModule`.
    AiFlagsModule,
    ConfigurationModule,
    GdprModule,
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
    // AiAskAiController (impl 11) owns `/v1/reports/ai-ask-ai*`. Registered
    // before ReportsEnhancedController so its specific path prefix is matched
    // ahead of any wildcard / dynamic segment on the enhanced controller.
    AiAskAiController,
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
    ReportExportService,
    // Subject registry + query engine + builder drafts (impl 02)
    ReportsSubjectRegistryService,
    QueryEngineService,
    SavedReportDraftService,
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
