import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AuthModule } from '../auth/auth.module';
import { ClassesModule } from '../classes/classes.module';
import { PeriodGridModule } from '../period-grid/period-grid.module';
import { RoomsModule } from '../rooms/rooms.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { StaffAvailabilityModule } from '../staff-availability/staff-availability.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';

import { SchedulingApplyService } from './scheduling-apply.service';
import { SchedulingDashboardController } from './scheduling-dashboard.controller';
import { SchedulingDashboardService } from './scheduling-dashboard.service';
import { SchedulingPrerequisitesService } from './scheduling-prerequisites.service';
import { SchedulingRunsReadFacade } from './scheduling-runs-read.facade';
import { SchedulingRunsController } from './scheduling-runs.controller';
import { SchedulingRunsService } from './scheduling-runs.service';

@Module({
  imports: [
    AcademicsModule,
    AuthModule,
    ClassesModule,
    PeriodGridModule,
    RoomsModule,
    SchedulesModule,
    StaffAvailabilityModule,
    StaffProfilesModule,
  ],
  controllers: [SchedulingRunsController, SchedulingDashboardController],
  providers: [
    SchedulingRunsService,
    SchedulingApplyService,
    SchedulingPrerequisitesService,
    SchedulingDashboardService,
    SchedulingRunsReadFacade,
  ],
  exports: [SchedulingRunsService, SchedulingRunsReadFacade],
})
export class SchedulingRunsModule {}
