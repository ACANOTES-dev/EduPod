import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { SearchModule } from '../search/search.module';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [
    SearchModule,
    BullModule.registerQueue(
      { name: 'behaviour' },
      { name: 'compliance' },
      { name: 'finance' },
      { name: 'notifications' },
      { name: 'pastoral' },
    ),
  ],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
