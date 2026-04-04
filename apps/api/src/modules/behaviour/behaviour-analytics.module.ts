import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { GdprModule } from '../gdpr/gdpr.module';
import { RbacModule } from '../rbac/rbac.module';
import { StudentsModule } from '../students/students.module';

import { BehaviourAIService } from './behaviour-ai.service';
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
  imports: [
    AcademicsModule,
    AiModule,
    AuthModule,
    ConfigurationModule,
    GdprModule,
    RbacModule,
    StudentsModule,
    BehaviourCoreModule,
  ],
  controllers: [BehaviourAnalyticsController],
  providers: [
    BehaviourAnalyticsService,
    BehaviourPulseService,
    BehaviourAIService,
    BehaviourIncidentAnalyticsService,
    BehaviourComparisonAnalyticsService,
    BehaviourStaffAnalyticsService,
    BehaviourSanctionAnalyticsService,
    BehaviourExportAnalyticsService,
  ],
  exports: [BehaviourAnalyticsService],
})
export class BehaviourAnalyticsModule {}
