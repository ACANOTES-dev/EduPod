import { Module, forwardRef } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AuthModule } from '../auth/auth.module';
import { ClassesModule } from '../classes/classes.module';
import { GdprModule } from '../gdpr/gdpr.module';
import { HouseholdsModule } from '../households/households.module';
import { ParentsModule } from '../parents/parents.module';
import { SequenceModule } from '../sequence/sequence.module';

import { StudentReadFacade } from './student-read.facade';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => AcademicsModule),
    forwardRef(() => ClassesModule),
    GdprModule,
    HouseholdsModule,
    ParentsModule,
    SequenceModule,
  ],
  controllers: [StudentsController],
  providers: [StudentsService, StudentReadFacade],
  exports: [StudentsService, StudentReadFacade],
})
export class StudentsModule {}
