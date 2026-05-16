import { Module } from '@nestjs/common';

import { PlatformRealtimeModule } from '../platform/platform-realtime.module';
import { PlatformAuditModule } from '../platform-audit/platform-audit.module';

import { QueueAdminController } from './queue-admin.controller';
import { QueueManagementService } from './queue-management.service';
import { QueueMetricsService } from './queue-metrics.service';

@Module({
  imports: [PlatformAuditModule, PlatformRealtimeModule],
  controllers: [QueueAdminController],
  providers: [QueueManagementService, QueueMetricsService],
  exports: [QueueManagementService],
})
export class QueueAdminModule {}
