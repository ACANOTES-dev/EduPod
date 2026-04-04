import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';

import { StaffAvailabilityReadFacade } from './staff-availability-read.facade';
import { StaffAvailabilityController } from './staff-availability.controller';
import { StaffAvailabilityService } from './staff-availability.service';

@Module({
  imports: [AuthModule, StaffProfilesModule],
  controllers: [StaffAvailabilityController],
  providers: [StaffAvailabilityService, StaffAvailabilityReadFacade],
  exports: [StaffAvailabilityService, StaffAvailabilityReadFacade],
})
export class StaffAvailabilityModule {}
