import { Module } from '@nestjs/common';

import { AttendanceSignalCollector } from './collectors/attendance-signal.collector';
import { BehaviourSignalCollector } from './collectors/behaviour-signal.collector';
import { EngagementSignalCollector } from './collectors/engagement-signal.collector';
import { GradesSignalCollector } from './collectors/grades-signal.collector';
import { WellbeingSignalCollector } from './collectors/wellbeing-signal.collector';

@Module({
  imports: [],
  controllers: [],
  providers: [
    AttendanceSignalCollector,
    BehaviourSignalCollector,
    EngagementSignalCollector,
    GradesSignalCollector,
    WellbeingSignalCollector,
  ],
  exports: [
    AttendanceSignalCollector,
    BehaviourSignalCollector,
    EngagementSignalCollector,
    GradesSignalCollector,
    WellbeingSignalCollector,
  ],
})
export class EarlyWarningModule {}
