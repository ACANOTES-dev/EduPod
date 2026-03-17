import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RoomsModule } from '../rooms/rooms.module';

import { ConflictDetectionService } from './conflict-detection.service';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { TimetablesController } from './timetables.controller';
import { TimetablesService } from './timetables.service';

@Module({
  imports: [AuthModule, RoomsModule],
  controllers: [SchedulesController, TimetablesController],
  providers: [SchedulesService, ConflictDetectionService, TimetablesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
