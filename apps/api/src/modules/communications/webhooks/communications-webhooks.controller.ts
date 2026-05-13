import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';

import { apiError } from '../../../common/errors/api-error';
import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { TenantModuleService } from '../../../common/services/tenant-module.service';
import { EmailConfigService } from '../../configuration/email-config.service';
import { SmsConfigService } from '../../configuration/sms-config.service';
import { WhatsAppConfigService } from '../../configuration/whatsapp-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CommsMetricsService } from '../comms-metrics.service';

import { ResendWebhookHandlerService } from './resend-webhook-handler.service';
import { TwilioWebhookHandlerService } from './twilio-webhook-handler.service';
import { WebhookSignatureVerifierService } from './webhook-signature-verifier.service';

/**
 * `/v1/webhooks/communications/*` — per-tenant webhook receivers.
 *
 * No auth guards: webhooks come from external providers. Authentication
 * is the per-tenant signature, verified inline using the tenant's own
 * webhook secret (looked up via the channel's *ConfigService).
 *
 * Three invariants:
 *   1. Every webhook is logged BEFORE signature verification — the
 *      `notification_webhook_events` row is written even on signature
 *      failure (with `signature_verified=false`). Forged events leave
 *      an audit trail.
 *   2. Signature verification uses constant-time comparison via
 *      `WebhookSignatureVerifierService` (timingSafeEqual).
 *   3. Wrong-tenant rejection: a signature valid for Tenant A's secret
 *      cannot pass verification when posted to Tenant B's URL — the
 *      controller loads only `:tenantId`'s secret.
 */
@SkipThrottle()
@Controller('v1/webhooks/communications')
export class CommunicationsWebhooksController {
  private readonly logger = new Logger(CommunicationsWebhooksController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailConfig: EmailConfigService,
    private readonly smsConfig: SmsConfigService,
    private readonly whatsappConfig: WhatsAppConfigService,
    private readonly verifier: WebhookSignatureVerifierService,
    private readonly resendHandler: ResendWebhookHandlerService,
    private readonly twilioHandler: TwilioWebhookHandlerService,
    private readonly metrics: CommsMetricsService,
    private readonly tenantModuleService: TenantModuleService,
  ) {}

  // ─── Email (Resend) ─────────────────────────────────────────────────────
  // POST /v1/webhooks/communications/email/:tenantId
  @Post('email/:tenantId')
  @HttpCode(HttpStatus.OK)
  async receiveEmail(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers() rawHeaders: Record<string, string>,
    @Body() body: unknown,
  ): Promise<{ accepted: true }> {
    const headers = lowercaseHeaders(rawHeaders);
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));

    const secret = await this.emailConfig.getWebhookSecret(tenantId);
    const verified = secret ? this.verifier.verifyResend(rawBody, headers, secret) : false;

    const providerEventId = extractResendEventId(body, headers);
    const eventType = extractResendEventType(body);
    await this.recordWebhookEvent({
      tenantId,
      channel: 'email',
      providerEventId,
      eventType,
      payload: body as object,
      signatureVerified: verified,
    });
    this.metrics.recordWebhook(tenantId, 'email', eventType, verified);

    if (!verified) {
      this.logger.warn(
        `Resend webhook signature failed for tenant ${tenantId} (event ${providerEventId})`,
      );
      throw new UnauthorizedException(
        apiError('WEBHOOK_SIGNATURE_INVALID', 'Webhook signature verification failed'),
      );
    }

    if (!(await this.isOutboundEnabled(tenantId, 'Resend'))) {
      return { accepted: true };
    }

    await this.resendHandler.handle(tenantId, body as object);
    return { accepted: true };
  }

  // ─── SMS (Twilio) ───────────────────────────────────────────────────────
  // POST /v1/webhooks/communications/sms/:tenantId
  @Post('sms/:tenantId')
  @HttpCode(HttpStatus.OK)
  async receiveSms(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-twilio-signature') signature: string | undefined,
    @Body() body: Record<string, string>,
  ): Promise<{ accepted: true }> {
    const url = buildAbsoluteUrl(req);
    const secret = await this.smsConfig.getWebhookSecret(tenantId);
    const verified =
      secret && signature ? this.verifier.verifyTwilio(url, body, signature, secret) : false;

    const providerEventId = body['MessageSid'] ?? '';
    const eventType = body['MessageStatus'] ?? 'unknown';
    await this.recordWebhookEvent({
      tenantId,
      channel: 'sms',
      providerEventId,
      eventType,
      payload: body,
      signatureVerified: verified,
    });
    this.metrics.recordWebhook(tenantId, 'sms', eventType, verified);

    if (!verified) {
      this.logger.warn(
        `Twilio SMS webhook signature failed for tenant ${tenantId} (sid ${providerEventId})`,
      );
      throw new UnauthorizedException(
        apiError('WEBHOOK_SIGNATURE_INVALID', 'Webhook signature verification failed'),
      );
    }

    if (!(await this.isOutboundEnabled(tenantId, 'Twilio SMS'))) {
      return { accepted: true };
    }

    await this.twilioHandler.handleSms(tenantId, body);
    return { accepted: true };
  }

  // ─── WhatsApp (Twilio) ──────────────────────────────────────────────────
  // POST /v1/webhooks/communications/whatsapp/:tenantId
  @Post('whatsapp/:tenantId')
  @HttpCode(HttpStatus.OK)
  async receiveWhatsApp(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-twilio-signature') signature: string | undefined,
    @Body() body: Record<string, string>,
  ): Promise<{ accepted: true }> {
    const url = buildAbsoluteUrl(req);
    const secret = await this.whatsappConfig.getWebhookSecret(tenantId);
    const verified =
      secret && signature ? this.verifier.verifyTwilio(url, body, signature, secret) : false;

    const providerEventId = body['MessageSid'] ?? '';
    const eventType = body['MessageStatus'] ?? (body['From'] ? 'inbound' : 'unknown');
    await this.recordWebhookEvent({
      tenantId,
      channel: 'whatsapp',
      providerEventId,
      eventType,
      payload: body,
      signatureVerified: verified,
    });
    this.metrics.recordWebhook(tenantId, 'whatsapp', eventType, verified);

    if (!verified) {
      this.logger.warn(
        `Twilio WhatsApp webhook signature failed for tenant ${tenantId} (sid ${providerEventId})`,
      );
      throw new UnauthorizedException(
        apiError('WEBHOOK_SIGNATURE_INVALID', 'Webhook signature verification failed'),
      );
    }

    if (!(await this.isOutboundEnabled(tenantId, 'Twilio WhatsApp'))) {
      return { accepted: true };
    }

    await this.twilioHandler.handleWhatsApp(tenantId, body);
    return { accepted: true };
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async recordWebhookEvent(args: {
    tenantId: string;
    channel: 'email' | 'sms' | 'whatsapp';
    providerEventId: string;
    eventType: string;
    payload: object;
    signatureVerified: boolean;
  }): Promise<void> {
    const rls = createRlsClient(this.prisma, { tenant_id: args.tenantId });
    try {
      await rls.$transaction(async (tx) => {
        const txdb = tx as unknown as PrismaService;
        const fallbackEventId =
          args.providerEventId || `${args.channel}:unknown:${Date.now()}:${Math.random()}`;
        await txdb.notificationWebhookEvent.upsert({
          where: {
            tenant_id_provider_event_id: {
              tenant_id: args.tenantId,
              provider_event_id: fallbackEventId,
            },
          },
          create: {
            tenant_id: args.tenantId,
            channel: args.channel,
            provider_event_id: fallbackEventId,
            event_type: args.eventType,
            payload_json: args.payload as never,
            signature_verified: args.signatureVerified,
          },
          update: { event_type: args.eventType },
        });
      });
    } catch (err) {
      // Logging the event must never crash the webhook receiver — the
      // provider will retry on 5xx and we'd rather process than spam
      // failures. We surface the error to logs so operators can debug.
      const message = err instanceof Error ? err.message : 'unknown';
      this.logger.error(`Failed to record webhook event for tenant ${args.tenantId}: ${message}`);
    }
  }

  private async isOutboundEnabled(tenantId: string, provider: string): Promise<boolean> {
    const enabled = await this.tenantModuleService.isEnabled(tenantId, 'communications_outbound');
    if (!enabled) {
      this.logger.warn(
        `${provider} webhook accepted but skipped for tenant ${tenantId} because communications_outbound is disabled`,
      );
    }
    return enabled;
  }
}

// ─── Pure helpers (exported for spec coverage) ──────────────────────────

export function lowercaseHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = v;
  return out;
}

export function buildAbsoluteUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) ?? req.protocol ?? 'https';
  const host = (req.headers['x-forwarded-host'] as string) ?? req.headers.host ?? 'localhost';
  return `${proto}://${host}${req.originalUrl}`;
}

export function extractResendEventId(body: unknown, headers: Record<string, string>): string {
  const svixId = headers['svix-id'];
  if (svixId) return `svix:${svixId}`;
  const msgId =
    body && typeof body === 'object' && 'data' in body
      ? ((body as { data?: { message_id?: string } }).data?.message_id ?? '')
      : '';
  return msgId ? `resend:${msgId}` : `resend:unknown:${Date.now()}`;
}

export function extractResendEventType(body: unknown): string {
  if (body && typeof body === 'object' && 'type' in body) {
    return String((body as { type: unknown }).type);
  }
  return 'unknown';
}
