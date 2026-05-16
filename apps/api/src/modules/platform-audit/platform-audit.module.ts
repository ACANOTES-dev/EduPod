import { Module } from '@nestjs/common';

import { PlatformAuditController } from './platform-audit.controller';
import { PlatformAuditService } from './platform-audit.service';

@Module({
  controllers: [PlatformAuditController],
  providers: [PlatformAuditService],
  exports: [PlatformAuditService],
})
export class PlatformAuditModule {}
