import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { ApprovalsModule } from '../approvals/approvals.module';
import { AuthModule } from '../auth/auth.module';
import { ClassesModule } from '../classes/classes.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { GdprModule } from '../gdpr/gdpr.module';
import { HouseholdsModule } from '../households/households.module';
import { MetricsModule } from '../metrics/metrics.module';
import { ParentsModule } from '../parents/parents.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { StudentsModule } from '../students/students.module';
import { TenantsModule } from '../tenants/tenants.module';

import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { AudienceResolutionService } from './audience-resolution.service';
import { CommsCacheBusModule } from './cache-bus.module';
import { CommsLoggerService } from './comms-logger.service';
import { CommsMetricsService } from './comms-metrics.service';
import { CommunicationsReadFacade } from './communications-read.facade';
import { EmailDomainNotifierAdapter } from './deliverability/email-domain-notifier.adapter';
import { EMAIL_DOMAIN_NOTIFIER } from './deliverability/email-domain-notifier.token';
import { EmailDomainController } from './deliverability/email-domain.controller';
import { EmailDomainService } from './deliverability/email-domain.service';
import { InboxBridgeService } from './inbox-bridge.service';
import { IsEnabledCacheService } from './is-enabled-cache.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationRateLimitService } from './notification-rate-limit.service';
import { NotificationTemplatesController } from './notification-templates.controller';
import { NotificationTemplatesService } from './notification-templates.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { InboxChannelProvider } from './providers/inbox-channel.provider';
import { ResendEmailProvider } from './providers/resend-email.provider';
import { TwilioSmsProvider } from './providers/twilio-sms.provider';
import { TwilioWhatsAppProvider } from './providers/twilio-whatsapp.provider';
import { SuppressionListService } from './suppression/suppression-list.service';
import { TemplateRendererService } from './template-renderer.service';
import { UnsubscribeController } from './unsubscribe.controller';
import { UnsubscribeService } from './unsubscribe.service';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { CommunicationsWebhooksController } from './webhooks/communications-webhooks.controller';
import { ResendWebhookHandlerService } from './webhooks/resend-webhook-handler.service';
import { TwilioWebhookHandlerService } from './webhooks/twilio-webhook-handler.service';
import { WebhookSignatureVerifierService } from './webhooks/webhook-signature-verifier.service';
import { WhatsAppServiceWindowService } from './whatsapp-templates/whatsapp-service-window.service';
import { WhatsAppTemplateController } from './whatsapp-templates/whatsapp-template.controller';
import { WhatsAppTemplateService } from './whatsapp-templates/whatsapp-template.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    ApprovalsModule,
    AuthModule,
    ClassesModule,
    ConfigurationModule,
    GdprModule,
    HouseholdsModule,
    MetricsModule,
    ParentsModule,
    StudentsModule,
    TenantsModule,
    CommsCacheBusModule,
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [
    AnnouncementsController,
    NotificationsController,
    NotificationTemplatesController,
    UnsubscribeController,
    WebhookController,
    CommunicationsWebhooksController,
    EmailDomainController,
    WhatsAppTemplateController,
  ],
  providers: [
    AnnouncementsService,
    NotificationsService,
    NotificationTemplatesService,
    NotificationDispatchService,
    AudienceResolutionService,
    WebhookService,
    TemplateRendererService,
    InboxChannelProvider,
    ResendEmailProvider,
    TwilioWhatsAppProvider,
    TwilioSmsProvider,
    CommunicationsReadFacade,
    NotificationRateLimitService,
    UnsubscribeService,
    InboxBridgeService,
    IsEnabledCacheService,
    SuppressionListService,
    WebhookSignatureVerifierService,
    ResendWebhookHandlerService,
    TwilioWebhookHandlerService,
    EmailDomainService,
    EmailDomainNotifierAdapter,
    { provide: EMAIL_DOMAIN_NOTIFIER, useExisting: EmailDomainNotifierAdapter },
    WhatsAppTemplateService,
    WhatsAppServiceWindowService,
    CommsLoggerService,
    CommsMetricsService,
  ],
  exports: [
    AnnouncementsService,
    CommunicationsReadFacade,
    NotificationsService,
    NotificationDispatchService,
    AudienceResolutionService,
    TemplateRendererService,
    NotificationRateLimitService,
    InboxBridgeService,
    InboxChannelProvider,
    IsEnabledCacheService,
    SuppressionListService,
    EmailDomainService,
    WhatsAppTemplateService,
    WhatsAppServiceWindowService,
    CommsLoggerService,
    CommsMetricsService,
  ],
})
export class CommunicationsModule {}
