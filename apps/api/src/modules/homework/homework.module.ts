import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { ClassesModule } from '../classes/classes.module';
import { CommunicationsModule } from '../communications/communications.module';
import { InboxModule } from '../inbox/inbox.module';
import { ParentsModule } from '../parents/parents.module';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';
import { StudentsModule } from '../students/students.module';
import { TenantsModule } from '../tenants/tenants.module';

import { HomeworkAnalyticsController } from './homework-analytics.controller';
import { HomeworkAnalyticsService } from './homework-analytics.service';
import { HomeworkAuthorityService } from './homework-authority.service';
import { HomeworkCompletionAnalyticsService } from './homework-completion-analytics.service';
import { HomeworkCompletionsController } from './homework-completions.controller';
import { HomeworkCompletionsService } from './homework-completions.service';
import { HomeworkDiaryController } from './homework-diary.controller';
import { HomeworkDiaryService } from './homework-diary.service';
import { HomeworkLoadAnalyticsService } from './homework-load-analytics.service';
import { HomeworkNotificationService } from './homework-notification.service';
import { HomeworkParentController } from './homework-parent.controller';
import { HomeworkParentService } from './homework-parent.service';
import { HomeworkStudentAnalyticsService } from './homework-student-analytics.service';
import { HomeworkStudentController } from './homework-student.controller';
import { HomeworkStudentService } from './homework-student.service';
import { HomeworkController } from './homework.controller';
import { HomeworkService } from './homework.service';

@Module({
  imports: [
    AcademicsModule,
    ClassesModule,
    CommunicationsModule,
    InboxModule,
    ParentsModule,
    PrismaModule,
    S3Module,
    SchedulesModule,
    StaffProfilesModule,
    StudentsModule,
    TenantsModule,
    BullModule.registerQueue({ name: 'homework' }),
  ],
  controllers: [
    HomeworkController,
    HomeworkCompletionsController,
    HomeworkDiaryController,
    HomeworkParentController,
    HomeworkAnalyticsController,
    HomeworkStudentController,
  ],
  providers: [
    HomeworkService,
    HomeworkAuthorityService,
    HomeworkNotificationService,
    HomeworkCompletionsService,
    HomeworkDiaryService,
    HomeworkParentService,
    HomeworkAnalyticsService,
    HomeworkCompletionAnalyticsService,
    HomeworkLoadAnalyticsService,
    HomeworkStudentAnalyticsService,
    HomeworkStudentService,
  ],
  exports: [HomeworkService, HomeworkCompletionsService],
})
export class HomeworkModule {}
