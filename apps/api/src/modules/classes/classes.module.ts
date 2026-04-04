import { Module, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { AuthModule } from '../auth/auth.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { SchedulesService } from '../schedules/schedules.service';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';
import { TenantsModule } from '../tenants/tenants.module';

import { ClassAssignmentsController } from './class-assignments.controller';
import { ClassAssignmentService } from './class-assignments.service';
import { ClassEnrolmentsController } from './class-enrolments.controller';
import { ClassEnrolmentsService } from './class-enrolments.service';
import { ClassesReadFacade } from './classes-read.facade';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [AuthModule, SchedulesModule, StaffProfilesModule, TenantsModule],
  controllers: [ClassesController, ClassEnrolmentsController, ClassAssignmentsController],
  providers: [ClassesService, ClassEnrolmentsService, ClassAssignmentService, ClassesReadFacade],
  exports: [ClassesService, ClassEnrolmentsService, ClassesReadFacade],
})
export class ClassesModule implements OnModuleInit {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly classesService: ClassesService,
  ) {}

  onModuleInit() {
    const schedulesService = this.moduleRef.get(SchedulesService, { strict: false });
    this.classesService.setSchedulesService(schedulesService);
  }
}
