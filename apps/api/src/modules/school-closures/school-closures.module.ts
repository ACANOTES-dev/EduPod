import { Module, forwardRef } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { AuthModule } from '../auth/auth.module';
import { ClassesModule } from '../classes/classes.module';

import { SchoolClosuresReadFacade } from './school-closures-read.facade';
import { SchoolClosuresController } from './school-closures.controller';
import { SchoolClosuresService } from './school-closures.service';

@Module({
  imports: [AuthModule, AcademicsModule, ClassesModule, forwardRef(() => AttendanceModule)],
  controllers: [SchoolClosuresController],
  providers: [SchoolClosuresService, SchoolClosuresReadFacade],
  exports: [SchoolClosuresService, SchoolClosuresReadFacade],
})
export class SchoolClosuresModule {}
