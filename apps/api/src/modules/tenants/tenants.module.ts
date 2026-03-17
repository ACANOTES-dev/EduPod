import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { DomainsController } from './domains.controller';
import { DomainsService } from './domains.service';
import { SequenceService } from './sequence.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [AuthModule],
  controllers: [TenantsController, DomainsController],
  providers: [TenantsService, DomainsService, SequenceService],
  exports: [TenantsService, SequenceService],
})
export class TenantsModule {}
