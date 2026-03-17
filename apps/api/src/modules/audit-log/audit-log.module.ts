import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';

import { AuditLogController, PlatformAuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { EngagementController } from './engagement.controller';

@Global()
@Module({
  controllers: [AuditLogController, PlatformAuditLogController, EngagementController],
  providers: [
    AuditLogService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
  exports: [AuditLogService],
})
export class AuditLogModule {}
