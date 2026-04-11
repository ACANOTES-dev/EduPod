import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { FinanceModule } from '../finance/finance.module';
import { HouseholdNumberService } from '../households/household-number.service';
import { SequenceModule } from '../sequence/sequence.module';

import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';

@Module({
  imports: [AuthModule, SequenceModule, ConfigurationModule, FinanceModule],
  controllers: [RegistrationController],
  providers: [RegistrationService, HouseholdNumberService],
  exports: [RegistrationService],
})
export class RegistrationModule {}
