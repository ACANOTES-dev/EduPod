import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { SequenceModule } from '../sequence/sequence.module';

import { StaffProfileReadFacade } from './staff-profile-read.facade';
import { StaffProfilesController } from './staff-profiles.controller';
import { StaffProfilesService } from './staff-profiles.service';

@Module({
  imports: [AuthModule, ConfigurationModule, SequenceModule],
  controllers: [StaffProfilesController],
  providers: [StaffProfilesService, StaffProfileReadFacade],
  exports: [StaffProfilesService, StaffProfileReadFacade],
})
export class StaffProfilesModule {}
