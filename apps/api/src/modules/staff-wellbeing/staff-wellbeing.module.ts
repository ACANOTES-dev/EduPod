import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { BlockImpersonationGuard } from '../../common/guards/block-impersonation.guard';
import { ConfigurationModule } from '../configuration/configuration.module';
import { RedisModule } from '../redis/redis.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';

import { AggregateWorkloadController } from './controllers/aggregate-workload.controller';
import { BoardReportController } from './controllers/board-report.controller';
import { PersonalWorkloadController } from './controllers/personal-workload.controller';
import { ResourceController } from './controllers/resource.controller';
import { SurveyResultsController } from './controllers/survey-results.controller';
import { SurveyController } from './controllers/survey.controller';
import { BoardReportService } from './services/board-report.service';
import { HmacService } from './services/hmac.service';
import { ResourceService } from './services/resource.service';
import { SurveyResultsService } from './services/survey-results.service';
import { SurveyService } from './services/survey.service';
import { WorkloadCacheService } from './services/workload-cache.service';
import { WorkloadComputeService } from './services/workload-compute.service';
import { WorkloadDataService } from './services/workload-data.service';
import { WorkloadMetricsService } from './services/workload-metrics.service';

@Module({
  imports: [
    ConfigurationModule,
    RedisModule,
    StaffProfilesModule,
    BullModule.registerQueue({ name: 'wellbeing' }),
  ],
  controllers: [
    SurveyController,
    SurveyResultsController,
    ResourceController,
    PersonalWorkloadController,
    AggregateWorkloadController,
    BoardReportController,
  ],
  providers: [
    BlockImpersonationGuard,
    HmacService,
    SurveyService,
    SurveyResultsService,
    ResourceService,
    WorkloadDataService,
    WorkloadMetricsService,
    WorkloadComputeService,
    WorkloadCacheService,
    BoardReportService,
  ],
  exports: [HmacService, WorkloadComputeService, WorkloadCacheService],
})
export class StaffWellbeingModule {}
