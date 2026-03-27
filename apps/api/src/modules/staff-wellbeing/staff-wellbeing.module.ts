import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { BlockImpersonationGuard } from '../../common/guards/block-impersonation.guard';
import { ConfigurationModule } from '../configuration/configuration.module';

import { ResourceController } from './controllers/resource.controller';
import { SurveyController } from './controllers/survey.controller';
import { HmacService } from './services/hmac.service';
import { ResourceService } from './services/resource.service';
import { SurveyService } from './services/survey.service';

@Module({
  imports: [
    ConfigurationModule,
    BullModule.registerQueue({ name: 'wellbeing' }),
  ],
  controllers: [SurveyController, ResourceController],
  providers: [BlockImpersonationGuard, HmacService, SurveyService, ResourceService],
  exports: [HmacService],
})
export class StaffWellbeingModule {}
