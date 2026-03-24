import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { AiSubstitutionService } from './ai-substitution.service';
import { BreakGroupsController } from './break-groups.controller';
import { BreakGroupsService } from './break-groups.service';
import { CoverTeacherController } from './cover-teacher.controller';
import { CoverTeacherService } from './cover-teacher.service';
import { CoverTrackingService } from './cover-tracking.service';
import { CurriculumRequirementsController } from './curriculum-requirements.controller';
import { CurriculumRequirementsService } from './curriculum-requirements.service';
import { ExamSchedulingService } from './exam-scheduling.service';
import { PersonalTimetableService } from './personal-timetable.service';
import { RoomClosuresController } from './room-closures.controller';
import { RoomClosuresService } from './room-closures.service';
import { RotationService } from './rotation.service';
import { ScenarioService } from './scenario.service';
import { ScheduleSwapService } from './schedule-swap.service';
import { SchedulerOrchestrationController } from './scheduler-orchestration.controller';
import { SchedulerOrchestrationService } from './scheduler-orchestration.service';
import { SchedulerValidationController } from './scheduler-validation.controller';
import { SchedulerValidationService } from './scheduler-validation.service';
import { SchedulingAnalyticsService } from './scheduling-analytics.service';
import { SchedulingEnhancedController } from './scheduling-enhanced.controller';
import { SchedulingPublicController } from './scheduling-public.controller';
import { SubstitutionService } from './substitution.service';
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
    SchedulingEnhancedController,
    SchedulingPublicController,
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
    SubstitutionService,
    AiSubstitutionService,
    CoverTrackingService,
    ScheduleSwapService,
    PersonalTimetableService,
    RotationService,
    ExamSchedulingService,
    ScenarioService,
    SchedulingAnalyticsService,
  ],
  exports: [
    SchedulerOrchestrationService,
    CurriculumRequirementsService,
    TeacherCompetenciesService,
    BreakGroupsService,
    PersonalTimetableService,
  ],
})
export class SchedulingModule {}
