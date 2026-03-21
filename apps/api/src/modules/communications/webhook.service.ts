import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleResendEvent(event: { type: string; data: Record<string, unknown> }) {
    const messageId = event.data?.message_id as string | undefined;
    if (!messageId) {
      this.logger.warn('Resend webhook missing message_id');
      return;
    }

    const notification = await this.prisma.notification.findFirst({
      where: { provider_message_id: messageId },
    });

    if (!notification) {
      this.logger.warn(`No notification found for Resend message_id ${messageId}`);
      return;
    }

    switch (event.type) {
      case 'email.delivered':
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'delivered', delivered_at: new Date() },
        });
        break;
      case 'email.bounced':
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'failed', failure_reason: 'Email bounced' },
        });
        break;
      case 'email.complained':
        await this.prisma.notification.update({
          where: { id: notification.id },
          data: { status: 'failed', failure_reason: 'Spam complaint' },
        });
        break;
      default:
        this.logger.log(`Unhandled Resend event type: ${event.type}`);
    }
  }

  async handleTwilioEvent(event: { MessageSid?: string; MessageStatus?: string }) {
    const messageSid = event.MessageSid;
    if (!messageSid) {
      this.logger.warn('Twilio webhook missing MessageSid');
      return;
    }

    const notification = await this.prisma.notification.findFirst({
      where: { provider_message_id: messageSid },
    });

    if (!notification) {
      this.logger.warn(`No notification found for Twilio MessageSid ${messageSid}`);
      return;
    }

    const status = event.MessageStatus;
    if (status === 'delivered') {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'delivered', delivered_at: new Date() },
      });
    } else if (status === 'failed' || status === 'undelivered') {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'failed', failure_reason: `Twilio status: ${status}` },
      });

      // Create email fallback
      await this.prisma.notification.create({
        data: {
          tenant_id: notification.tenant_id,
          recipient_user_id: notification.recipient_user_id,
          channel: 'email',
          template_key: notification.template_key,
          locale: notification.locale,
          status: 'queued',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          payload_json: notification.payload_json as any,
          source_entity_type: notification.source_entity_type,
          source_entity_id: notification.source_entity_id,
        },
      });
    }
  }
}
