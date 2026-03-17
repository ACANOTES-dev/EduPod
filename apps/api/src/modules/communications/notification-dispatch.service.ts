import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationTemplatesService } from './notification-templates.service';

@Injectable()
export class NotificationDispatchService {
  private readonly logger = new Logger(NotificationDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templateService: NotificationTemplatesService,
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
      if (notification.channel === 'in_app') {
        // In-app notifications are immediately delivered (stored in DB, read via API)
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'delivered', delivered_at: new Date() },
        });
        return;
      }

      if (notification.channel === 'whatsapp') {
        await this.dispatchWhatsApp(notification);
        return;
      }

      if (notification.channel === 'email') {
        await this.dispatchEmail(notification);
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.handleFailure(notification, message);
    }
  }

  private async dispatchWhatsApp(notification: any): Promise<void> {
    const template = await this.templateService.resolveTemplate(
      notification.tenant_id,
      notification.template_key ?? 'default',
      'whatsapp',
      notification.locale,
    );

    if (!template) {
      this.logger.warn(
        `No WhatsApp template for key=${notification.template_key} locale=${notification.locale}, falling back to email`,
      );
      await this.createFallbackNotification(notification, 'email');
      await this.markFailed(notification, 'No WhatsApp template for locale');
      return;
    }

    // TODO: Integrate with Twilio WhatsApp API
    // For now, mark as sent (placeholder for Twilio integration)
    this.logger.log(`[PLACEHOLDER] Would send WhatsApp to recipient ${notification.recipient_user_id}`);
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'sent',
        sent_at: new Date(),
        attempt_count: notification.attempt_count + 1,
      },
    });
  }

  private async dispatchEmail(notification: any): Promise<void> {
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
      // Fall back to in_app if user exists
      await this.createFallbackNotification(notification, 'in_app');
      await this.markFailed(notification, 'No email template for locale');
      return;
    }

    // TODO: Integrate with Resend API
    // For now, mark as sent (placeholder for Resend integration)
    this.logger.log(`[PLACEHOLDER] Would send email to recipient ${notification.recipient_user_id}`);
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: 'sent',
        sent_at: new Date(),
        attempt_count: notification.attempt_count + 1,
      },
    });
  }

  private async createFallbackNotification(original: any, fallbackChannel: string): Promise<void> {
    await this.prisma.notification.create({
      data: {
        tenant_id: original.tenant_id,
        recipient_user_id: original.recipient_user_id,
        channel: fallbackChannel as any,
        template_key: original.template_key,
        locale: original.locale,
        status: fallbackChannel === 'in_app' ? 'delivered' : 'queued',
        payload_json: original.payload_json,
        source_entity_type: original.source_entity_type,
        source_entity_id: original.source_entity_id,
        delivered_at: fallbackChannel === 'in_app' ? new Date() : null,
      },
    });
  }

  private async handleFailure(notification: any, reason: string): Promise<void> {
    const newAttemptCount = notification.attempt_count + 1;
    const maxAttempts = notification.max_attempts;

    if (newAttemptCount >= maxAttempts) {
      // Dead-letter: no more retries
      await this.markFailed(notification, reason);

      // If WhatsApp failed all retries, create email fallback
      if (notification.channel === 'whatsapp') {
        await this.createFallbackNotification(notification, 'email');
      } else if (notification.channel === 'email') {
        await this.createFallbackNotification(notification, 'in_app');
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

  private async markFailed(notification: any, reason: string): Promise<void> {
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
}
