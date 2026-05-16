import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';
import { HealthModule } from '../health/health.module';
import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { PlatformUsersModule } from '../platform-users/platform-users.module';
import { TenantsModule } from '../tenants/tenants.module';

import { AlertDispatchService } from './alert-dispatch.service';
import { AlertEvaluationService } from './alert-evaluation.service';
import { AlertHistoryController } from './alert-history.controller';
import { AlertHistoryService } from './alert-history.service';
import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';
import { AlertSilenceService } from './alert-silence.service';
import { AlertSilencesController } from './alert-silences.controller';
import { HealthHistoryController } from './health-history.controller';
import { HealthSnapshotService } from './health-snapshot.service';
import { MaintenanceWindowService } from './maintenance-window.service';
import { MaintenanceWindowsController } from './maintenance-windows.controller';
import { OnboardingController } from './onboarding.controller';
import { OwnerActionConfirmationService } from './owner-action-confirmation.service';
import { OwnerActionConfirmationsController } from './owner-action-confirmations.controller';
import { PlatformOnboardingModule } from './platform-onboarding.module';
import { PlatformRealtimeModule } from './platform-realtime.module';
import { PlatformGateway } from './platform.gateway';

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({ name: 'gradebook' }, { name: 'notifications' }),
    CommunicationsModule,
    HealthModule,
    PlatformAuditModule,
    PlatformOnboardingModule,
    PlatformRealtimeModule,
    PlatformUsersModule,
    TenantsModule,
  ],
  controllers: [
    HealthHistoryController,
    AlertRulesController,
    AlertHistoryController,
    AlertSilencesController,
    MaintenanceWindowsController,
    OwnerActionConfirmationsController,
    OnboardingController,
  ],
  providers: [
    PlatformGateway,
    HealthSnapshotService,
    AlertRulesService,
    AlertHistoryService,
    AlertSilenceService,
    MaintenanceWindowService,
    OwnerActionConfirmationService,
    AlertEvaluationService,
    AlertDispatchService,
  ],
  exports: [PlatformOnboardingModule, PlatformRealtimeModule],
})
export class PlatformModule {}
