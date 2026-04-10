import { Module } from '@nestjs/common';

import { TokenService } from '../auth/auth-token.service';
import { SequenceModule } from '../sequence/sequence.module';

import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { PublicTenantsController } from './public-tenants.controller';
import { PublicTenantsService } from './public-tenants.service';
import { TenantReadFacade } from './tenant-read.facade';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [SequenceModule],
  controllers: [TenantsController, DomainsController, PublicTenantsController],
  providers: [TenantsService, DomainsService, PublicTenantsService, TenantReadFacade, TokenService],
  exports: [TenantsService, SequenceModule, TenantReadFacade],
})
export class TenantsModule {}
