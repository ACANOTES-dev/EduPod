import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ClassesModule } from '../classes/classes.module';
import { RoomsModule } from '../rooms/rooms.module';
import { SchedulingModule } from '../scheduling/scheduling.module';

import { ClassRequirementsController } from './class-requirements.controller';
import { ClassRequirementsService } from './class-requirements.service';

@Module({
  imports: [AuthModule, SchedulingModule, ClassesModule, RoomsModule],
  controllers: [ClassRequirementsController],
  providers: [ClassRequirementsService],
  exports: [ClassRequirementsService],
})
export class ClassRequirementsModule {}
