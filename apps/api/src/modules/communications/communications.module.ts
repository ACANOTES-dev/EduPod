import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { ApprovalsModule } from '../approvals/approvals.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { AudienceResolutionService } from './audience-resolution.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationTemplatesController } from './notification-templates.controller';
import { NotificationTemplatesService } from './notification-templates.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    ApprovalsModule,
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [
    AnnouncementsController,
    NotificationsController,
    NotificationTemplatesController,
    WebhookController,
  ],
  providers: [
    AnnouncementsService,
    NotificationsService,
    NotificationTemplatesService,
    NotificationDispatchService,
    AudienceResolutionService,
    WebhookService,
  ],
  exports: [
    AnnouncementsService,
    NotificationsService,
    NotificationDispatchService,
    AudienceResolutionService,
  ],
})
export class CommunicationsModule {}
