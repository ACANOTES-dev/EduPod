import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { S3Module } from '../s3/s3.module';

import { HomeworkAnalyticsController } from './homework-analytics.controller';
import { HomeworkAnalyticsService } from './homework-analytics.service';
import { HomeworkCompletionsController } from './homework-completions.controller';
import { HomeworkCompletionsService } from './homework-completions.service';
import { HomeworkDiaryController } from './homework-diary.controller';
import { HomeworkDiaryService } from './homework-diary.service';
import { HomeworkParentController } from './homework-parent.controller';
import { HomeworkParentService } from './homework-parent.service';
import { HomeworkController } from './homework.controller';
import { HomeworkService } from './homework.service';

@Module({
  imports: [
    PrismaModule,
    S3Module,
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
  ],
  exports: [
    HomeworkService,
    HomeworkCompletionsService,
  ],
})
export class HomeworkModule {}
