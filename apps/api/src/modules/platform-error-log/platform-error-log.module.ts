import { Module } from '@nestjs/common';

import { PlatformRealtimeModule } from '../platform/platform-realtime.module';
import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { PlatformUsersModule } from '../platform-users/platform-users.module';

import { ErrorRedactorService } from './error-redactor.service';
import { PlatformErrorLogMaintenanceService } from './platform-error-log-maintenance.service';
import { PlatformErrorLogController } from './platform-error-log.controller';
import { PlatformErrorLogService } from './platform-error-log.service';

@Module({
  imports: [PlatformAuditModule, PlatformRealtimeModule, PlatformUsersModule],
  controllers: [PlatformErrorLogController],
  providers: [ErrorRedactorService, PlatformErrorLogService, PlatformErrorLogMaintenanceService],
  exports: [ErrorRedactorService, PlatformErrorLogService],
})
export class PlatformErrorLogModule {}
