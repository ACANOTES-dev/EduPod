import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { StaffAvailabilityController } from './staff-availability.controller';
import { StaffAvailabilityReadFacade } from './staff-availability-read.facade';
import { StaffAvailabilityService } from './staff-availability.service';

@Module({
  imports: [AuthModule],
  controllers: [StaffAvailabilityController],
  providers: [StaffAvailabilityService, StaffAvailabilityReadFacade],
  exports: [StaffAvailabilityService, StaffAvailabilityReadFacade],
})
export class StaffAvailabilityModule {}
