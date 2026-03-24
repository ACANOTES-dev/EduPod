import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { SchoolClosuresModule } from '../school-closures/school-closures.module';

import { AttendanceParentNotificationService } from './attendance-parent-notification.service';
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
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceUploadService,
    DailySummaryService,
    AttendanceParentNotificationService,
  ],
  exports: [AttendanceService, DailySummaryService],
})
export class AttendanceModule {}
