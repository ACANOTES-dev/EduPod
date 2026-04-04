import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RoomsModule } from '../rooms/rooms.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';

import { ConflictDetectionService } from './conflict-detection.service';
import { SchedulesReadFacade } from './schedules-read.facade';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { TimetablesController } from './timetables.controller';
import { TimetablesService } from './timetables.service';

@Module({
  imports: [AuthModule, RoomsModule, StaffProfilesModule],
  controllers: [SchedulesController, TimetablesController],
  providers: [SchedulesService, ConflictDetectionService, TimetablesService, SchedulesReadFacade],
  exports: [SchedulesService, SchedulesReadFacade],
})
export class SchedulesModule {}
