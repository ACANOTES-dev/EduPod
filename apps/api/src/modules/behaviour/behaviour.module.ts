import { Module } from '@nestjs/common';

import { BehaviourAnalyticsModule } from './behaviour-analytics.module';
import { BehaviourCoreModule } from './behaviour-core.module';
import { BehaviourDisciplineModule } from './behaviour-discipline.module';
import { BehaviourOpsModule } from './behaviour-ops.module';
import { BehaviourPortalModule } from './behaviour-portal.module';
import { BehaviourRecognitionModule } from './behaviour-recognition.module';

@Module({
  imports: [
    BehaviourCoreModule,
    BehaviourDisciplineModule,
    BehaviourRecognitionModule,
    BehaviourAnalyticsModule,
    BehaviourOpsModule,
    BehaviourPortalModule,
  ],
  exports: [
    BehaviourCoreModule,
    BehaviourDisciplineModule,
    BehaviourRecognitionModule,
    BehaviourAnalyticsModule,
    BehaviourOpsModule,
    BehaviourPortalModule,
  ],
})
export class BehaviourModule {}
