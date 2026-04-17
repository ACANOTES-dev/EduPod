import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AuthModule } from '../auth/auth.module';
import { ClassesModule } from '../classes/classes.module';
import { GradebookModule } from '../gradebook/gradebook.module';
import { PeriodGridModule } from '../period-grid/period-grid.module';
import { RoomsModule } from '../rooms/rooms.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { StaffAvailabilityModule } from '../staff-availability/staff-availability.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';

import { DiagnosticsTranslatorService } from './diagnostics-i18n/translator.service';
import { SchedulingApplyService } from './scheduling-apply.service';
import { SchedulingDashboardController } from './scheduling-dashboard.controller';
import { SchedulingDashboardService } from './scheduling-dashboard.service';
import { SchedulingDiagnosticsService } from './scheduling-diagnostics.service';
import { SchedulingPrerequisitesService } from './scheduling-prerequisites.service';
import { SchedulingRunsReadFacade } from './scheduling-runs-read.facade';
import { SchedulingRunsController } from './scheduling-runs.controller';
import { SchedulingRunsService } from './scheduling-runs.service';
import { SchedulingSimulationService } from './scheduling-simulation.service';

@Module({
  imports: [
    AcademicsModule,
    AuthModule,
    BullModule.registerQueue({ name: 'scheduling' }),
    ClassesModule,
    GradebookModule,
    PeriodGridModule,
    RoomsModule,
    SchedulesModule,
    SchedulingModule,
    StaffAvailabilityModule,
    StaffProfilesModule,
  ],
  controllers: [SchedulingRunsController, SchedulingDashboardController],
  providers: [
    SchedulingRunsService,
    SchedulingApplyService,
    SchedulingPrerequisitesService,
    SchedulingDashboardService,
    SchedulingDiagnosticsService,
    DiagnosticsTranslatorService,
    SchedulingSimulationService,
    SchedulingRunsReadFacade,
  ],
  exports: [SchedulingRunsService, SchedulingRunsReadFacade],
})
export class SchedulingRunsModule {}
