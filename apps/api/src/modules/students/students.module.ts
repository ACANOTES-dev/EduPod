import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { HouseholdNumberService } from '../households/household-number.service';
import { ParentsModule } from '../parents/parents.module';
import { SequenceModule } from '../sequence/sequence.module';

import { StudentReadFacade } from './student-read.facade';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  // SCHED-032 / SCHED-035 — ParentsModule now imports StudentsModule
  // (to get StudentReadFacade for the parent / student timetable views),
  // completing the cycle. forwardRef breaks it at the import boundary.
  imports: [AuthModule, forwardRef(() => ParentsModule), SequenceModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentReadFacade, HouseholdNumberService],
  exports: [StudentsService, StudentReadFacade],
})
export class StudentsModule {}
