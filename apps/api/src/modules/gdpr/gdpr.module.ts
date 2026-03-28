import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { AiAuditController } from './ai-audit.controller';
import { AiAuditService } from './ai-audit.service';
import { ConsentService } from './consent.service';
import { GdprTokenController } from './gdpr-token.controller';
import { GdprTokenService } from './gdpr-token.service';

@Module({
  imports: [AuthModule],
  controllers: [AiAuditController, GdprTokenController],
  providers: [AiAuditService, ConsentService, GdprTokenService],
  exports: [AiAuditService, ConsentService, GdprTokenService],
})
export class GdprModule {}
