import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ApprovalsModule } from '../approvals/approvals.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { AudienceResolutionService } from './audience-resolution.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationRateLimitService } from './notification-rate-limit.service';
import { NotificationTemplatesController } from './notification-templates.controller';
import { NotificationTemplatesService } from './notification-templates.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { ResendEmailProvider } from './providers/resend-email.provider';
import { TwilioSmsProvider } from './providers/twilio-sms.provider';
import { TwilioWhatsAppProvider } from './providers/twilio-whatsapp.provider';
import { TemplateRendererService } from './template-renderer.service';
import { UnsubscribeController } from './unsubscribe.controller';
import { UnsubscribeService } from './unsubscribe.service';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    ApprovalsModule,
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [
    AnnouncementsController,
    NotificationsController,
    NotificationTemplatesController,
    UnsubscribeController,
    WebhookController,
  ],
  providers: [
    AnnouncementsService,
    NotificationsService,
    NotificationTemplatesService,
    NotificationDispatchService,
    AudienceResolutionService,
    WebhookService,
    TemplateRendererService,
    ResendEmailProvider,
    TwilioWhatsAppProvider,
    TwilioSmsProvider,
    NotificationRateLimitService,
    UnsubscribeService,
  ],
  exports: [
    AnnouncementsService,
    NotificationsService,
    NotificationDispatchService,
    AudienceResolutionService,
    TemplateRendererService,
    NotificationRateLimitService,
  ],
})
export class CommunicationsModule {}
