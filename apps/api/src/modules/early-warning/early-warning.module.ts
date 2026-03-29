import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { AttendanceSignalCollector } from './collectors/attendance-signal.collector';
import { BehaviourSignalCollector } from './collectors/behaviour-signal.collector';
import { EngagementSignalCollector } from './collectors/engagement-signal.collector';
import { GradesSignalCollector } from './collectors/grades-signal.collector';
import { WellbeingSignalCollector } from './collectors/wellbeing-signal.collector';
import { EarlyWarningRoutingService } from './early-warning-routing.service';
import { EarlyWarningTriggerService } from './early-warning-trigger.service';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'early-warning' }),
  ],
  controllers: [],
  providers: [
    AttendanceSignalCollector,
    BehaviourSignalCollector,
    EngagementSignalCollector,
    GradesSignalCollector,
    WellbeingSignalCollector,
    EarlyWarningRoutingService,
    EarlyWarningTriggerService,
  ],
  exports: [
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
