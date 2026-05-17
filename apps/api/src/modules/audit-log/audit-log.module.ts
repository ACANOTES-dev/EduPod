import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';

import { AuditLogReadFacade } from './audit-log-read.facade';
import { AuditLogController, PlatformAuditLogController } from './audit-log.controller';
import { AuditLogService } from './audit-log.service';
import { EngagementController } from './engagement.controller';
import { SecurityAuditService } from './security-audit.service';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: 'audit-log' })],
  controllers: [AuditLogController, PlatformAuditLogController, EngagementController],
  providers: [
    AuditLogReadFacade,
    AuditLogService,
    SecurityAuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
  exports: [AuditLogReadFacade, AuditLogService, SecurityAuditService],
})
export class AuditLogModule {}
