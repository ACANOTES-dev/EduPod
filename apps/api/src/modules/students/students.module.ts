import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SequenceModule } from '../sequence/sequence.module';

import { StudentReadFacade } from './student-read.facade';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [AuthModule, SequenceModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentReadFacade],
  exports: [StudentsService, StudentReadFacade],
})
export class StudentsModule {}
