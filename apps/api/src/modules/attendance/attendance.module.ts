import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { GdprModule } from '../gdpr/gdpr.module';
import { SchoolClosuresModule } from '../school-closures/school-closures.module';

import { AttendanceLockingService } from './attendance-locking.service';
import { AttendanceParentNotificationService } from './attendance-parent-notification.service';
import { AttendancePatternService } from './attendance-pattern.service';
import { AttendanceReportingService } from './attendance-reporting.service';
import { AttendanceScanService } from './attendance-scan.service';
import { AttendanceSessionService } from './attendance-session.service';
import { AttendanceUploadService } from './attendance-upload.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { DailySummaryService } from './daily-summary.service';

@Module({
  imports: [
    AuthModule,
    SchoolClosuresModule,
    ConfigurationModule,
    CommunicationsModule,
    GdprModule,
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceSessionService,
    AttendanceLockingService,
    AttendanceReportingService,
    AttendancePatternService,
    AttendanceScanService,
    AttendanceUploadService,
    DailySummaryService,
    AttendanceParentNotificationService,
  ],
  exports: [AttendanceService, DailySummaryService],
})
export class AttendanceModule {}
