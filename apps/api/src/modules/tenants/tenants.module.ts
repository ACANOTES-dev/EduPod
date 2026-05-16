import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PlatformOnboardingModule } from '../platform/platform-onboarding.module';
import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { S3Module } from '../s3/s3.module';
import { SequenceModule } from '../sequence/sequence.module';

import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { MaintenanceService } from './maintenance.service';
import { PlatformCacheService } from './platform-cache.service';
import { PlatformSessionService } from './platform-session.service';
import { PlatformSupportService } from './platform-support.service';
import { PublicTenantsController } from './public-tenants.controller';
import { PublicTenantsService } from './public-tenants.service';
import { TenantReadFacade } from './tenant-read.facade';
import { TenantSelfController } from './tenant-self.controller';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notifications' }),
    forwardRef(() => AuthModule),
    PlatformAuditModule,
    PlatformOnboardingModule,
    S3Module,
    SequenceModule,
  ],
  controllers: [
    TenantsController,
    DomainsController,
    PublicTenantsController,
    TenantSelfController,
  ],
  providers: [
    TenantsService,
    DomainsService,
    PublicTenantsService,
    TenantReadFacade,
    MaintenanceService,
    PlatformCacheService,
    PlatformSessionService,
    PlatformSupportService,
  ],
  exports: [TenantsService, SequenceModule, TenantReadFacade],
})
export class TenantsModule {}
