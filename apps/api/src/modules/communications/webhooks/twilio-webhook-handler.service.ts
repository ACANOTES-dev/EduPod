import { Injectable, Logger } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { SuppressionListService } from '../suppression/suppression-list.service';

/**
 * Twilio error codes that mean the destination is unusable forever.
 * Mapping curated from Twilio's documented catalog.
 */
const HARD_BOUNCE_ERROR_CODES = new Set<number>([
  30003, // Unreachable destination handset
  30005, // Unknown destination handset
  30006, // Landline / unreachable
  21211, // Invalid 'To' phone number
  21408, // Permission to send to this number not enabled
  21610, // Recipient unsubscribed (STOP)
]);

@Injectable()
export class TwilioWebhookHandlerService {
  private readonly logger = new Logger(TwilioWebhookHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly suppressionService: SuppressionListService,
  ) {}

  async handleSms(tenantId: string, params: Record<string, string>): Promise<void> {
    await this.handleStatusCallback(tenantId, params, 'sms');
  }

  async handleWhatsApp(tenantId: string, params: Record<string, string>): Promise<void> {
    // WhatsApp inbound has `From` set to the recipient and no `MessageStatus`.
    const isInbound = !params['MessageStatus'] && Boolean(params['From']);
    if (isInbound) {
      // Service-window updates are owned by Impl 08. Until that lands we
      // log and return — the webhook event log row is already written
      // by the controller, so Impl 08 can rely on
      // `notification_webhook_events` as a backup.
      this.logger.log(
        `WhatsApp inbound for tenant ${tenantId} from ${params['From']} — service-window update deferred to Impl 08`,
      );
      return;
    }

    await this.handleStatusCallback(tenantId, params, 'whatsapp');
  }

  private async handleStatusCallback(
    tenantId: string,
    params: Record<string, string>,
    channel: 'sms' | 'whatsapp',
  ): Promise<void> {
    const messageSid = params['MessageSid'];
    if (!messageSid) {
      this.logger.warn(`Twilio ${channel} webhook missing MessageSid (tenant ${tenantId})`);
      return;
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const notification = await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.notification.findFirst({
        where: { tenant_id: tenantId, provider_message_id: messageSid, channel },
      });
    });

    if (!notification) {
      this.logger.log(
        `Twilio ${channel} status for unknown MessageSid ${messageSid} (tenant ${tenantId})`,
      );
      return;
    }

    const status = params['MessageStatus'];
    const errorCode = Number.parseInt(params['ErrorCode'] ?? '', 10);
    const recipient = stripWhatsAppPrefix(params['To'] ?? '');

    switch (status) {
      case 'queued':
      case 'accepted':
        return;
      case 'sent':
        await this.updateStatus(tenantId, notification.id, 'sent', { sent_at: new Date() });
        return;
      case 'delivered':
        await this.updateStatus(tenantId, notification.id, 'delivered', {
          delivered_at: new Date(),
        });
        return;
      case 'failed':
      case 'undelivered':
        await this.handleFailure(tenantId, notification.id, channel, recipient, status, errorCode);
        return;
      default:
        this.logger.log(`Unhandled Twilio status: ${status}`);
    }
  }

  private async handleFailure(
    tenantId: string,
    notificationId: string,
    channel: 'sms' | 'whatsapp',
    recipient: string,
    status: string,
    errorCode: number,
  ): Promise<void> {
    await this.updateStatus(tenantId, notificationId, 'failed', {
      failure_reason: `Twilio ${status}${Number.isFinite(errorCode) ? ` (code ${errorCode})` : ''}`,
    });
    if (recipient && Number.isFinite(errorCode) && HARD_BOUNCE_ERROR_CODES.has(errorCode)) {
      await this.suppressionService.addSuppression({
        tenantId,
        channel,
        recipient,
        reason: 'hard_bounce',
        source: `webhook:twilio.${status}`,
        notificationId,
        expiresAt: null,
      });
    }
  }

  private async updateStatus(
    tenantId: string,
    notificationId: string,
    status: 'sent' | 'delivered' | 'failed',
    extra: Partial<{ sent_at: Date; delivered_at: Date; failure_reason: string }>,
  ): Promise<void> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.notification.update({
        where: { id: notificationId },
        data: { status: status as never, ...extra },
      });
    });
  }
}

export function stripWhatsAppPrefix(s: string): string {
  return s.replace(/^whatsapp:/, '');
}
