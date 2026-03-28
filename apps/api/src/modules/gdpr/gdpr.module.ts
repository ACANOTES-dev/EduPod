import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';

import { AiAuditController } from './ai-audit.controller';
import { AiAuditService } from './ai-audit.service';
import { DpaAcceptedGuard } from './dpa-accepted.guard';
import { DpaService } from './dpa.service';
import { GdprTokenController } from './gdpr-token.controller';
import { GdprTokenService } from './gdpr-token.service';
import { LegalDpaController } from './legal-dpa.controller';
import { ParentPrivacyNoticeController } from './parent-privacy-notice.controller';
import { PlatformLegalService } from './platform-legal.service';
import { PrivacyNoticesController } from './privacy-notices.controller';
import { PrivacyNoticesService } from './privacy-notices.service';
import { PublicSubProcessorsController } from './public-sub-processors.controller';
import { SubProcessorsService } from './sub-processors.service';

@Module({
  imports: [AuthModule, CommunicationsModule],
  controllers: [
    AiAuditController,
    GdprTokenController,
    LegalDpaController,
    PrivacyNoticesController,
    ParentPrivacyNoticeController,
    PublicSubProcessorsController,
  ],
  providers: [
    AiAuditService,
    GdprTokenService,
    PlatformLegalService,
    DpaService,
    PrivacyNoticesService,
    SubProcessorsService,
    {
      provide: APP_GUARD,
      useClass: DpaAcceptedGuard,
    },
  ],
  exports: [AiAuditService, GdprTokenService, DpaService, PrivacyNoticesService, SubProcessorsService],
})
export class GdprModule {}
