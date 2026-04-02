import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { GdprModule } from '../gdpr/gdpr.module';

import { BehaviourAIService } from './behaviour-ai.service';
import { BehaviourAlertsController } from './behaviour-alerts.controller';
import { BehaviourAlertsService } from './behaviour-alerts.service';
import { BehaviourAnalyticsController } from './behaviour-analytics.controller';
import { BehaviourAnalyticsService } from './behaviour-analytics.service';
import { BehaviourComparisonAnalyticsService } from './behaviour-comparison-analytics.service';
import { BehaviourCoreModule } from './behaviour-core.module';
import { BehaviourExportAnalyticsService } from './behaviour-export-analytics.service';
import { BehaviourIncidentAnalyticsService } from './behaviour-incident-analytics.service';
import { BehaviourPulseService } from './behaviour-pulse.service';
import { BehaviourSanctionAnalyticsService } from './behaviour-sanction-analytics.service';
import { BehaviourStaffAnalyticsService } from './behaviour-staff-analytics.service';

@Module({
  imports: [AiModule, AuthModule, GdprModule, BehaviourCoreModule],
  controllers: [BehaviourAnalyticsController, BehaviourAlertsController],
  providers: [
    BehaviourAnalyticsService,
    BehaviourPulseService,
    BehaviourAIService,
    BehaviourAlertsService,
    BehaviourIncidentAnalyticsService,
    BehaviourComparisonAnalyticsService,
    BehaviourStaffAnalyticsService,
    BehaviourSanctionAnalyticsService,
    BehaviourExportAnalyticsService,
  ],
  exports: [BehaviourAnalyticsService, BehaviourAlertsService],
})
export class BehaviourAnalyticsModule {}
