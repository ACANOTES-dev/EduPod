import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RegistrationModule } from '../registration/registration.module';
import { SequenceModule } from '../sequence/sequence.module';

import { HouseholdsController } from './households.controller';
import { HouseholdsService } from './households.service';

@Module({
  imports: [AuthModule, SequenceModule, RegistrationModule],
  controllers: [HouseholdsController],
  providers: [HouseholdsService],
  exports: [HouseholdsService],
})
export class HouseholdsModule {}
