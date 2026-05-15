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
import { PlatformGateway } from './platform.gateway';
import { RedisPubSubService } from './redis-pubsub.service';

@Module({
  imports: [AuthModule, CommunicationsModule, HealthModule],
  controllers: [HealthHistoryController, AlertRulesController, AlertHistoryController],
  providers: [
    RedisPubSubService,
    PlatformGateway,
    HealthSnapshotService,
    AlertRulesService,
    AlertHistoryService,
    AlertEvaluationService,
    AlertDispatchService,
    PlatformOwnerGuard,
  ],
  exports: [RedisPubSubService],
})
export class PlatformModule {}
