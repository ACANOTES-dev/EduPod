import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';

import { LeaveController } from './leave-requests.controller';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveTypesService } from './leave-types.service';

@Module({
  imports: [PrismaModule, StaffProfilesModule],
  controllers: [LeaveController],
  providers: [LeaveRequestsService, LeaveTypesService],
  exports: [LeaveRequestsService, LeaveTypesService],
})
export class LeaveModule {}
