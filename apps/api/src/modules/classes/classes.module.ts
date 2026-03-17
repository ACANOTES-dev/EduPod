import { Module, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { AuthModule } from '../auth/auth.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { SchedulesService } from '../schedules/schedules.service';

import { ClassEnrolmentsController } from './class-enrolments.controller';
import { ClassEnrolmentsService } from './class-enrolments.service';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [AuthModule, SchedulesModule],
  controllers: [ClassesController, ClassEnrolmentsController],
  providers: [ClassesService, ClassEnrolmentsService],
  exports: [ClassesService, ClassEnrolmentsService],
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
