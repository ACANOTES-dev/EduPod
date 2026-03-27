import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';

import { AuditLogController, PlatformAuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { EngagementController } from './engagement.controller';
import { SecurityAuditService } from './security-audit.service';

@Global()
@Module({
  controllers: [AuditLogController, PlatformAuditLogController, EngagementController],
  providers: [
    AuditLogService,
    SecurityAuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
  exports: [AuditLogService, SecurityAuditService],
})
export class AuditLogModule {}
