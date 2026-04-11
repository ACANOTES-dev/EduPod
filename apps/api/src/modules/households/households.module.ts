import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { RegistrationModule } from '../registration/registration.module';
import { SequenceModule } from '../sequence/sequence.module';

import { HouseholdNumberService } from './household-number.service';
import { HouseholdReadFacade } from './household-read.facade';
import { HouseholdsCrudService } from './households-crud.service';
import { HouseholdsRelationsService } from './households-relations.service';
import { HouseholdsStructuralService } from './households-structural.service';
import { HouseholdsController } from './households.controller';
import { HouseholdsService } from './households.service';

@Module({
  imports: [AuthModule, SequenceModule, RegistrationModule],
  controllers: [HouseholdsController],
  providers: [
    HouseholdsCrudService,
    HouseholdsRelationsService,
    HouseholdsStructuralService,
    HouseholdsService,
    HouseholdReadFacade,
    HouseholdNumberService,
  ],
  exports: [HouseholdsService, HouseholdReadFacade, HouseholdNumberService],
})
export class HouseholdsModule {}
