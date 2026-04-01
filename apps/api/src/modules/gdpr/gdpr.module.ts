import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AuthModule } from '../auth/auth.module';

import { AgeGateService } from './age-gate.service';
import { AiAuditController } from './ai-audit.controller';
import { AiAuditService } from './ai-audit.service';
import { ConsentService } from './consent.service';
import { DpaAcceptedGuard } from './dpa-accepted.guard';
import { DpaService } from './dpa.service';
import { GdprTokenController } from './gdpr-token.controller';
import { GdprTokenService } from './gdpr-token.service';
import { LegalDpaController } from './legal-dpa.controller';
import { ParentConsentController } from './parent-consent.controller';
import { ParentPrivacyNoticeController } from './parent-privacy-notice.controller';
import { PlatformLegalService } from './platform-legal.service';
import { PrivacyNoticesController } from './privacy-notices.controller';
import { PrivacyNoticesService } from './privacy-notices.service';
import { PublicSubProcessorsController } from './public-sub-processors.controller';
import { SubProcessorsService } from './sub-processors.service';

@Module({
  imports: [AuthModule],
  controllers: [
    AiAuditController,
    GdprTokenController,
    LegalDpaController,
    PrivacyNoticesController,
    ParentConsentController,
    ParentPrivacyNoticeController,
    PublicSubProcessorsController,
  ],
  providers: [
    AgeGateService,
    AiAuditService,
    ConsentService,
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
  exports: [
    AgeGateService,
    AiAuditService,
    ConsentService,
    GdprTokenService,
    DpaService,
    PrivacyNoticesService,
    SubProcessorsService,
  ],
})
export class GdprModule {}
