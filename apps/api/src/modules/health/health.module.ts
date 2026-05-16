import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { SearchModule } from '../search/search.module';

import { AdminHealthController } from './admin-health.controller';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [
    SearchModule,
    BullModule.registerQueue(
      { name: 'notifications' },
      { name: 'behaviour' },
      { name: 'finance' },
      { name: 'payroll' },
      { name: 'pastoral' },
    ),
  ],
  controllers: [AdminHealthController, HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
