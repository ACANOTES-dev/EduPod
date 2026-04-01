import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { BehaviourAwardService } from './behaviour-award.service';
import { BehaviourCoreModule } from './behaviour-core.module';
import { BehaviourHouseService } from './behaviour-house.service';
import { BehaviourRecognitionController } from './behaviour-recognition.controller';
import { BehaviourRecognitionService } from './behaviour-recognition.service';

@Module({
  imports: [AuthModule, BehaviourCoreModule, BullModule.registerQueue({ name: 'notifications' })],
  controllers: [BehaviourRecognitionController],
  providers: [BehaviourAwardService, BehaviourRecognitionService, BehaviourHouseService],
  exports: [BehaviourAwardService],
})
export class BehaviourRecognitionModule {}
