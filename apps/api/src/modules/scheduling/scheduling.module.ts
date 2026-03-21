import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { BreakGroupsController } from './break-groups.controller';
import { BreakGroupsService } from './break-groups.service';
import { CoverTeacherController } from './cover-teacher.controller';
import { CoverTeacherService } from './cover-teacher.service';
import { CurriculumRequirementsController } from './curriculum-requirements.controller';
import { CurriculumRequirementsService } from './curriculum-requirements.service';
import { RoomClosuresController } from './room-closures.controller';
import { RoomClosuresService } from './room-closures.service';
import { SchedulerOrchestrationController } from './scheduler-orchestration.controller';
import { SchedulerOrchestrationService } from './scheduler-orchestration.service';
import { SchedulerValidationController } from './scheduler-validation.controller';
import { SchedulerValidationService } from './scheduler-validation.service';
import { TeacherCompetenciesController } from './teacher-competencies.controller';
import { TeacherCompetenciesService } from './teacher-competencies.service';
import { TeacherSchedulingConfigController } from './teacher-scheduling-config.controller';
import { TeacherSchedulingConfigService } from './teacher-scheduling-config.service';

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({ name: 'scheduling' }),
  ],
  controllers: [
    CurriculumRequirementsController,
    TeacherCompetenciesController,
    BreakGroupsController,
    RoomClosuresController,
    TeacherSchedulingConfigController,
    SchedulerOrchestrationController,
    SchedulerValidationController,
    CoverTeacherController,
  ],
  providers: [
    CurriculumRequirementsService,
    TeacherCompetenciesService,
    BreakGroupsService,
    RoomClosuresService,
    TeacherSchedulingConfigService,
    SchedulerOrchestrationService,
    SchedulerValidationService,
    CoverTeacherService,
  ],
  exports: [
    SchedulerOrchestrationService,
    CurriculumRequirementsService,
    TeacherCompetenciesService,
    BreakGroupsService,
  ],
})
export class SchedulingModule {}
