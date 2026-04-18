import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { ClassesModule } from '../classes/classes.module';
import { CommunicationsModule } from '../communications/communications.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { GdprModule } from '../gdpr/gdpr.module';
import { ParentsModule } from '../parents/parents.module';
import { RoomsModule } from '../rooms/rooms.module';
import { FeasibilityService } from '../scheduling-runs/feasibility/feasibility.service';
import { StaffAvailabilityModule } from '../staff-availability/staff-availability.module';
import { StaffPreferencesModule } from '../staff-preferences/staff-preferences.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';
import { StudentsModule } from '../students/students.module';
import { TenantsModule } from '../tenants/tenants.module';

import { AiSubstitutionService } from './ai-substitution.service';
import { BreakGroupsController } from './break-groups.controller';
import { BreakGroupsService } from './break-groups.service';
import { CoverNotificationsService } from './cover-notifications.service';
import { CoverTrackingService } from './cover-tracking.service';
import { CurriculumRequirementsController } from './curriculum-requirements.controller';
import { CurriculumRequirementsService } from './curriculum-requirements.service';
import { ExamInvigilatorPoolService } from './exam-invigilator-pool.service';
import { ExamNotificationsService } from './exam-notifications.service';
import { ExamPublishService } from './exam-publish.service';
import { ExamSchedulingV2Controller } from './exam-scheduling-v2.controller';
import { ExamSchedulingService } from './exam-scheduling.service';
import { ExamSessionConfigService } from './exam-session-config.service';
import { ExamSolverOrchestrationService } from './exam-solver-orchestration.service';
import { ExamSubjectConfigService } from './exam-subject-config.service';
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
import { SubstitutionCascadeService } from './substitution-cascade.service';
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
    CommunicationsModule,
    ConfigurationModule,
    GdprModule,
    ParentsModule,
    RoomsModule,
    StaffAvailabilityModule,
    StaffPreferencesModule,
    StaffProfilesModule,
    StudentsModule,
    TenantsModule,
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
    ExamSchedulingV2Controller,
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
    SubstitutionCascadeService,
    CoverNotificationsService,
    AiSubstitutionService,
    CoverTrackingService,
    ScheduleSwapService,
    PersonalTimetableService,
    RotationService,
    ExamSchedulingService,
    ExamSessionConfigService,
    ExamSubjectConfigService,
    ExamInvigilatorPoolService,
    ExamSolverOrchestrationService,
    ExamPublishService,
    ExamNotificationsService,
    ScenarioService,
    SchedulingAnalyticsService,
    SchedulingReadFacade,
    FeasibilityService,
  ],
  exports: [
    SchedulerOrchestrationService,
    CurriculumRequirementsService,
    TeacherCompetenciesService,
    SubstituteCompetenciesService,
    BreakGroupsService,
    PersonalTimetableService,
    SchedulingReadFacade,
    SubstitutionCascadeService,
    CoverNotificationsService,
    ExamPublishService,
    FeasibilityService,
  ],
})
export class SchedulingModule {}
