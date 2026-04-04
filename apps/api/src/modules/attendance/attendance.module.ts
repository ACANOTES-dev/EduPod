import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { ClassesModule } from '../classes/classes.module';
import { CommunicationsModule } from '../communications/communications.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { GdprModule } from '../gdpr/gdpr.module';
import { ParentsModule } from '../parents/parents.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { SchoolClosuresModule } from '../school-closures/school-closures.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';
import { StudentsModule } from '../students/students.module';

import { AttendanceBulkUploadService } from './attendance-bulk-upload.service';
import { AttendanceExceptionsService } from './attendance-exceptions.service';
import { AttendanceFileParserService } from './attendance-file-parser.service';
import { AttendanceLockingService } from './attendance-locking.service';
import { AttendanceParentNotificationService } from './attendance-parent-notification.service';
import { AttendancePatternService } from './attendance-pattern.service';
import { AttendanceReadFacade } from './attendance-read.facade';
import { AttendanceReportingService } from './attendance-reporting.service';
import { AttendanceScanService } from './attendance-scan.service';
import { AttendanceSessionService } from './attendance-session.service';
import { AttendanceUploadService } from './attendance-upload.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { DailySummaryService } from './daily-summary.service';

@Module({
  imports: [
    forwardRef(() => AcademicsModule),
    AiModule,
    AuthModule,
    ClassesModule,
    CommunicationsModule,
    ConfigurationModule,
    GdprModule,
    ParentsModule,
    SchedulesModule,
    SchoolClosuresModule,
    StaffProfilesModule,
    StudentsModule,
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceSessionService,
    AttendanceLockingService,
    AttendanceReportingService,
    AttendancePatternService,
    AttendanceReadFacade,
    AttendanceScanService,
    AttendanceFileParserService,
    AttendanceBulkUploadService,
    AttendanceExceptionsService,
    AttendanceUploadService,
    DailySummaryService,
    AttendanceParentNotificationService,
  ],
  exports: [AttendanceService, AttendanceReadFacade, DailySummaryService],
})
export class AttendanceModule {}
