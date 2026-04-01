import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { TenantsModule } from '../tenants/tenants.module';

import { StaffProfileReadFacade } from './staff-profile-read.facade';
import { StaffProfilesController } from './staff-profiles.controller';
import { StaffProfilesService } from './staff-profiles.service';

@Module({
  imports: [AuthModule, ConfigurationModule, TenantsModule],
  controllers: [StaffProfilesController],
  providers: [StaffProfilesService, StaffProfileReadFacade],
  exports: [StaffProfilesService, StaffProfileReadFacade],
})
export class StaffProfilesModule {}
