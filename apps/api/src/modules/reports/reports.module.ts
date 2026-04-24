import { forwardRef, Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AdmissionsModule } from '../admissions/admissions.module';
import { AiModule } from '../ai/ai.module';
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
    ScheduledReportsService,
    ReportAlertsService,
    AiReportNarratorService,
    AiPredictionsService,
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
