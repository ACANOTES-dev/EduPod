import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ApprovalsModule } from '../approvals/approvals.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';

import { CalculationService } from './calculation.service';
import { CompensationController } from './compensation.controller';
import { CompensationService } from './compensation.service';
import { PayrollDashboardController } from './payroll-dashboard.controller';
import { PayrollDashboardService } from './payroll-dashboard.service';
import { PayrollEntriesController } from './payroll-entries.controller';
import { PayrollEntriesService } from './payroll-entries.service';
import { PayrollReportsController } from './payroll-reports.controller';
import { PayrollReportsService } from './payroll-reports.service';
import { PayrollRunsController } from './payroll-runs.controller';
import { PayrollRunsService } from './payroll-runs.service';
import { PayslipsController } from './payslips.controller';
import { PayslipsService } from './payslips.service';

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
  ],
  providers: [
    CalculationService,
    CompensationService,
    PayrollRunsService,
    PayrollEntriesService,
    PayslipsService,
    PayrollReportsService,
    PayrollDashboardService,
  ],
  exports: [PayrollRunsService],
})
export class PayrollModule {}
