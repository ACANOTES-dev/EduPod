import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { SchoolClosuresModule } from '../school-closures/school-closures.module';

import { AttendanceUploadService } from './attendance-upload.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { DailySummaryService } from './daily-summary.service';

@Module({
  imports: [AuthModule, SchoolClosuresModule, ConfigurationModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceUploadService, DailySummaryService],
  exports: [AttendanceService, DailySummaryService],
})
export class AttendanceModule {}
