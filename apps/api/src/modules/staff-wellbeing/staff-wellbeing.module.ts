import { Module } from '@nestjs/common';

import { BlockImpersonationGuard } from '../../common/guards/block-impersonation.guard';
import { ConfigurationModule } from '../configuration/configuration.module';

import { HmacService } from './services/hmac.service';

@Module({
  imports: [ConfigurationModule],
  controllers: [],
  providers: [BlockImpersonationGuard, HmacService],
  exports: [HmacService],
})
export class StaffWellbeingModule {}
