import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { StudentsModule } from '../students/students.module';

import { ParentReadFacade } from './parent-read.facade';
import { ParentTimetableController } from './parent-timetable.controller';
import { ParentTimetableService } from './parent-timetable.service';
import { ParentsController } from './parents.controller';
import { ParentsService } from './parents.service';

@Module({
  // StudentsModule already imports ParentsModule (StudentsService writes
  // student-parent links) — forwardRef breaks the cycle.
  imports: [AuthModule, forwardRef(() => StudentsModule)],
  controllers: [ParentsController, ParentTimetableController],
  providers: [ParentsService, ParentReadFacade, ParentTimetableService],
  exports: [ParentsService, ParentReadFacade],
})
export class ParentsModule {}
