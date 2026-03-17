import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PeriodGridModule } from '../period-grid/period-grid.module';

import { SchedulingApplyService } from './scheduling-apply.service';
import { SchedulingDashboardController } from './scheduling-dashboard.controller';
import { SchedulingDashboardService } from './scheduling-dashboard.service';
import { SchedulingPrerequisitesService } from './scheduling-prerequisites.service';
import { SchedulingRunsController } from './scheduling-runs.controller';
import { SchedulingRunsService } from './scheduling-runs.service';

@Module({
  imports: [AuthModule, PeriodGridModule],
  controllers: [SchedulingRunsController, SchedulingDashboardController],
  providers: [
    SchedulingRunsService,
    SchedulingApplyService,
    SchedulingPrerequisitesService,
    SchedulingDashboardService,
  ],
  exports: [SchedulingRunsService],
})
export class SchedulingRunsModule {}
