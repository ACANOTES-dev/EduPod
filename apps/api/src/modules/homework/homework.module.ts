import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { ClassesModule } from '../classes/classes.module';
import { ParentsModule } from '../parents/parents.module';
import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';
import { StudentsModule } from '../students/students.module';
import { TenantsModule } from '../tenants/tenants.module';

import { HomeworkAnalyticsController } from './homework-analytics.controller';
import { HomeworkAnalyticsService } from './homework-analytics.service';
import { HomeworkCompletionAnalyticsService } from './homework-completion-analytics.service';
import { HomeworkCompletionsController } from './homework-completions.controller';
import { HomeworkCompletionsService } from './homework-completions.service';
import { HomeworkDiaryController } from './homework-diary.controller';
import { HomeworkDiaryService } from './homework-diary.service';
import { HomeworkLoadAnalyticsService } from './homework-load-analytics.service';
import { HomeworkParentController } from './homework-parent.controller';
import { HomeworkParentService } from './homework-parent.service';
import { HomeworkStudentAnalyticsService } from './homework-student-analytics.service';
import { HomeworkController } from './homework.controller';
import { HomeworkService } from './homework.service';

@Module({
  imports: [
    AcademicsModule,
    ClassesModule,
    ParentsModule,
    PrismaModule,
    S3Module,
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
  ],
  providers: [
    HomeworkService,
    HomeworkCompletionsService,
    HomeworkDiaryService,
    HomeworkParentService,
    HomeworkAnalyticsService,
    HomeworkCompletionAnalyticsService,
    HomeworkLoadAnalyticsService,
    HomeworkStudentAnalyticsService,
  ],
  exports: [HomeworkService, HomeworkCompletionsService],
})
export class HomeworkModule {}
