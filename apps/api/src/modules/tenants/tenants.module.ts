import { Module } from '@nestjs/common';

import { TokenService } from '../auth/auth-token.service';
import { PlatformOnboardingModule } from '../platform/platform-onboarding.module';
import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { S3Module } from '../s3/s3.module';
import { SequenceModule } from '../sequence/sequence.module';

import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { PublicTenantsController } from './public-tenants.controller';
import { PublicTenantsService } from './public-tenants.service';
import { TenantReadFacade } from './tenant-read.facade';
import { TenantSelfController } from './tenant-self.controller';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [PlatformAuditModule, PlatformOnboardingModule, S3Module, SequenceModule],
  controllers: [
    TenantsController,
    DomainsController,
    PublicTenantsController,
    TenantSelfController,
  ],
  providers: [TenantsService, DomainsService, PublicTenantsService, TenantReadFacade, TokenService],
  exports: [TenantsService, SequenceModule, TenantReadFacade],
})
export class TenantsModule {}
