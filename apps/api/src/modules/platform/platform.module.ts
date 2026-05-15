import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { HealthModule } from '../health/health.module';
// eslint-disable-next-line school/no-cross-module-internal-import -- Provider registration for platform admin route guards.
import { PlatformOwnerGuard } from '../tenants/guards/platform-owner.guard';

import { HealthHistoryController } from './health-history.controller';
import { HealthSnapshotService } from './health-snapshot.service';
import { PlatformGateway } from './platform.gateway';
import { RedisPubSubService } from './redis-pubsub.service';

@Module({
  imports: [AuthModule, HealthModule],
  controllers: [HealthHistoryController],
  providers: [RedisPubSubService, PlatformGateway, HealthSnapshotService, PlatformOwnerGuard],
  exports: [RedisPubSubService],
})
export class PlatformModule {}
