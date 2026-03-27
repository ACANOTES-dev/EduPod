import { Injectable, Logger } from '@nestjs/common';
import { Notification, NotificationChannel } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { NotificationRateLimitService } from './notification-rate-limit.service';
import { NotificationTemplatesService } from './notification-templates.service';
import { ResendEmailProvider } from './providers/resend-email.provider';
import { TwilioSmsProvider } from './providers/twilio-sms.provider';
import { TwilioWhatsAppProvider } from './providers/twilio-whatsapp.provider';
import { TemplateRendererService } from './template-renderer.service';

/** Fallback chain: if a channel fails all retries, try the next one */
const FALLBACK_CHAIN: Record<string, NotificationChannel | null> = {
  whatsapp: 'sms',
  sms: 'email',
  email: 'in_app',
  in_app: null,
};

/** Notification with the recipient relation included */
type NotificationWithRecipient = Notification & {
  recipient: { id: string; email: string; first_name: string; last_name: string };
};

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templateService: NotificationTemplatesService,
    private readonly templateRenderer: TemplateRendererService,
    private readonly resendEmail: ResendEmailProvider,
    private readonly twilioWhatsApp: TwilioWhatsAppProvider,
    private readonly twilioSms: TwilioSmsProvider,
    private readonly rateLimitService: NotificationRateLimitService,
  ) {}

  async dispatchWithFallback(notificationId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        recipient: {
          select: { id: true, email: true, first_name: true, last_name: true },
        },
      },
    });

    if (!notification) {
      this.logger.warn(`Notification ${notificationId} not found, skipping`);
      return;
    }

    if (
      notification.status === 'sent' ||
      notification.status === 'delivered' ||
      notification.status === 'read'
    ) {
      return; // Already processed
    }

    try {
      switch (notification.channel) {
        case 'in_app':
          await this.dispatchInApp(notification);
          break;
        case 'whatsapp':
          await this.dispatchWhatsApp(notification);
          break;
        case 'sms':
          await this.dispatchSms(notification);
          break;
        case 'email':
          await this.dispatchEmail(notification);
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.handleFailure(notification, message);
    }
  }

  /**
   * In-app notifications are already delivered (they exist in the DB).
   * Just mark as delivered.
   */
  private async dispatchInApp(notification: NotificationWithRecipient): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'delivered', delivered_at: new Date() },
    });
  }

  private async dispatchEmail(notification: NotificationWithRecipient): Promise<void> {
    // Rate limit check
    const rateLimitResult = await this.rateLimitService.checkAndIncrement(
      notification.tenant_id,
      notification.recipient_user_id,
      notification.channel,
    );
    if (!rateLimitResult.allowed) {
      await this.updateNotificationStatus(notification.id, 'failed', rateLimitResult.reason);
      return;
    }

    // Resolve template
    const template = await this.templateService.resolveTemplate(
      notification.tenant_id,
      notification.template_key ?? 'default',
      'email',
      notification.locale,
    );

    if (!template) {
      this.logger.warn(
        `No email template for key=${notification.template_key} locale=${notification.locale}`,
      );
      await this.createFallbackNotification(notification, 'in_app');
      await this.markFailed(notification, 'No email template for locale');
      return;
    }

    // Resolve recipient email
    const email = await this.resolveRecipientContact(
      notification.tenant_id,
      notification.recipient_user_id,
      'email',
    );

    if (!email) {
      await this.markFailed(notification, 'No email address found for recipient');
      await this.createFallbackNotification(notification, 'in_app');
      return;
    }

    // Render template
    const variables = (notification.payload_json as Record<string, unknown>) ?? {};
    const renderedBody = this.templateRenderer.render(template.body_template, variables);
    const renderedSubject = this.templateRenderer.renderSubject(
      template.subject_template ?? '',
      variables,
    );

    // Send via Resend
    const result = await this.resendEmail.send({
      to: email,
      subject: renderedSubject ?? 'Notification',
      html: renderedBody,
      tags: [
        { name: 'notification_id', value: notification.id },
        { name: 'template_key', value: notification.template_key ?? 'default' },
      ],
    });

    // Mark as sent
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'sent',
        provider_message_id: result.messageId,
        sent_at: new Date(),
        attempt_count: notification.attempt_count + 1,
      },
    });
  }

  private async dispatchWhatsApp(notification: NotificationWithRecipient): Promise<void> {
    // Rate limit check
    const rateLimitResult = await this.rateLimitService.checkAndIncrement(
      notification.tenant_id,
      notification.recipient_user_id,
      notification.channel,
    );
    if (!rateLimitResult.allowed) {
      await this.updateNotificationStatus(notification.id, 'failed', rateLimitResult.reason);
      return;
    }

    // Resolve template
    const template = await this.templateService.resolveTemplate(
      notification.tenant_id,
      notification.template_key ?? 'default',
      'whatsapp',
      notification.locale,
    );

    if (!template) {
      this.logger.warn(
        `No WhatsApp template for key=${notification.template_key} locale=${notification.locale}, falling back`,
      );
      await this.markFailed(notification, 'No WhatsApp template for locale');
      await this.createFallbackNotification(notification, 'sms');
      return;
    }

    // Resolve WhatsApp phone
    const phone = await this.resolveRecipientContact(
      notification.tenant_id,
      notification.recipient_user_id,
      'whatsapp',
    );

    if (!phone) {
      // No WhatsApp phone is not a failure — skip directly to fallback
      this.logger.log(
        `No WhatsApp phone for recipient ${notification.recipient_user_id}, falling back to SMS`,
      );
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'failed',
          failure_reason: 'No WhatsApp phone number found',
          attempt_count: notification.attempt_count + 1,
          next_retry_at: null,
        },
      });
      await this.createFallbackNotification(notification, 'sms');
      return;
    }

    // Render template and strip HTML for WhatsApp
    const variables = (notification.payload_json as Record<string, unknown>) ?? {};
    const renderedBody = this.templateRenderer.render(template.body_template, variables);
    const strippedBody = this.templateRenderer.stripHtml(renderedBody);

    // Send via Twilio WhatsApp
    const result = await this.twilioWhatsApp.send({ to: phone, body: strippedBody });

    // Mark as sent
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'sent',
        provider_message_id: result.messageSid,
        sent_at: new Date(),
        attempt_count: notification.attempt_count + 1,
      },
    });
  }

  private async dispatchSms(notification: NotificationWithRecipient): Promise<void> {
    // Rate limit check
    const rateLimitResult = await this.rateLimitService.checkAndIncrement(
      notification.tenant_id,
      notification.recipient_user_id,
      notification.channel,
    );
    if (!rateLimitResult.allowed) {
      await this.updateNotificationStatus(notification.id, 'failed', rateLimitResult.reason);
      return;
    }

    // Resolve template
    const template = await this.templateService.resolveTemplate(
      notification.tenant_id,
      notification.template_key ?? 'default',
      'sms',
      notification.locale,
    );

    if (!template) {
      this.logger.warn(
        `No SMS template for key=${notification.template_key} locale=${notification.locale}, falling back to email`,
      );
      await this.markFailed(notification, 'No SMS template for locale');
      await this.createFallbackNotification(notification, 'email');
      return;
    }

    // Resolve SMS phone
    const phone = await this.resolveRecipientContact(
      notification.tenant_id,
      notification.recipient_user_id,
      'sms',
    );

    if (!phone) {
      this.logger.log(
        `No phone number for recipient ${notification.recipient_user_id}, falling back to email`,
      );
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'failed',
          failure_reason: 'No phone number found',
          attempt_count: notification.attempt_count + 1,
          next_retry_at: null,
        },
      });
      await this.createFallbackNotification(notification, 'email');
      return;
    }

    // Render template and strip HTML for SMS
    const variables = (notification.payload_json as Record<string, unknown>) ?? {};
    const renderedBody = this.templateRenderer.render(template.body_template, variables);
    const strippedBody = this.templateRenderer.stripHtml(renderedBody);

    // Send via Twilio SMS
    const result = await this.twilioSms.send({ to: phone, body: strippedBody });

    // Mark as sent
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'sent',
        provider_message_id: result.messageSid,
        sent_at: new Date(),
        attempt_count: notification.attempt_count + 1,
      },
    });
  }

  /**
   * Resolve the contact info for a recipient based on channel.
   * - email: User.email
   * - whatsapp: Parent.whatsapp_phone (via User -> Parent)
   * - sms: Parent.phone (via User -> Parent)
   */
  private async resolveRecipientContact(
    tenantId: string,
    userId: string,
    channel: 'email' | 'whatsapp' | 'sms',
  ): Promise<string | null> {
    if (channel === 'email') {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      return user?.email ?? null;
    }

    // For whatsapp and sms, look up Parent record via User
    const parent = await this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
      select: { phone: true, whatsapp_phone: true },
    });

    if (!parent) {
      return null;
    }

    if (channel === 'whatsapp') {
      return parent.whatsapp_phone ?? null;
    }

    // sms
    return parent.phone ?? null;
  }

  private async createFallbackNotification(
    original: NotificationWithRecipient,
    fallbackChannel: NotificationChannel,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        tenant_id: original.tenant_id,
        recipient_user_id: original.recipient_user_id,
        channel: fallbackChannel,
        template_key: original.template_key,
        locale: original.locale,
        status: fallbackChannel === 'in_app' ? 'delivered' : 'queued',
        payload_json: original.payload_json ?? {},
        source_entity_type: original.source_entity_type,
        source_entity_id: original.source_entity_id,
        delivered_at: fallbackChannel === 'in_app' ? new Date() : null,
      },
    });
  }

  private async handleFailure(
    notification: NotificationWithRecipient,
    reason: string,
  ): Promise<void> {
    const newAttemptCount = notification.attempt_count + 1;
    const maxAttempts = notification.max_attempts;

    if (newAttemptCount >= maxAttempts) {
      // Dead-letter: no more retries
      await this.markFailed(notification, reason);

      // Create fallback via the chain
      const fallbackChannel = FALLBACK_CHAIN[notification.channel];
      if (fallbackChannel) {
        await this.createFallbackNotification(notification, fallbackChannel);
      }
      return;
    }

    // Exponential backoff: 60s * 2^attempt
    const backoffMs = 60_000 * Math.pow(2, newAttemptCount);
    const nextRetryAt = new Date(Date.now() + backoffMs);

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'failed',
        attempt_count: newAttemptCount,
        failure_reason: reason,
        next_retry_at: nextRetryAt,
      },
    });
  }

  private async markFailed(
    notification: NotificationWithRecipient,
    reason: string,
  ): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'failed',
        attempt_count: notification.attempt_count + 1,
        failure_reason: reason,
        next_retry_at: null,
      },
    });
  }

  /**
   * Update notification status with an optional failure reason.
   * Used for rate-limit rejections where no fallback should be created.
   */
  private async updateNotificationStatus(
    notificationId: string,
    status: 'failed',
    reason: string | undefined,
  ): Promise<void> {
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status,
        failure_reason: reason,
        next_retry_at: null,
      },
    });
  }
}
