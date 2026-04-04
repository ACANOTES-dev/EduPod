import { forwardRef, Module } from '@nestjs/common';

import { AdmissionsModule } from '../admissions/admissions.module';
import { AiModule } from '../ai/ai.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ClassesModule } from '../classes/classes.module';
import { CommunicationsModule } from '../communications/communications.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { FinanceModule } from '../finance/finance.module';
import { GdprModule } from '../gdpr/gdpr.module';
import { GradebookModule } from '../gradebook/gradebook.module';
import { PayrollModule } from '../payroll/payroll.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';
import { StudentsModule } from '../students/students.module';

import { AdmissionsAnalyticsService } from './admissions-analytics.service';
import { AiPredictionsService } from './ai-predictions.service';
import { AiReportNarratorService } from './ai-report-narrator.service';
import { AttendanceAnalyticsService } from './attendance-analytics.service';
import { BoardReportService } from './board-report.service';
import { ComplianceReportService } from './compliance-report.service';
import { CrossModuleInsightsService } from './cross-module-insights.service';
import { CustomReportBuilderService } from './custom-report-builder.service';
import { DemographicsService } from './demographics.service';
import { GradeAnalyticsService } from './grade-analytics.service';
import { ReportAlertsService } from './report-alerts.service';
import { ReportExportService } from './report-export.service';
import { ReportsDataAccessService } from './reports-data-access.service';
import { ReportsEnhancedController } from './reports-enhanced.controller';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ScheduledReportsService } from './scheduled-reports.service';
import { StaffAnalyticsService } from './staff-analytics.service';
import { StudentProgressService } from './student-progress.service';
import { UnifiedDashboardService } from './unified-dashboard.service';

@Module({
  imports: [
    AiModule,
    ConfigurationModule,
    GdprModule,
    forwardRef(() => StudentsModule),
    forwardRef(() => StaffProfilesModule),
    forwardRef(() => ClassesModule),
    forwardRef(() => AttendanceModule),
    forwardRef(() => GradebookModule),
    forwardRef(() => FinanceModule),
    forwardRef(() => AdmissionsModule),
    forwardRef(() => PayrollModule),
    forwardRef(() => CommunicationsModule),
    forwardRef(() => AuditLogModule),
  ],
  controllers: [ReportsController, ReportsEnhancedController],
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
    ComplianceReportService,
    ScheduledReportsService,
    ReportAlertsService,
    AiReportNarratorService,
    AiPredictionsService,
    ReportExportService,
  ],
  exports: [
    ReportsDataAccessService,
    ReportsService,
    UnifiedDashboardService,
    ScheduledReportsService,
    ReportAlertsService,
  ],
})
export class ReportsModule {}
