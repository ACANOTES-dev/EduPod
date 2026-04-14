import { forwardRef, Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';

import { LeaveController } from './leave-requests.controller';
import { LeaveRequestsService } from './leave-requests.service';
import { LeaveTypesService } from './leave-types.service';
import { PayrollAttendanceController } from './payroll-attendance.controller';
import { PayrollAttendanceService } from './payroll-attendance.service';

@Module({
  imports: [PrismaModule, StaffProfilesModule, forwardRef(() => SchedulingModule)],
  controllers: [LeaveController, PayrollAttendanceController],
  providers: [LeaveRequestsService, LeaveTypesService, PayrollAttendanceService],
  exports: [LeaveRequestsService, LeaveTypesService, PayrollAttendanceService],
})
export class LeaveModule {}
