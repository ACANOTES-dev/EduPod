import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { ClassesModule } from '../classes/classes.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { GdprModule } from '../gdpr/gdpr.module';
import { RoomsModule } from '../rooms/rooms.module';
import { StaffAvailabilityModule } from '../staff-availability/staff-availability.module';
import { StaffPreferencesModule } from '../staff-preferences/staff-preferences.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';

import { AiSubstitutionService } from './ai-substitution.service';
import { BreakGroupsController } from './break-groups.controller';
import { BreakGroupsService } from './break-groups.service';
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
import { SchedulingReadFacade } from './scheduling-read.facade';
import { SubstituteCompetenciesController } from './substitute-competencies.controller';
import { SubstituteCompetenciesService } from './substitute-competencies.service';
import { SubstitutionService } from './substitution.service';
import { TeacherCompetenciesController } from './teacher-competencies.controller';
import { TeacherCompetenciesService } from './teacher-competencies.service';
import { TeacherSchedulingConfigController } from './teacher-scheduling-config.controller';
import { TeacherSchedulingConfigService } from './teacher-scheduling-config.service';

@Module({
  imports: [
    AcademicsModule,
    AiModule,
    AuthModule,
    ClassesModule,
    ConfigurationModule,
    GdprModule,
    RoomsModule,
    StaffAvailabilityModule,
    StaffPreferencesModule,
    StaffProfilesModule,
    BullModule.registerQueue({ name: 'scheduling' }),
  ],
  controllers: [
    CurriculumRequirementsController,
    TeacherCompetenciesController,
    SubstituteCompetenciesController,
    BreakGroupsController,
    RoomClosuresController,
    TeacherSchedulingConfigController,
    SchedulerOrchestrationController,
    SchedulerValidationController,
    SchedulingEnhancedController,
    SchedulingPublicController,
  ],
  providers: [
    CurriculumRequirementsService,
    TeacherCompetenciesService,
    SubstituteCompetenciesService,
    BreakGroupsService,
    RoomClosuresService,
    TeacherSchedulingConfigService,
    SchedulerOrchestrationService,
    SchedulerValidationService,
    SubstitutionService,
    AiSubstitutionService,
    CoverTrackingService,
    ScheduleSwapService,
    PersonalTimetableService,
    RotationService,
    ExamSchedulingService,
    ScenarioService,
    SchedulingAnalyticsService,
    SchedulingReadFacade,
  ],
  exports: [
    SchedulerOrchestrationService,
    CurriculumRequirementsService,
    TeacherCompetenciesService,
    SubstituteCompetenciesService,
    BreakGroupsService,
    PersonalTimetableService,
    SchedulingReadFacade,
  ],
})
export class SchedulingModule {}
