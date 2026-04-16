import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QueueAdminController } from './queue-admin.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'gradebook' }),
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [QueueAdminController],
})
export class QueueAdminModule {}
