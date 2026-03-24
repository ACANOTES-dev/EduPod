import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ApprovalsModule } from '../approvals/approvals.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';

import { CalculationService } from './calculation.service';
import { ClassDeliveryService } from './class-delivery.service';
import { CompensationController } from './compensation.controller';
import { CompensationService } from './compensation.service';
import { PayrollAdjustmentsService } from './payroll-adjustments.service';
import { PayrollAllowancesService } from './payroll-allowances.service';
import { PayrollAnalyticsService } from './payroll-analytics.service';
import { PayrollAnomalyService } from './payroll-anomaly.service';
import { PayrollCalendarService } from './payroll-calendar.service';
import { PayrollDashboardController } from './payroll-dashboard.controller';
import { PayrollDashboardService } from './payroll-dashboard.service';
import { PayrollDeductionsService } from './payroll-deductions.service';
import { PayrollEnhancedController } from './payroll-enhanced.controller';
import { PayrollEntriesController } from './payroll-entries.controller';
import { PayrollEntriesService } from './payroll-entries.service';
import { PayrollExportsService } from './payroll-exports.service';
import { PayrollOneOffsService } from './payroll-one-offs.service';
import { PayrollReportsController } from './payroll-reports.controller';
import { PayrollReportsService } from './payroll-reports.service';
import { PayrollRunsController } from './payroll-runs.controller';
import { PayrollRunsService } from './payroll-runs.service';
import { PayslipsController } from './payslips.controller';
import { PayslipsService } from './payslips.service';
import { StaffAttendanceService } from './staff-attendance.service';

@Module({
  imports: [
    ApprovalsModule,
    PdfRenderingModule,
    ConfigurationModule,
    BullModule.registerQueue({ name: 'payroll' }),
  ],
  controllers: [
    CompensationController,
    PayrollRunsController,
    PayrollEntriesController,
    PayslipsController,
    PayrollReportsController,
    PayrollDashboardController,
    PayrollEnhancedController,
  ],
  providers: [
    CalculationService,
    CompensationService,
    PayrollRunsService,
    PayrollEntriesService,
    PayslipsService,
    PayrollReportsService,
    PayrollDashboardService,
    // Payroll World-Class Services
    StaffAttendanceService,
    ClassDeliveryService,
    PayrollAdjustmentsService,
    PayrollExportsService,
    PayrollAllowancesService,
    PayrollOneOffsService,
    PayrollDeductionsService,
    PayrollAnalyticsService,
    PayrollAnomalyService,
    PayrollCalendarService,
  ],
  exports: [
    PayrollRunsService,
    StaffAttendanceService,
    ClassDeliveryService,
    PayrollAllowancesService,
    PayrollDeductionsService,
  ],
})
export class PayrollModule {}
