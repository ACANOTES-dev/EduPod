import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { StaffAvailabilityController } from './staff-availability.controller';
import { StaffAvailabilityService } from './staff-availability.service';

@Module({
  imports: [AuthModule],
  controllers: [StaffAvailabilityController],
  providers: [StaffAvailabilityService],
  exports: [StaffAvailabilityService],
})
export class StaffAvailabilityModule {}
