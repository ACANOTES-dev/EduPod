import { Injectable, Logger } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { SuppressionListService } from '../suppression/suppression-list.service';

interface ResendEvent {
  type: string;
  data: {
    message_id?: string;
    email_id?: string;
    to?: string[] | string;
    bounce?: { type?: 'hard' | 'soft'; message?: string };
    complaint?: { type?: string };
    [k: string]: unknown;
  };
}

const SOFT_BOUNCE_THRESHOLD = 3;
const SOFT_BOUNCE_LOOKBACK_DAYS = 30;
const MS_PER_DAY = 86_400_000;

/**
 * Resend → notification.status mapping:
 *   email.sent              → 'sent'
 *   email.delivered         → 'delivered'
 *   email.bounced (hard)    → 'failed' + failure_reason='Resend bounce (hard): ...' + suppression(hard_bounce, permanent)
 *   email.bounced (soft)    → 'failed' + failure_reason='Resend bounce (soft): ...'; if 3+ in last 30 days, suppression(soft_bounce_threshold, expires_at = +30d)
 *   email.complained        → 'failed' + failure_reason='Resend spam complaint' + suppression(complaint, permanent)
 *   email.delivery_delayed  → no status change (logged only)
 *
 * Note on `notification.status`: the existing NotificationStatus enum
 * (`queued`, `claimed`, `sent`, `delivered`, `failed`, `read`) does NOT
 * include `bounced` / `complained`. Bounces and complaints map to
 * `failed` with a descriptive `failure_reason` — the suppression-list
 * row is the canonical record of "permanent failure for this recipient".
 * Future enum extension could split `failed` into more granular states.
 */
@Injectable()
export class ResendWebhookHandlerService {
  private readonly logger = new Logger(ResendWebhookHandlerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly suppressionService: SuppressionListService,
  ) {}

  async handle(tenantId: string, raw: object): Promise<void> {
    const event = raw as ResendEvent;
    const messageId = event.data?.message_id ?? event.data?.email_id;
    if (!messageId) {
      this.logger.warn(`Resend event missing message_id/email_id: ${event.type}`);
      return;
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const notification = await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.notification.findFirst({
        where: { tenant_id: tenantId, provider_message_id: messageId },
      });
    });

    if (!notification) {
      this.logger.log(
        `Resend event ${event.type} for unknown message_id ${messageId} (tenant ${tenantId})`,
      );
      return;
    }

    const recipientEmail = extractRecipientEmail(event.data);

    switch (event.type) {
      case 'email.sent':
        await this.updateStatus(tenantId, notification.id, 'sent', { sent_at: new Date() });
        return;

      case 'email.delivered':
        await this.updateStatus(tenantId, notification.id, 'delivered', {
          delivered_at: new Date(),
        });
        return;

      case 'email.bounced':
        await this.handleBounce(tenantId, notification.id, recipientEmail, event);
        return;

      case 'email.bounce':
        // Resend has historically used both `email.bounced` and
        // `email.bounce` — accept both spellings.
        await this.handleBounce(tenantId, notification.id, recipientEmail, event);
        return;

      case 'email.complained':
      case 'email.complaint':
        await this.handleComplaint(tenantId, notification.id, recipientEmail);
        return;

      case 'email.delivery_delayed':
        this.logger.log(
          `Resend delivery_delayed for notification ${notification.id} (tenant ${tenantId})`,
        );
        return;

      default:
        this.logger.log(`Unhandled Resend event type: ${event.type}`);
    }
  }

  private async handleBounce(
    tenantId: string,
    notificationId: string,
    recipientEmail: string | null,
    event: ResendEvent,
  ): Promise<void> {
    const bounceType = event.data?.bounce?.type ?? 'soft';
    await this.updateStatus(tenantId, notificationId, 'failed', {
      failure_reason: `Resend bounce (${bounceType}): ${event.data?.bounce?.message ?? ''}`.trim(),
    });
    if (!recipientEmail) return;

    if (bounceType === 'hard') {
      await this.suppressionService.addSuppression({
        tenantId,
        channel: 'email',
        recipient: recipientEmail,
        reason: 'hard_bounce',
        source: 'webhook:resend.bounce',
        notificationId,
        expiresAt: null,
      });
      return;
    }

    // Soft bounce — count past 30 days; 3+ → suppress for 30 days.
    const recent = await this.countRecentSoftBounces(tenantId, recipientEmail);
    if (recent + 1 >= SOFT_BOUNCE_THRESHOLD) {
      const expiresAt = new Date(Date.now() + SOFT_BOUNCE_LOOKBACK_DAYS * MS_PER_DAY);
      await this.suppressionService.addSuppression({
        tenantId,
        channel: 'email',
        recipient: recipientEmail,
        reason: 'soft_bounce_threshold',
        source: 'webhook:resend.bounce',
        notificationId,
        expiresAt,
      });
    }
  }

  private async handleComplaint(
    tenantId: string,
    notificationId: string,
    recipientEmail: string | null,
  ): Promise<void> {
    await this.updateStatus(tenantId, notificationId, 'failed', {
      failure_reason: 'Resend spam complaint',
    });
    if (!recipientEmail) return;
    await this.suppressionService.addSuppression({
      tenantId,
      channel: 'email',
      recipient: recipientEmail,
      reason: 'complaint',
      source: 'webhook:resend.complained',
      notificationId,
      expiresAt: null,
    });
  }

  private async updateStatus(
    tenantId: string,
    notificationId: string,
    status: 'sent' | 'delivered' | 'failed',
    extra: Partial<{
      sent_at: Date;
      delivered_at: Date;
      failure_reason: string;
    }>,
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

  /**
   * Count soft-bounce webhook events for this recipient in the last 30 days.
   */
  private async countRecentSoftBounces(tenantId: string, recipient: string): Promise<number> {
    const since = new Date(Date.now() - SOFT_BOUNCE_LOOKBACK_DAYS * MS_PER_DAY);
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.notificationWebhookEvent.count({
        where: {
          tenant_id: tenantId,
          channel: 'email',
          event_type: 'email.bounced',
          signature_verified: true,
          received_at: { gte: since },
          payload_json: {
            string_contains: recipient,
          } as never,
        },
      });
    });
  }
}

function extractRecipientEmail(data: ResendEvent['data']): string | null {
  if (!data) return null;
  if (typeof data.to === 'string') return data.to;
  if (Array.isArray(data.to) && data.to.length > 0) return data.to[0] ?? null;
  return null;
}
