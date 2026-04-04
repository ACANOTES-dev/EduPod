import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AuthModule } from '../auth/auth.module';
import { BehaviourModule } from '../behaviour/behaviour.module';
import { ClassesModule } from '../classes/classes.module';
import { CommunicationsModule } from '../communications/communications.module';
import { GradebookModule } from '../gradebook/gradebook.module';
import { ParentInquiriesModule } from '../parent-inquiries/parent-inquiries.module';
import { ParentsModule } from '../parents/parents.module';
import { PastoralModule } from '../pastoral/pastoral.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RbacModule } from '../rbac/rbac.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';
import { StudentsModule } from '../students/students.module';

import { AttendanceSignalCollector } from './collectors/attendance-signal.collector';
import { BehaviourSignalCollector } from './collectors/behaviour-signal.collector';
import { EngagementSignalCollector } from './collectors/engagement-signal.collector';
import { GradesSignalCollector } from './collectors/grades-signal.collector';
import { WellbeingSignalCollector } from './collectors/wellbeing-signal.collector';
import { EarlyWarningCohortService } from './early-warning-cohort.service';
import { EarlyWarningConfigService } from './early-warning-config.service';
import { EarlyWarningRoutingService } from './early-warning-routing.service';
import { EarlyWarningTriggerService } from './early-warning-trigger.service';
import { EarlyWarningController } from './early-warning.controller';
import { EarlyWarningService } from './early-warning.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'early-warning' }),
    AcademicsModule,
    AuthModule,
    forwardRef(() => BehaviourModule),
    ClassesModule,
    CommunicationsModule,
    forwardRef(() => GradebookModule),
    ParentInquiriesModule,
    ParentsModule,
    forwardRef(() => PastoralModule),
    RbacModule,
    StaffProfilesModule,
    StudentsModule,
  ],
  controllers: [EarlyWarningController],
  providers: [
    EarlyWarningService,
    EarlyWarningConfigService,
    EarlyWarningCohortService,
    AttendanceSignalCollector,
    BehaviourSignalCollector,
    EngagementSignalCollector,
    GradesSignalCollector,
    WellbeingSignalCollector,
    EarlyWarningRoutingService,
    EarlyWarningTriggerService,
  ],
  exports: [EarlyWarningService, EarlyWarningConfigService, EarlyWarningTriggerService],
})
export class EarlyWarningModule {}
