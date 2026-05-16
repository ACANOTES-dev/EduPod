import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PlatformAuditModule } from '../platform-audit/platform-audit.module';

import { QueueAdminController } from './queue-admin.controller';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'gradebook' }),
    BullModule.registerQueue({ name: 'notifications' }),
    PlatformAuditModule,
  ],
  controllers: [QueueAdminController],
})
export class QueueAdminModule {}
