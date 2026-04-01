import { Module } from '@nestjs/common';

import { BehaviourAdminModule } from './behaviour-admin.module';
import { BehaviourAnalyticsModule } from './behaviour-analytics.module';
import { BehaviourCoreModule } from './behaviour-core.module';
import { BehaviourDisciplineModule } from './behaviour-discipline.module';
import { BehaviourRecognitionModule } from './behaviour-recognition.module';
import { BehaviourSafeguardingModule } from './behaviour-safeguarding.module';

@Module({
  imports: [
    BehaviourCoreModule,
    BehaviourSafeguardingModule,
    BehaviourDisciplineModule,
    BehaviourRecognitionModule,
    BehaviourAnalyticsModule,
    BehaviourAdminModule,
  ],
  exports: [
    BehaviourCoreModule,
    BehaviourSafeguardingModule,
    BehaviourDisciplineModule,
    BehaviourRecognitionModule,
    BehaviourAnalyticsModule,
    BehaviourAdminModule,
  ],
})
export class BehaviourModule {}
