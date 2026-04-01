import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SequenceModule } from '../sequence/sequence.module';

import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [AuthModule, SequenceModule],
  controllers: [TenantsController, DomainsController],
  providers: [TenantsService, DomainsService],
  exports: [TenantsService, SequenceModule],
})
export class TenantsModule {}
