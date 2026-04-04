import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { CheckinAdminController } from './controllers/checkin-admin.controller';
import { CheckinConfigController } from './controllers/checkin-config.controller';
import { CheckinsController } from './controllers/checkins.controller';
import { PastoralCoreModule } from './pastoral-core.module';
import { CheckinAlertService } from './services/checkin-alert.service';
import { CheckinAnalyticsService } from './services/checkin-analytics.service';
import { CheckinPrerequisiteService } from './services/checkin-prerequisite.service';
import { CheckinService } from './services/checkin.service';
import { ConfigurationModule } from '../configuration/configuration.module';

// ─── PastoralCheckinsSubModule ─────────────────────────────────────────────────
// Check-ins, alerts, analytics, prerequisites.
// Named PastoralCheckinsSubModule to avoid conflict with the top-level
// PastoralCheckinsModule at modules/pastoral-checkins/ (if it ever exists).

@Module({
  imports: [AuthModule, PastoralCoreModule, BullModule.registerQueue({ name: 'notifications' }), ConfigurationModule],
  controllers: [CheckinAdminController, CheckinConfigController, CheckinsController],
  providers: [
    CheckinAlertService,
    CheckinAnalyticsService,
    CheckinPrerequisiteService,
    CheckinService,
  ],
  exports: [CheckinService],
})
export class PastoralCheckinsSubModule {}
