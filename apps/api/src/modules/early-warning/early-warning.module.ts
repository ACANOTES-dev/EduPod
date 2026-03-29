import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

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
  exports: [
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
})
export class EarlyWarningModule {}
