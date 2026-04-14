import { forwardRef, Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';

import { LeaveController } from './leave-requests.controller';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveTypesService } from './leave-types.service';

@Module({
  imports: [PrismaModule, StaffProfilesModule, forwardRef(() => SchedulingModule)],
  controllers: [LeaveController],
  providers: [LeaveRequestsService, LeaveTypesService],
  exports: [LeaveRequestsService, LeaveTypesService],
})
export class LeaveModule {}
