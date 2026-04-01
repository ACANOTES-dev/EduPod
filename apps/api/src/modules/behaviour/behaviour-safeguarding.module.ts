import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ChildProtectionModule } from '../child-protection/child-protection.module';
import { PastoralCoreModule } from '../pastoral/pastoral-core.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { TenantsModule } from '../tenants/tenants.module';

import { SafeguardingAttachmentService } from './safeguarding-attachment.service';
import { SafeguardingBreakGlassService } from './safeguarding-break-glass.service';
import { SafeguardingConcernsService } from './safeguarding-concerns.service';
import { SafeguardingReferralsService } from './safeguarding-referrals.service';
import { SafeguardingReportingService } from './safeguarding-reporting.service';
import { SafeguardingSealService } from './safeguarding-seal.service';
import { SafeguardingController } from './safeguarding.controller';
import { SafeguardingService } from './safeguarding.service';

@Module({
  imports: [
    AuthModule,
    ChildProtectionModule,
    PastoralCoreModule,
    PdfRenderingModule,
    TenantsModule,
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'behaviour' }),
  ],
  controllers: [SafeguardingController],
  providers: [
    SafeguardingService,
    SafeguardingConcernsService,
    SafeguardingReferralsService,
    SafeguardingReportingService,
    SafeguardingSealService,
    SafeguardingAttachmentService,
    SafeguardingBreakGlassService,
  ],
  exports: [SafeguardingService],
})
export class BehaviourSafeguardingModule {}
