import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AcademicsModule } from '../academics/academics.module';
import { AuthModule } from '../auth/auth.module';
import { ConfigurationModule } from '../configuration/configuration.module';

import { BehaviourAwardService } from './behaviour-award.service';
import { BehaviourCoreModule } from './behaviour-core.module';
import { BehaviourHouseService } from './behaviour-house.service';
import { BehaviourRecognitionController } from './behaviour-recognition.controller';
import { BehaviourRecognitionService } from './behaviour-recognition.service';

@Module({
  imports: [
    AcademicsModule,
    AuthModule,
    ConfigurationModule,
    BehaviourCoreModule,
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [BehaviourRecognitionController],
  providers: [BehaviourAwardService, BehaviourRecognitionService, BehaviourHouseService],
  exports: [BehaviourAwardService],
})
export class BehaviourRecognitionModule {}
