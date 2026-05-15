import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';
import { HealthModule } from '../health/health.module';
// eslint-disable-next-line school/no-cross-module-internal-import -- Provider registration for platform admin route guards.
import { PlatformOwnerGuard } from '../tenants/guards/platform-owner.guard';

import { AlertDispatchService } from './alert-dispatch.service';
import { AlertEvaluationService } from './alert-evaluation.service';
import { AlertHistoryController } from './alert-history.controller';
import { AlertHistoryService } from './alert-history.service';
import { AlertRulesController } from './alert-rules.controller';
import { AlertRulesService } from './alert-rules.service';
import { HealthHistoryController } from './health-history.controller';
import { HealthSnapshotService } from './health-snapshot.service';
import { OnboardingController } from './onboarding.controller';
import { PlatformOnboardingModule } from './platform-onboarding.module';
import { PlatformRealtimeModule } from './platform-realtime.module';
import { PlatformGateway } from './platform.gateway';

@Module({
  imports: [
    AuthModule,
    CommunicationsModule,
    HealthModule,
    PlatformOnboardingModule,
    PlatformRealtimeModule,
  ],
  controllers: [
    HealthHistoryController,
    AlertRulesController,
    AlertHistoryController,
    OnboardingController,
  ],
  providers: [
    PlatformGateway,
    HealthSnapshotService,
    AlertRulesService,
    AlertHistoryService,
    AlertEvaluationService,
    AlertDispatchService,
    PlatformOwnerGuard,
  ],
  exports: [PlatformOnboardingModule, PlatformRealtimeModule],
})
export class PlatformModule {}
