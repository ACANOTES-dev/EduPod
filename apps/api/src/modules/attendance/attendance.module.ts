import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SchoolClosuresModule } from '../school-closures/school-closures.module';

import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { DailySummaryService } from './daily-summary.service';

@Module({
  imports: [AuthModule, SchoolClosuresModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, DailySummaryService],
  exports: [AttendanceService, DailySummaryService],
})
export class AttendanceModule {}
