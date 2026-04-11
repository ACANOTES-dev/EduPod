import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BehaviourCoreModule } from '../behaviour/behaviour-core.module';
import { ChildProtectionModule } from '../child-protection/child-protection.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { InboxModule } from '../inbox/inbox.module';
import { PastoralCoreModule } from '../pastoral/pastoral-core.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { RbacModule } from '../rbac/rbac.module';
import { SequenceModule } from '../sequence/sequence.module';

import { SafeguardingKeywordsController } from './keywords/safeguarding-keywords.controller';
import { SafeguardingKeywordsRepository } from './keywords/safeguarding-keywords.repository';
import { SafeguardingKeywordsService } from './keywords/safeguarding-keywords.service';
import { SafeguardingAttachmentService } from './safeguarding-attachment.service';
import { SafeguardingBreakGlassService } from './safeguarding-break-glass.service';
import { SafeguardingConcernsService } from './safeguarding-concerns.service';
import { SafeguardingPermissionsInit } from './safeguarding-permissions.init';
import { SafeguardingReferralsService } from './safeguarding-referrals.service';
import { SafeguardingReportingService } from './safeguarding-reporting.service';
import { SafeguardingSealService } from './safeguarding-seal.service';
import { SafeguardingController } from './safeguarding.controller';
import { SafeguardingService } from './safeguarding.service';
import { KeywordSafeguardingScanner } from './scanner/keyword-safeguarding-scanner';
import { SAFEGUARDING_SCANNER } from './scanner/safeguarding-scanner.interface';

/**
 * SafeguardingModule — originally houses the Phase-D behaviour-management
 * safeguarding services (concerns, referrals, reporting, break-glass,
 * seal). New-inbox impl 08 extends the module with the keyword-based
 * message scanner and the tenant-scoped keyword CRUD surface. They share
 * the `safeguarding` namespace on the API (`/v1/safeguarding/...`) and
 * the tenant-level permission tier.
 *
 * `InboxModule` is imported so the keywords controller can reuse
 * `AdminTierOnlyGuard` from the inbox common layer.
 */
@Module({
  imports: [
    AuthModule,
    BehaviourCoreModule,
    ChildProtectionModule,
    ConfigurationModule,
    InboxModule,
    PastoralCoreModule,
    PdfRenderingModule,
    RbacModule,
    SequenceModule,
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'behaviour' }),
  ],
  controllers: [SafeguardingController, SafeguardingKeywordsController],
  providers: [
    SafeguardingService,
    SafeguardingConcernsService,
    SafeguardingReferralsService,
    SafeguardingReportingService,
    SafeguardingSealService,
    SafeguardingAttachmentService,
    SafeguardingBreakGlassService,
    // ─── New-inbox impl 08: keyword scanner + CRUD ───────────────────────
    SafeguardingPermissionsInit,
    SafeguardingKeywordsRepository,
    SafeguardingKeywordsService,
    KeywordSafeguardingScanner,
    { provide: SAFEGUARDING_SCANNER, useExisting: KeywordSafeguardingScanner },
  ],
  exports: [
    SafeguardingService,
    SafeguardingKeywordsRepository,
    SafeguardingKeywordsService,
    KeywordSafeguardingScanner,
    SAFEGUARDING_SCANNER,
  ],
})
export class SafeguardingModule {}
