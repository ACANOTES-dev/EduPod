import { forwardRef, Module } from '@nestjs/common';

import { AttendanceModule } from '../attendance/attendance.module';
import { AuthModule } from '../auth/auth.module';
import { ClassesModule } from '../classes/classes.module';
import { RoomsModule } from '../rooms/rooms.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';

import { ConflictDetectionService } from './conflict-detection.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesReadFacade } from './schedules-read.facade';
import { SchedulesService } from './schedules.service';
import { TimetablesController } from './timetables.controller';
import { TimetablesService } from './timetables.service';

@Module({
  imports: [
    forwardRef(() => AttendanceModule),
    AuthModule,
    ClassesModule,
    RoomsModule,
    StaffProfilesModule,
  ],
  controllers: [SchedulesController, TimetablesController],
  providers: [SchedulesService, ConflictDetectionService, TimetablesService, SchedulesReadFacade],
  exports: [SchedulesService, SchedulesReadFacade],
})
export class SchedulesModule {}
