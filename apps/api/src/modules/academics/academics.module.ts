import { Module, forwardRef } from '@nestjs/common';

import { AttendanceModule } from '../attendance/attendance.module';
import { AuthModule } from '../auth/auth.module';
import { ClassesModule } from '../classes/classes.module';
import { GradebookModule } from '../gradebook/gradebook.module';
import { StudentsModule } from '../students/students.module';

import { AcademicPeriodsController } from './academic-periods.controller';
import { AcademicPeriodsService } from './academic-periods.service';
import { AcademicReadFacade } from './academic-read.facade';
import { AcademicYearsController } from './academic-years.controller';
import { AcademicYearsService } from './academic-years.service';
import { CurriculumMatrixController } from './curriculum-matrix.controller';
import { CurriculumMatrixService } from './curriculum-matrix.service';
import { PromotionController } from './promotion.controller';
import { PromotionService } from './promotion.service';
import { SubjectsController } from './subjects.controller';
import { SubjectsService } from './subjects.service';
import { YearGroupsController } from './year-groups.controller';
import { YearGroupsService } from './year-groups.service';

@Module({
  imports: [AuthModule, AttendanceModule, forwardRef(() => ClassesModule), forwardRef(() => GradebookModule), forwardRef(() => StudentsModule)],
  controllers: [
    AcademicYearsController,
    AcademicPeriodsController,
    YearGroupsController,
    SubjectsController,
    PromotionController,
    CurriculumMatrixController,
  ],
  providers: [
    AcademicYearsService,
    AcademicPeriodsService,
    AcademicReadFacade,
    YearGroupsService,
    SubjectsService,
    PromotionService,
    CurriculumMatrixService,
  ],
  exports: [
    AcademicYearsService,
    AcademicPeriodsService,
    AcademicReadFacade,
    YearGroupsService,
    SubjectsService,
    PromotionService,
  ],
})
export class AcademicsModule {}
