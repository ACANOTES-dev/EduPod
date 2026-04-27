# Implementation 06 — Webhooks + signature verification + suppression list

> **Wave:** 3
> **Depends on:** 01 (schema for `notification_webhook_events`, `notification_suppression_list`, status enum extension), 03 (config services with `getDecryptedConfig` / new `getWebhookSecret` accessor)
> **Restart targets:** API + worker (worker only because the cleanup cron is registered there; webhook ingest is API-only)
> **Worktree only:** NO CI. NO production. Local dev server testing.

---

## Goal

Build the webhook ingestion path that closes the loop between dispatched notifications and the providers' delivery / bounce / complaint reality, and the suppression list that prevents the platform from re-sending to addresses that are already known-bad. Three surfaces:

1. **Per-tenant webhook receiver** — three new endpoints (`/v1/webhooks/communications/{email,sms,whatsapp}/:tenantId`) that ingest Resend (email) and Twilio (SMS + WhatsApp) callbacks, verify the signature with the **tenant's** webhook secret (NOT a platform-shared secret), persist every event to `notification_webhook_events`, and update the matching `notification.status`. The current platform-level `webhook.controller.ts` (Resend/Twilio under `/v1/webhooks/{resend,twilio}`) stays in place during the rebuild — Impl 14 retires it. This impl introduces the per-tenant equivalent and routes new traffic through it.

2. **Suppression list** — `NotificationSuppressionList` table is consulted on every outbound dispatch (Redis-cached, 5-minute TTL). Hard bounces and spam complaints add permanent rows. Soft bounces auto-expire after 30 days; the threshold rule (3+ in 30 days) promotes a soft-bounce recipient to suppressed. Suppressed sends are skipped with `failure_reason='suppressed:{reason}'`; the fallback chain still tries the next channel.

3. **Daily cleanup cron** — `comms:suppression-list-cleanup` (03:00 UTC) deletes rows whose `expires_at` is in the past. Hard bounces / complaints / manual / unsubscribe rows have `expires_at = NULL` and are never cleaned automatically.

The whole impl is a pure addition. The existing dispatch service is touched only to insert the suppression check — every other code path is untouched. The pre-rebuild platform-shared `WebhookController` continues to function while this work lands; Impl 14 deletes it.

### Key invariants (ALL of these must hold after this impl ships)

- **Every webhook is logged before signature verification.** A `notification_webhook_events` row is written even on signature failure (with `signature_verified=false`). Forged events leave an audit trail.
- **Signature verification uses constant-time comparison.** `crypto.timingSafeEqual` only — never `===` or `Buffer.compare`. No timing attacks.
- **Suppression list checks happen BEFORE provider dispatch.** No suppressed recipient is ever sent to.
- **Suppression is per-tenant per-channel per-recipient.** Tenant A's suppression cannot bleed into Tenant B. The unique constraint enforces it.
- **Hard bounces and complaints are permanent until manual removal.** `expires_at = NULL`.
- **Soft bounces auto-expire after 30 days.** `expires_at = created_at + 30 days`.
- **Replay protection.** Both verifiers reject timestamps older than 5 minutes.
- **Wrong-tenant rejection.** A signature valid for Tenant A's secret cannot pass verification when the URL says Tenant B — the verifier loads only `:tenantId`'s secret, so a Tenant-A-signed payload posted to `/email/:tenantBId` MUST fail with `signature_verified=false`.

---

## What to change

### 1. `apps/api/src/modules/communications/webhooks/webhook-signature-verifier.service.ts` — NEW

Pure utility. No DI dependencies. Two methods (`verifyResend`, `verifyTwilio`) plus internal helpers. Both use `crypto.timingSafeEqual` for the final comparison; both reject silently (return `false`) on missing inputs and never throw. The existing platform-shared verifier in `apps/api/src/modules/communications/webhook.controller.ts` is the working reference for both algorithms — this service is the canonicalised, reusable form.

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';

const REPLAY_WINDOW_SECONDS = 300; // 5 minutes — Svix's default tolerance

/**
 * Channel-agnostic webhook signature verification.
 *
 * Both `verifyResend` and `verifyTwilio` share three rules:
 *   1. Missing inputs → return false. Never throw on missing inputs.
 *      A forged or malformed request must be silently rejected, not crash
 *      the controller.
 *   2. Timestamps older than 5 minutes → return false. Replay protection.
 *      Twilio does not include a timestamp by default; we add `ts=` to the
 *      request URL when registering callbacks (Impl 13 sets that up).
 *   3. Final comparison is `timingSafeEqual`. Never `===`. Never
 *      `Buffer.compare`. Constant-time only.
 */
@Injectable()
export class WebhookSignatureVerifierService {
  private readonly logger = new Logger(WebhookSignatureVerifierService.name);

  // ─── Resend (Svix-Signature) ────────────────────────────────────────────
  //
  // Svix sends three headers:
  //   - `svix-id`        — unique event id
  //   - `svix-timestamp` — unix seconds
  //   - `svix-signature` — space-separated list of "v1,<base64>" entries
  //
  // The signed payload is `{svix-id}.{svix-timestamp}.{raw-body}` and the
  // expected signature is HMAC-SHA256(payload, secret) → base64.
  //
  // Resend signing-secrets are usually prefixed with `whsec_` and the body
  // after the prefix is base64-encoded. We strip the prefix before decoding.
  verifyResend(
    rawBody: Buffer,
    headers: Record<string, string | undefined>,
    secret: string,
  ): boolean {
    const svixId = headers['svix-id'];
    const svixTs = headers['svix-timestamp'];
    const svixSig = headers['svix-signature'];

    if (!svixId || !svixTs || !svixSig || !secret || !rawBody) return false;

    // Replay protection.
    const ts = Number.parseInt(svixTs, 10);
    if (!Number.isFinite(ts)) return false;
    const driftSeconds = Math.abs(Date.now() / 1000 - ts);
    if (driftSeconds > REPLAY_WINDOW_SECONDS) {
      this.logger.warn(`Resend webhook timestamp drift ${driftSeconds}s — rejecting`);
      return false;
    }

    const secretBytes = Buffer.from(
      secret.startsWith('whsec_') ? secret.slice(6) : secret,
      'base64',
    );
    if (secretBytes.length === 0) return false;

    const payload = `${svixId}.${svixTs}.${rawBody.toString('utf8')}`;
    const expected = createHmac('sha256', secretBytes).update(payload).digest('base64');

    // Svix may send multiple signatures (key rotation); any one valid wins.
    const signatures = svixSig.split(' ').map((s) => s.replace(/^v1,/, ''));
    return signatures.some((sig) => safeEquals(sig, expected));
  }

  // ─── Twilio (X-Twilio-Signature) ────────────────────────────────────────
  //
  // Twilio's algorithm: full URL (with query params if any) concatenated
  // with sorted form params (key + value, no separators), HMAC-SHA1 against
  // the auth token, base64.
  //
  // We add `?ts=<unix-seconds>` to our callback URLs at registration time
  // (Impl 13 does this) so we can enforce replay protection. Without that,
  // Twilio gives no timestamp to check against. If `ts` is absent we skip
  // replay protection but still verify the signature — the deployed URL
  // pattern always carries it post-Impl 13.
  verifyTwilio(
    url: string,
    params: Record<string, string>,
    signature: string,
    authToken: string,
  ): boolean {
    if (!url || !signature || !authToken || !params) return false;

    // Replay protection — only enforced when `ts` is in the query string.
    const tsMatch = url.match(/[?&]ts=(\d+)(?:&|$)/);
    if (tsMatch) {
      const ts = Number.parseInt(tsMatch[1], 10);
      if (!Number.isFinite(ts)) return false;
      const driftSeconds = Math.abs(Date.now() / 1000 - ts);
      if (driftSeconds > REPLAY_WINDOW_SECONDS) {
        this.logger.warn(`Twilio webhook timestamp drift ${driftSeconds}s — rejecting`);
        return false;
      }
    }

    const sortedKeys = Object.keys(params).sort();
    const dataStr = url + sortedKeys.map((k) => k + (params[k] ?? '')).join('');
    const expected = createHmac('sha1', authToken).update(dataStr).digest('base64');

    return safeEquals(signature, expected);
  }
}

/**
 * Constant-time string comparison via `timingSafeEqual`. Returns false on
 * any input that fails to convert to equal-length buffers.
 *
 * Exported for direct testing — the verifier methods compose this.
 */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  try {
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
```

### 2. `apps/api/src/modules/communications/webhooks/communications-webhooks.controller.ts` — NEW

Three POST endpoints, no auth guards, request body kept as raw `Buffer` for signature verification. The controller is intentionally "fat" by NestJS standards — signature verification, event logging, and dispatch to the channel handler all live here so the audit-log invariant (every webhook → row written) is provably co-located with the verification gate.

```typescript
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
import { SkipThrottle } from '@nestjs/throttler';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

import { apiError } from '../../../common/errors/api-error';
import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailConfigService } from '../../configuration/email-config.service';
import { SmsConfigService } from '../../configuration/sms-config.service';
import { WhatsAppConfigService } from '../../configuration/whatsapp-config.service';

import { ResendWebhookHandlerService } from './resend-webhook-handler.service';
import { TwilioWebhookHandlerService } from './twilio-webhook-handler.service';
import { WebhookSignatureVerifierService } from './webhook-signature-verifier.service';

/**
 * `/v1/webhooks/communications/*` — per-tenant webhook receivers.
 *
 * No auth guards: webhooks come from external providers. Authentication
 * is the per-tenant signature, verified inline.
 *
 * Rate limiting note: this controller is `@SkipThrottle()` because the
 * provider-side rate is upstream of us. If a tenant's secret leaks and
 * an attacker replays events, the signature verification + replay
 * timestamp check (5-min window) limits damage. A future enhancement
 * could add a per-tenant rate limit on webhook ingest (e.g. 100/sec
 * per tenant) using the existing Redis sliding-window primitive that
 * `notification-rate-limit.service.ts` uses; not in scope for V1.
 *
 * The platform-shared `/v1/webhooks/{resend,twilio}` controller in
 * `webhook.controller.ts` continues to function during the rebuild.
 * Impl 14 removes it after Impl 13 reconfigures Resend/Twilio to point
 * at the new per-tenant URLs for all five test tenants.
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

    // 1. Look up the tenant's webhook_secret. Note: `getWebhookSecret`
    //    returns ONLY the webhook secret (decrypted) — never the full API
    //    key. This is a deliberately narrower surface than
    //    `getDecryptedConfig` and reduces blast radius if this controller
    //    is somehow compromised.
    const secret = await this.emailConfig.getWebhookSecret(tenantId);

    // 2. Verify the signature using the tenant's secret. If the secret is
    //    missing, treat verification as failed.
    const verified = secret ? this.verifier.verifyResend(rawBody, headers, secret) : false;

    // 3. Log the event (verified or not) BEFORE doing anything else with
    //    the payload. Even forged events get an audit row.
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

    // 4. Reject unverified events.
    if (!verified) {
      this.logger.warn(
        `Resend webhook signature failed for tenant ${tenantId} (event ${providerEventId})`,
      );
      throw new UnauthorizedException(
        apiError('WEBHOOK_SIGNATURE_INVALID', 'Webhook signature verification failed'),
      );
    }

    // 5. Hand off to the channel-specific handler — RLS context is set
    //    inside the handler so every DB op the handler performs is
    //    tenant-isolated.
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

    // For Twilio, the "secret" used for signing is the auth token. Some
    // tenants set a separate `webhook_secret` (which then becomes the
    // signing key for Twilio status callbacks via Twilio's "Edge"
    // configuration). Either way the SmsConfigService.getWebhookSecret
    // resolves the right value for verification.
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

    if (!verified) {
      this.logger.warn(
        `Twilio SMS webhook signature failed for tenant ${tenantId} (sid ${providerEventId})`,
      );
      throw new UnauthorizedException(
        apiError('WEBHOOK_SIGNATURE_INVALID', 'Webhook signature verification failed'),
      );
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

    if (!verified) {
      this.logger.warn(
        `Twilio WhatsApp webhook signature failed for tenant ${tenantId} (sid ${providerEventId})`,
      );
      throw new UnauthorizedException(
        apiError('WEBHOOK_SIGNATURE_INVALID', 'Webhook signature verification failed'),
      );
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
        await tx.notificationWebhookEvent.upsert({
          where: {
            tenant_id_provider_event_id: {
              tenant_id: args.tenantId,
              provider_event_id: args.providerEventId || `${args.channel}:unknown:${Date.now()}`,
            },
          },
          create: {
            tenant_id: args.tenantId,
            channel: args.channel,
            provider_event_id: args.providerEventId || `${args.channel}:unknown:${Date.now()}`,
            event_type: args.eventType,
            payload_json: args.payload as never,
            signature_verified: args.signatureVerified,
          },
          update: {
            // Idempotency — if the same provider_event_id arrives twice we
            // record the second arrival but leave the first row's
            // signature_verified intact.
            event_type: args.eventType,
          },
        });
      });
    } catch (err) {
      // Logging the event must never crash the webhook receiver — the
      // provider will retry on 5xx and we'd rather process than spam
      // failures. We still surface the error to Sentry via the logger.
      const message = err instanceof Error ? err.message : 'unknown';
      this.logger.error(`Failed to record webhook event for tenant ${args.tenantId}: ${message}`);
    }
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
  // Prefer the Svix message id (unique per event), fall back to the inner
  // data.message_id (notification correlation), fall back to a synthetic.
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
```

### 3. `apps/api/src/modules/communications/webhooks/resend-webhook-handler.service.ts` — NEW

Channel-specific handler. Knows the Resend event shape, maps it to `notification.status` updates, and adds suppression rows for hard bounces and complaints.

```typescript
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

/**
 * Resend → notification.status mapping:
 *   email.sent              → 'sent'
 *   email.delivered         → 'delivered'
 *   email.bounced (hard)    → 'bounced' + suppression(hard_bounce, permanent)
 *   email.bounced (soft)    → 'bounced'; if 3+ in last 30 days, suppression(soft_bounce_threshold, expires_at = +30d)
 *   email.complained        → 'complained' + suppression(complaint, permanent)
 *   email.delivery_delayed  → no status change (logged only)
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

    // Find the matching notification within the tenant's RLS context.
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const notification = await rls.$transaction(async (tx) => {
      return tx.notification.findFirst({
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
        break;

      case 'email.delivered':
        await this.updateStatus(tenantId, notification.id, 'delivered', {
          delivered_at: new Date(),
        });
        break;

      case 'email.bounced': {
        const bounceType = event.data?.bounce?.type ?? 'soft';
        await this.updateStatus(tenantId, notification.id, 'bounced', {
          failure_reason:
            `Resend bounce (${bounceType}): ${event.data?.bounce?.message ?? ''}`.trim(),
        });

        if (!recipientEmail) break;

        if (bounceType === 'hard') {
          await this.suppressionService.addSuppression({
            tenantId,
            channel: 'email',
            recipient: recipientEmail,
            reason: 'hard_bounce',
            source: 'webhook:resend.bounce',
            notificationId: notification.id,
            expiresAt: null, // permanent
          });
        } else {
          // Soft bounce — count past 30 days. 3+ → suppress for 30 days.
          const recent = await this.countRecentSoftBounces(tenantId, recipientEmail);
          if (recent + 1 >= SOFT_BOUNCE_THRESHOLD) {
            const expiresAt = new Date(Date.now() + SOFT_BOUNCE_LOOKBACK_DAYS * 86400_000);
            await this.suppressionService.addSuppression({
              tenantId,
              channel: 'email',
              recipient: recipientEmail,
              reason: 'soft_bounce_threshold',
              source: 'webhook:resend.bounce',
              notificationId: notification.id,
              expiresAt,
            });
          }
        }
        break;
      }

      case 'email.complained': {
        await this.updateStatus(tenantId, notification.id, 'complained', {
          failure_reason: 'Resend spam complaint',
        });
        if (recipientEmail) {
          await this.suppressionService.addSuppression({
            tenantId,
            channel: 'email',
            recipient: recipientEmail,
            reason: 'complaint',
            source: 'webhook:resend.complained',
            notificationId: notification.id,
            expiresAt: null, // permanent
          });
        }
        break;
      }

      case 'email.delivery_delayed':
        this.logger.log(
          `Resend delivery_delayed for notification ${notification.id} (tenant ${tenantId})`,
        );
        break;

      default:
        this.logger.log(`Unhandled Resend event type: ${event.type}`);
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private async updateStatus(
    tenantId: string,
    notificationId: string,
    status: 'sent' | 'delivered' | 'bounced' | 'complained',
    extra: Partial<{
      sent_at: Date;
      delivered_at: Date;
      failure_reason: string;
    }>,
  ): Promise<void> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rls.$transaction(async (tx) => {
      await tx.notification.update({
        where: { id: notificationId },
        data: { status: status as never, ...extra },
      });
    });
  }

  /**
   * Count soft-bounce webhook events for this recipient in the last 30 days.
   * We read from `notification_webhook_events` (signature_verified=true,
   * channel='email', event_type='email.bounced', payload_json contains
   * bounce.type=soft, payload_json.data.to includes the recipient).
   *
   * Postgres JSONB containment makes this efficient enough for the volumes
   * we expect; if it gets hot we add a partial index in a follow-up.
   */
  private async countRecentSoftBounces(tenantId: string, recipient: string): Promise<number> {
    const since = new Date(Date.now() - SOFT_BOUNCE_LOOKBACK_DAYS * 86400_000);
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rls.$transaction(async (tx) => {
      return tx.notificationWebhookEvent.count({
        where: {
          tenant_id: tenantId,
          channel: 'email',
          event_type: 'email.bounced',
          signature_verified: true,
          received_at: { gte: since },
          payload_json: {
            path: ['data', 'bounce', 'type'],
            equals: 'soft',
          } as never,
          // Recipient match is not feasible via path-equals on an array;
          // we fall back to a `string_contains` on the JSON-stringified
          // payload — fine for V1 volumes.
          AND: [
            {
              payload_json: {
                string_contains: recipient,
              } as never,
            },
          ],
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
```

### 4. `apps/api/src/modules/communications/webhooks/twilio-webhook-handler.service.ts` — NEW

Twilio handler covers SMS + WhatsApp. The two flows share `MessageStatus` semantics; WhatsApp also handles inbound messages (no `MessageStatus`, has `From`/`To` flipped).

```typescript
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

  // ─── SMS ────────────────────────────────────────────────────────────────

  async handleSms(tenantId: string, params: Record<string, string>): Promise<void> {
    await this.handleStatusCallback(tenantId, params, 'sms');
  }

  // ─── WhatsApp ───────────────────────────────────────────────────────────

  async handleWhatsApp(tenantId: string, params: Record<string, string>): Promise<void> {
    // WhatsApp inbound has `From` set to the recipient and no `MessageStatus`.
    const isInbound = !params['MessageStatus'] && Boolean(params['From']);
    if (isInbound) {
      // Service-window updates are owned by Impl 08. Until that lands we
      // leave a stub note so the integration point is named and testable.
      // The webhook infrastructure recognises inbound messages and routes
      // them to the (eventually) correct destination; right now it logs
      // and returns. Impl 08 will replace the body of this branch with
      // a call to WhatsAppServiceWindowService.updateLastInbound().
      this.logger.log(
        `WhatsApp inbound for tenant ${tenantId} from ${params['From']} — service-window update deferred to Impl 08`,
      );
      return;
    }

    await this.handleStatusCallback(tenantId, params, 'whatsapp');
  }

  // ─── Shared status callback ─────────────────────────────────────────────

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
      return tx.notification.findFirst({
        where: { tenant_id: tenantId, provider_message_id: messageSid, channel: channel as never },
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
        // Twilio's initial state — we already have the row in `queued`
        // / `claimed` / `sent` so this is a no-op.
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
      case 'undelivered': {
        await this.updateStatus(tenantId, notification.id, 'failed', {
          failure_reason: `Twilio ${status}${
            Number.isFinite(errorCode) ? ` (code ${errorCode})` : ''
          }`,
        });

        // Hard-bounce error codes → permanent suppression.
        if (recipient && Number.isFinite(errorCode) && HARD_BOUNCE_ERROR_CODES.has(errorCode)) {
          await this.suppressionService.addSuppression({
            tenantId,
            channel,
            recipient,
            reason: 'hard_bounce',
            source: `webhook:twilio.${status}`,
            notificationId: notification.id,
            expiresAt: null,
          });
        }
        return;
      }
      default:
        this.logger.log(`Unhandled Twilio status: ${status}`);
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
      await tx.notification.update({
        where: { id: notificationId },
        data: { status: status as never, ...extra },
      });
    });
  }
}

export function stripWhatsAppPrefix(s: string): string {
  return s.replace(/^whatsapp:/, '');
}
```

### 5. `apps/api/src/modules/communications/suppression/suppression-list.service.ts` — NEW

Single source of truth for the suppression list. Redis-cached `isSuppressed` (5-minute TTL) for the hot path; explicit cache invalidation on mutations.

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type Redis } from 'ioredis';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';

const CACHE_TTL_SECONDS = 5 * 60;

export type SuppressionChannel = 'email' | 'sms' | 'whatsapp';

export type SuppressionReason =
  | 'hard_bounce'
  | 'soft_bounce_threshold'
  | 'complaint'
  | 'manual'
  | 'unsubscribe';

interface AddSuppressionArgs {
  tenantId: string;
  channel: SuppressionChannel;
  recipient: string;
  reason: SuppressionReason;
  source: string;
  notificationId?: string | null;
  expiresAt?: Date | null;
}

interface ListSuppressionsArgs {
  tenantId: string;
  channel?: SuppressionChannel;
  reason?: SuppressionReason;
  page?: number;
  pageSize?: number;
}

interface SuppressionRow {
  id: string;
  channel: SuppressionChannel;
  recipient_address: string;
  reason: SuppressionReason;
  source: string | null;
  notification_id: string | null;
  expires_at: string | null;
  created_at: string;
}

@Injectable()
export class SuppressionListService {
  private readonly logger = new Logger(SuppressionListService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ─── Add ────────────────────────────────────────────────────────────────

  async addSuppression(args: AddSuppressionArgs): Promise<void> {
    const rls = createRlsClient(this.prisma, { tenant_id: args.tenantId });
    await rls.$transaction(async (tx) => {
      // Idempotent — the `(tenant_id, channel, recipient_address)` unique
      // constraint guards against duplicates. We upsert so that a newer
      // event with a stronger reason (e.g. complaint after a soft bounce)
      // can take over.
      await tx.notificationSuppressionList.upsert({
        where: {
          uq_suppression_tenant_channel_recipient: {
            tenant_id: args.tenantId,
            channel: args.channel as never,
            recipient_address: args.recipient,
          },
        } as never,
        create: {
          tenant_id: args.tenantId,
          channel: args.channel as never,
          recipient_address: args.recipient,
          reason: args.reason as never,
          source: args.source,
          notification_id: args.notificationId ?? null,
          expires_at: args.expiresAt ?? null,
        },
        update: {
          reason: args.reason as never,
          source: args.source,
          notification_id: args.notificationId ?? null,
          expires_at: args.expiresAt ?? null,
        },
      });
    });

    // Invalidate the cached miss-result so the next dispatch sees the
    // suppression row immediately.
    await this.invalidateCache(args.tenantId, args.channel, args.recipient);

    this.logger.log(
      `Suppression added: tenant=${args.tenantId} channel=${args.channel} recipient=${maskRecipient(
        args.recipient,
      )} reason=${args.reason}`,
    );
  }

  // ─── Check ──────────────────────────────────────────────────────────────

  /**
   * Returns true if the recipient is currently suppressed for this channel.
   * Uses Redis cache (5-min TTL). On cache miss, reads from DB and
   * populates cache. Cache invalidation happens on add/remove.
   *
   * The cache stores `'1'` for suppressed and `'0'` for not-suppressed so
   * we can distinguish "not in cache" from "cached negative".
   */
  async isSuppressed(
    tenantId: string,
    channel: SuppressionChannel,
    recipient: string,
  ): Promise<boolean> {
    const key = this.cacheKey(tenantId, channel, recipient);
    const cached = await this.redis.get(key);
    if (cached === '1') return true;
    if (cached === '0') return false;

    // Cache miss — load from DB.
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const row = await rls.$transaction(async (tx) => {
      return tx.notificationSuppressionList.findFirst({
        where: {
          tenant_id: tenantId,
          channel: channel as never,
          recipient_address: recipient,
          OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
        },
        select: { id: true, reason: true },
      });
    });

    const suppressed = Boolean(row);
    await this.redis.set(key, suppressed ? '1' : '0', 'EX', CACHE_TTL_SECONDS);
    return suppressed;
  }

  /**
   * Returns the suppression reason if the recipient is suppressed, else
   * null. Used by the dispatch service to populate
   * `failure_reason='suppressed:{reason}'`. Bypasses the boolean cache to
   * keep the surface area small — dispatch hot path uses `isSuppressed`,
   * `getSuppressionReason` is only called once we know we'll skip.
   */
  async getSuppressionReason(
    tenantId: string,
    channel: SuppressionChannel,
    recipient: string,
  ): Promise<SuppressionReason | null> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const row = await rls.$transaction(async (tx) => {
      return tx.notificationSuppressionList.findFirst({
        where: {
          tenant_id: tenantId,
          channel: channel as never,
          recipient_address: recipient,
          OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
        },
        select: { reason: true },
      });
    });
    return (row?.reason as SuppressionReason | undefined) ?? null;
  }

  // ─── Remove (admin) ─────────────────────────────────────────────────────

  async removeSuppression(
    tenantId: string,
    channel: SuppressionChannel,
    recipient: string,
  ): Promise<void> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rls.$transaction(async (tx) => {
      await tx.notificationSuppressionList.deleteMany({
        where: {
          tenant_id: tenantId,
          channel: channel as never,
          recipient_address: recipient,
        },
      });
    });
    await this.invalidateCache(tenantId, channel, recipient);
    this.logger.log(
      `Suppression removed: tenant=${tenantId} channel=${channel} recipient=${maskRecipient(
        recipient,
      )}`,
    );
  }

  // ─── List (diagnostics) ─────────────────────────────────────────────────

  async listSuppressions(args: ListSuppressionsArgs): Promise<{
    data: SuppressionRow[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const page = args.page ?? 1;
    const pageSize = Math.min(args.pageSize ?? 20, 100);
    const where = {
      tenant_id: args.tenantId,
      ...(args.channel ? { channel: args.channel as never } : {}),
      ...(args.reason ? { reason: args.reason as never } : {}),
    };

    const rls = createRlsClient(this.prisma, { tenant_id: args.tenantId });
    const [rows, total] = await rls.$transaction(async (tx) => {
      return Promise.all([
        tx.notificationSuppressionList.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.notificationSuppressionList.count({ where }),
      ]);
    });

    return {
      data: rows.map((r) => ({
        id: r.id,
        channel: r.channel as SuppressionChannel,
        recipient_address: r.recipient_address,
        reason: r.reason as SuppressionReason,
        source: r.source,
        notification_id: r.notification_id,
        expires_at: r.expires_at?.toISOString() ?? null,
        created_at: r.created_at.toISOString(),
      })),
      meta: { page, pageSize, total },
    };
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private cacheKey(tenantId: string, channel: SuppressionChannel, recipient: string): string {
    return `suppression:${tenantId}:${channel}:${recipient.toLowerCase()}`;
  }

  private async invalidateCache(
    tenantId: string,
    channel: SuppressionChannel,
    recipient: string,
  ): Promise<void> {
    await this.redis.del(this.cacheKey(tenantId, channel, recipient));
  }
}

function maskRecipient(s: string): string {
  if (s.includes('@')) {
    const [local, domain] = s.split('@');
    return `${local.slice(0, 2)}***@${domain}`;
  }
  return `${s.slice(0, 4)}***${s.slice(-2)}`;
}
```

### 6. `apps/api/src/modules/communications/notification-dispatch.service.ts` — UPDATE

Insert the suppression check before each provider call. The fallback chain logic stays unchanged — `failed:suppressed:{reason}` rows still flow into the next channel via the existing `createFallbackNotification` path.

```typescript
// In the constructor:
constructor(
  // ...existing,
  private readonly suppressionService: SuppressionListService,
) {}

// In dispatchEmail() — immediately before the rate-limit check:

const recipientEmail = await this.resolveRecipientContact(
  notification.tenant_id,
  notification.recipient_user_id,
  'email',
);
if (recipientEmail && (await this.suppressionService.isSuppressed(notification.tenant_id, 'email', recipientEmail))) {
  const reason = await this.suppressionService.getSuppressionReason(
    notification.tenant_id,
    'email',
    recipientEmail,
  );
  await this.markFailed(notification, `suppressed:${reason ?? 'unknown'}`);
  await this.createFallbackNotification(notification, 'in_app');
  return;
}

// Same pattern in dispatchSms() and dispatchWhatsApp() with channel='sms'
// / 'whatsapp' and recipient = the resolved phone number. WhatsApp uses
// the `whatsapp:` prefix-stripped form so suppression keying matches the
// number used by the webhook handler.
```

A short helper consolidates the three call sites:

```typescript
/**
 * Returns true and side-effects the notification → 'failed:suppressed' if
 * the recipient is on the suppression list. Caller continues with the
 * fallback chain. Returns false if the recipient is not suppressed.
 */
private async skipIfSuppressed(
  notification: NotificationWithRecipient,
  channel: 'email' | 'sms' | 'whatsapp',
  recipient: string | null,
): Promise<boolean> {
  if (!recipient) return false;
  const suppressed = await this.suppressionService.isSuppressed(
    notification.tenant_id,
    channel,
    recipient,
  );
  if (!suppressed) return false;
  const reason = await this.suppressionService.getSuppressionReason(
    notification.tenant_id,
    channel,
    recipient,
  );
  await this.markFailed(notification, `suppressed:${reason ?? 'unknown'}`);
  await this.createFallbackNotification(notification, channel === 'email' ? 'in_app' : 'email');
  return true;
}
```

The fallback target after a suppressed email is `in_app` (per the existing chain). After a suppressed SMS or WhatsApp it falls through to `email` per `FALLBACK_CHAIN` — but the next dispatcher will run its own suppression check, so a fully-suppressed recipient eventually lands at `in_app` regardless.

### 7. Config services — `getWebhookSecret(tenantId)` accessor (Impl 03 surface, called from this impl)

The three credential services (`EmailConfigService`, `SmsConfigService`, `WhatsAppConfigService`) gain a narrow accessor:

```typescript
/**
 * Returns the decrypted webhook_secret for the tenant, or null if not
 * configured. Internal-only (no controller exposure). Decrypts ONLY the
 * webhook secret — never the API key. This is intentionally a smaller
 * surface than `getDecryptedConfig` so the webhook controller's blast
 * radius is limited.
 */
async getWebhookSecret(tenantId: string): Promise<string | null> {
  const row = await this.prisma.tenantEmailConfig.findUnique({
    where: { tenant_id: tenantId },
    select: {
      webhook_secret_encrypted: true,
      encryption_key_ref: true,
    },
  });
  if (!row?.webhook_secret_encrypted) return null;
  return this.encryption.decrypt(row.webhook_secret_encrypted, row.encryption_key_ref);
}
```

Same shape on `SmsConfigService` (reads `tenantSmsConfig`) and `WhatsAppConfigService` (reads `tenantWhatsAppConfig`). If Impl 03 has not exposed this method when this impl lands, add it as part of this impl's diff and note the cross-impl edit in §5 of the log per Rule 21.

### 8. `notification.status` enum extension — verify Impl 01 covers it

The architecture calls for `notification.status` to extend with `bounced` and `complained`. Impl 01 owns the schema migration. **Before starting this impl, grep `packages/prisma/schema.prisma` for the current `NotificationStatus` enum**:

```
enum NotificationStatus {
  queued
  claimed
  sent
  delivered
  failed
  read
  bounced       ← REQUIRED for this impl
  complained    ← REQUIRED for this impl
}
```

If `bounced` and `complained` are missing, the dependency is unmet — stop and update the log per Rule 2. Do NOT add a sibling migration in this impl. The `notification.status` enum is owned by Impl 01.

If Impl 01 already shipped without these values, file a 🛑 BLOCKED record and request Impl 01 be amended. Adding the values from a later impl creates a mid-wave migration that races with Impl 01's already-applied migration — too risky.

### 9. Cron — `apps/worker/src/processors/communications/suppression-list-cleanup.processor.ts` — NEW

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

export const SUPPRESSION_LIST_CLEANUP_JOB = 'comms:suppression-list-cleanup';

/**
 * Runs daily at 03:00 UTC. Cross-tenant — empty payload.
 * Hard-deletes notification_suppression_list rows where
 * expires_at IS NOT NULL AND expires_at < now().
 *
 * Permanent suppressions (hard_bounce, complaint, manual, unsubscribe)
 * have expires_at = NULL and are never deleted by this cron.
 *
 * Soft-bounce-threshold rows have expires_at = created_at + 30 days
 * and are cleaned up by this cron.
 */
@Injectable()
export class SuppressionListCleanupProcessor {
  private readonly logger = new Logger(SuppressionListCleanupProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async process(job: Job): Promise<void> {
    if (job.name !== SUPPRESSION_LIST_CLEANUP_JOB) return;

    // Cross-tenant — no RLS context. The cleanup is platform-level: we
    // run a single deleteMany scoped by expires_at, which by design
    // cannot leak across tenants because it touches every row equally.
    // Each row's tenant_id is preserved on disk; we're just removing
    // expired ones regardless of which tenant owns them.
    const removed = await this.prisma.notificationSuppressionList.deleteMany({
      where: {
        expires_at: { not: null, lt: new Date() } as never,
      },
    });

    this.logger.log(
      `${SUPPRESSION_LIST_CLEANUP_JOB} done — removed ${removed.count} expired suppression(s)`,
    );
  }
}
```

### 10. `apps/worker/src/cron/cron-scheduler.service.ts` — UPDATE

Register the cleanup cron alongside the existing notifications-queue jobs. Shared-file claim required (Rule 17): claim `cron-scheduler.service.ts` before starting if no other Wave 3 impl already holds it.

```typescript
// Add import (alphabetically with the existing communications imports):
import { SUPPRESSION_LIST_CLEANUP_JOB } from '../processors/communications/suppression-list-cleanup.processor';

// In onModuleInit() — alongside the other notifications cron registrations:
//
// ── comms:suppression-list-cleanup ──────────────────────────────────────
// Runs daily at 03:00 UTC. Cross-tenant — empty payload.
// Hard-deletes notification_suppression_list rows whose expires_at < now().
await this.notificationsQueue.add(
  SUPPRESSION_LIST_CLEANUP_JOB,
  {},
  {
    repeat: { pattern: '0 3 * * *' },
    jobId: `cron:${SUPPRESSION_LIST_CLEANUP_JOB}`,
    removeOnComplete: 10,
    removeOnFail: 50,
  },
);
this.logger.log(`Registered repeatable cron: ${SUPPRESSION_LIST_CLEANUP_JOB} (daily 03:00 UTC)`);
```

### 11. `apps/worker/src/processors/notifications/notifications-queue.processor.ts` — UPDATE

Route the new job to its handler:

```typescript
case SUPPRESSION_LIST_CLEANUP_JOB:
  await this.suppressionCleanup.process(job);
  return;

// Constructor injection:
private readonly suppressionCleanup: SuppressionListCleanupProcessor,
```

### 12. `apps/api/src/modules/communications/communications.module.ts` — UPDATE

Add the new providers and controller. Shared-file claim required (Rule 17).

```typescript
// imports — add (no new module imports needed; all deps already present):
//   ConfigurationModule already imported (Email/Sms/WhatsApp config services)
//   RedisModule already imported (SuppressionListService)
//   PrismaModule already imported

controllers: [
  // ...existing,
  CommunicationsWebhooksController,
],

providers: [
  // ...existing,
  WebhookSignatureVerifierService,
  ResendWebhookHandlerService,
  TwilioWebhookHandlerService,
  SuppressionListService,
],

exports: [
  // ...existing,
  SuppressionListService, // exported because the dispatch service needs it
],
```

### 13. `apps/worker/src/worker.module.ts` — UPDATE

Add the cleanup processor to the worker's providers and the routing case to whichever queue dispatcher owns the `notifications` queue. Shared-file claim required (Rule 17).

```typescript
// providers — add:
SuppressionListCleanupProcessor,
```

### 14. Module DI smoke test (Rule 6)

After updating `communications.module.ts` AND `worker.module.ts`, run the AppModule smoke from `CLAUDE.md`. A broken DI graph (e.g. forgetting to import `RedisModule` for `SuppressionListService`) is far cheaper to catch with the smoke than to debug after running tests.

---

## Tests

### `apps/api/src/modules/communications/webhooks/webhook-signature-verifier.service.spec.ts` — NEW

```typescript
import { createHmac } from 'crypto';

import { WebhookSignatureVerifierService, safeEquals } from './webhook-signature-verifier.service';

const VALID_SVIX_SECRET =
  'whsec_' + Buffer.from('test-secret-bytes-here-32-bytes-').toString('base64');

function signResend(secret: string, id: string, ts: string, body: string): string {
  const secretBytes = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const sig = createHmac('sha256', secretBytes).update(`${id}.${ts}.${body}`).digest('base64');
  return `v1,${sig}`;
}

function signTwilio(token: string, url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const dataStr = url + sortedKeys.map((k) => k + params[k]).join('');
  return createHmac('sha1', token).update(dataStr).digest('base64');
}

describe('WebhookSignatureVerifierService — verifyResend', () => {
  const svc = new WebhookSignatureVerifierService();
  const now = () => Math.floor(Date.now() / 1000).toString();

  it('returns true for a valid signature', () => {
    const body = JSON.stringify({ type: 'email.delivered', data: {} });
    const id = 'msg_123';
    const ts = now();
    const sig = signResend(VALID_SVIX_SECRET, id, ts, body);
    const ok = svc.verifyResend(
      Buffer.from(body),
      {
        'svix-id': id,
        'svix-timestamp': ts,
        'svix-signature': sig,
      },
      VALID_SVIX_SECRET,
    );
    expect(ok).toBe(true);
  });

  it('returns false when signature is wrong', () => {
    const body = JSON.stringify({ type: 'email.delivered' });
    const id = 'msg_123';
    const ts = now();
    const ok = svc.verifyResend(
      Buffer.from(body),
      {
        'svix-id': id,
        'svix-timestamp': ts,
        'svix-signature': 'v1,wrong_signature',
      },
      VALID_SVIX_SECRET,
    );
    expect(ok).toBe(false);
  });

  it('returns false when timestamp is older than 5 minutes', () => {
    const body = JSON.stringify({ type: 'email.delivered' });
    const id = 'msg_123';
    const ts = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 min ago
    const sig = signResend(VALID_SVIX_SECRET, id, ts, body);
    const ok = svc.verifyResend(
      Buffer.from(body),
      {
        'svix-id': id,
        'svix-timestamp': ts,
        'svix-signature': sig,
      },
      VALID_SVIX_SECRET,
    );
    expect(ok).toBe(false);
  });

  it('returns false when any header is missing', () => {
    const body = Buffer.from('{}');
    expect(svc.verifyResend(body, {}, VALID_SVIX_SECRET)).toBe(false);
    expect(svc.verifyResend(body, { 'svix-id': 'x' }, VALID_SVIX_SECRET)).toBe(false);
  });

  it('returns false when secret is empty', () => {
    const body = Buffer.from('{}');
    expect(
      svc.verifyResend(
        body,
        { 'svix-id': 'x', 'svix-timestamp': now(), 'svix-signature': 'v1,x' },
        '',
      ),
    ).toBe(false);
  });

  it('handles multi-signature header by accepting any valid one', () => {
    const body = '{"type":"email.delivered"}';
    const id = 'msg_123';
    const ts = now();
    const goodSig = signResend(VALID_SVIX_SECRET, id, ts, body);
    const headers = {
      'svix-id': id,
      'svix-timestamp': ts,
      'svix-signature': `v1,bogus_signature ${goodSig}`,
    };
    expect(svc.verifyResend(Buffer.from(body), headers, VALID_SVIX_SECRET)).toBe(true);
  });
});

describe('WebhookSignatureVerifierService — verifyTwilio', () => {
  const svc = new WebhookSignatureVerifierService();
  const TOKEN = 'test-twilio-auth-token';

  it('returns true for a valid signature', () => {
    const url = 'https://api.example.com/v1/webhooks/communications/sms/abc';
    const params = { MessageSid: 'SM1', MessageStatus: 'delivered' };
    const sig = signTwilio(TOKEN, url, params);
    expect(svc.verifyTwilio(url, params, sig, TOKEN)).toBe(true);
  });

  it('returns false for wrong signature', () => {
    const url = 'https://api.example.com/v1/webhooks/communications/sms/abc';
    const params = { MessageSid: 'SM1' };
    expect(svc.verifyTwilio(url, params, 'wrong', TOKEN)).toBe(false);
  });

  it('returns false on missing inputs', () => {
    expect(svc.verifyTwilio('', {}, 'sig', TOKEN)).toBe(false);
    expect(svc.verifyTwilio('url', {}, '', TOKEN)).toBe(false);
    expect(svc.verifyTwilio('url', {}, 'sig', '')).toBe(false);
  });

  it('rejects when ts query param is older than 5 minutes', () => {
    const oldTs = Math.floor(Date.now() / 1000) - 600;
    const url = `https://api.example.com/v1/webhooks/sms/abc?ts=${oldTs}`;
    const params = { MessageSid: 'SM1' };
    const sig = signTwilio(TOKEN, url, params);
    expect(svc.verifyTwilio(url, params, sig, TOKEN)).toBe(false);
  });

  it('accepts when ts query param is fresh', () => {
    const ts = Math.floor(Date.now() / 1000);
    const url = `https://api.example.com/v1/webhooks/sms/abc?ts=${ts}`;
    const params = { MessageSid: 'SM1' };
    const sig = signTwilio(TOKEN, url, params);
    expect(svc.verifyTwilio(url, params, sig, TOKEN)).toBe(true);
  });

  it('skips replay protection when ts is absent (logs only)', () => {
    const url = 'https://api.example.com/v1/webhooks/sms/abc';
    const params = { MessageSid: 'SM1' };
    const sig = signTwilio(TOKEN, url, params);
    expect(svc.verifyTwilio(url, params, sig, TOKEN)).toBe(true);
  });
});

describe('safeEquals', () => {
  it('returns true for identical strings', () => {
    expect(safeEquals('hello', 'hello')).toBe(true);
  });
  it('returns false for different strings', () => {
    expect(safeEquals('hello', 'world')).toBe(false);
  });
  it('returns false for different lengths', () => {
    expect(safeEquals('hello', 'hello!')).toBe(false);
  });
});
```

### `apps/api/src/modules/communications/webhooks/communications-webhooks.controller.spec.ts` — NEW

```typescript
import { UnauthorizedException } from '@nestjs/common';

import {
  CommunicationsWebhooksController,
  lowercaseHeaders,
} from './communications-webhooks.controller';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function build({
  emailSecret = 'whsec_validsecret',
  smsSecret = 'twiliotoken',
  verifyResult = true,
}: { emailSecret?: string | null; smsSecret?: string | null; verifyResult?: boolean } = {}) {
  const prismaTx = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      notificationWebhookEvent: { upsert: jest.fn() },
    }),
  );
  const prisma = {
    $transaction: prismaTx,
    notificationWebhookEvent: { upsert: jest.fn() },
  } as never;
  const emailConfig = { getWebhookSecret: jest.fn().mockResolvedValue(emailSecret) };
  const smsConfig = { getWebhookSecret: jest.fn().mockResolvedValue(smsSecret) };
  const whatsappConfig = { getWebhookSecret: jest.fn().mockResolvedValue(smsSecret) };
  const verifier = {
    verifyResend: jest.fn().mockReturnValue(verifyResult),
    verifyTwilio: jest.fn().mockReturnValue(verifyResult),
  };
  const resendHandler = { handle: jest.fn() };
  const twilioHandler = { handleSms: jest.fn(), handleWhatsApp: jest.fn() };
  const ctrl = new CommunicationsWebhooksController(
    prisma,
    emailConfig as never,
    smsConfig as never,
    whatsappConfig as never,
    verifier as never,
    resendHandler as never,
    twilioHandler as never,
  );
  return { ctrl, prisma, emailConfig, smsConfig, verifier, resendHandler, twilioHandler };
}

function fakeReq(rawBody = Buffer.from('{}')): never {
  return {
    rawBody,
    originalUrl: '/v1/webhooks/communications/email/abc',
    protocol: 'https',
    headers: { host: 'api.test', 'x-forwarded-proto': 'https' },
  } as never;
}

describe('CommunicationsWebhooksController — email', () => {
  it('writes a webhook event row before throwing on signature failure', async () => {
    const { ctrl, prisma, resendHandler } = build({ verifyResult: false });
    await expect(
      ctrl.receiveEmail(
        TENANT_A,
        fakeReq(Buffer.from('{"type":"email.bounced","data":{"message_id":"x"}}')),
        { 'svix-id': 'evt_1', 'svix-timestamp': '1', 'svix-signature': 'v1,bad' },
        { type: 'email.bounced', data: { message_id: 'x' } },
      ),
    ).rejects.toThrow(UnauthorizedException);
    // The transaction was opened to write the audit row, BEFORE the throw.
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(resendHandler.handle).not.toHaveBeenCalled();
  });

  it('passes through to handler when signature is valid', async () => {
    const { ctrl, resendHandler } = build({ verifyResult: true });
    const result = await ctrl.receiveEmail(
      TENANT_A,
      fakeReq(),
      { 'svix-id': 'evt_1', 'svix-timestamp': '1', 'svix-signature': 'v1,ok' },
      { type: 'email.delivered', data: { message_id: 'm1' } },
    );
    expect(result).toEqual({ accepted: true });
    expect(resendHandler.handle).toHaveBeenCalledWith(TENANT_A, expect.any(Object));
  });

  it('rejects when tenant has no webhook secret configured', async () => {
    const { ctrl } = build({ emailSecret: null, verifyResult: true });
    await expect(ctrl.receiveEmail(TENANT_A, fakeReq(), {}, {})).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('SECURITY: signature valid for tenant A is rejected when posted to tenant B URL', async () => {
    // The controller asks emailConfig.getWebhookSecret(tenantId-from-url),
    // which only returns the secret of THAT tenant. A signature signed
    // with tenant A's secret will not pass tenant B's verification.
    const { ctrl, emailConfig, verifier } = build({ verifyResult: false });
    emailConfig.getWebhookSecret.mockResolvedValueOnce('tenant-B-secret');
    await expect(
      ctrl.receiveEmail(
        TENANT_B,
        fakeReq(),
        { 'svix-id': 'x', 'svix-timestamp': '1', 'svix-signature': 'v1,signed-with-A-secret' },
        {},
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(verifier.verifyResend).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.any(Object),
      'tenant-B-secret',
    );
  });
});

describe('CommunicationsWebhooksController — sms / whatsapp', () => {
  it('routes a Twilio status callback for SMS', async () => {
    const { ctrl, twilioHandler } = build();
    await ctrl.receiveSms(TENANT_A, fakeReq(), 'sig', {
      MessageSid: 'SM1',
      MessageStatus: 'delivered',
    });
    expect(twilioHandler.handleSms).toHaveBeenCalledWith(
      TENANT_A,
      expect.objectContaining({ MessageSid: 'SM1' }),
    );
  });

  it('routes WhatsApp inbound to the WhatsApp handler', async () => {
    const { ctrl, twilioHandler } = build();
    await ctrl.receiveWhatsApp(TENANT_A, fakeReq(), 'sig', {
      MessageSid: 'SM1',
      From: 'whatsapp:+1234567890',
      To: 'whatsapp:+1987654321',
    });
    expect(twilioHandler.handleWhatsApp).toHaveBeenCalled();
  });

  it('rejects SMS when signature missing', async () => {
    const { ctrl } = build({ verifyResult: false });
    await expect(
      ctrl.receiveSms(TENANT_A, fakeReq(), undefined, { MessageSid: 'SM1' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});

describe('lowercaseHeaders', () => {
  it('lowercases all keys', () => {
    expect(lowercaseHeaders({ 'X-Foo': 'bar', BAZ: 'qux' })).toEqual({
      'x-foo': 'bar',
      baz: 'qux',
    });
  });
});
```

### `apps/api/src/modules/communications/webhooks/resend-webhook-handler.service.spec.ts` — NEW

```typescript
import { ResendWebhookHandlerService } from './resend-webhook-handler.service';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma) => ({
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function build({
  notification,
  recentSoftBounces = 0,
}: { notification?: unknown; recentSoftBounces?: number } = {}) {
  const prisma = {
    notification: {
      findFirst: jest.fn().mockResolvedValue(notification ?? null),
      update: jest.fn(),
    },
    notificationWebhookEvent: {
      count: jest.fn().mockResolvedValue(recentSoftBounces),
    },
  };
  const suppression = {
    addSuppression: jest.fn(),
  };
  const svc = new ResendWebhookHandlerService(prisma as never, suppression as never);
  return { svc, prisma, suppression };
}

const NOTIFICATION = {
  id: 'notif_1',
  tenant_id: TENANT_A,
  channel: 'email',
  provider_message_id: 'msg_1',
};

describe('ResendWebhookHandlerService', () => {
  it('email.sent → notification.status="sent"', async () => {
    const { svc, prisma } = build({ notification: NOTIFICATION });
    await svc.handle(TENANT_A, {
      type: 'email.sent',
      data: { message_id: 'msg_1', to: 'parent@x.com' },
    });
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent' }),
      }),
    );
  });

  it('email.delivered → notification.status="delivered"', async () => {
    const { svc, prisma } = build({ notification: NOTIFICATION });
    await svc.handle(TENANT_A, {
      type: 'email.delivered',
      data: { message_id: 'msg_1', to: 'p@x.com' },
    });
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'delivered', delivered_at: expect.any(Date) }),
      }),
    );
  });

  it('email.bounced (hard) → status=bounced + permanent suppression', async () => {
    const { svc, suppression } = build({ notification: NOTIFICATION });
    await svc.handle(TENANT_A, {
      type: 'email.bounced',
      data: {
        message_id: 'msg_1',
        to: 'parent@x.com',
        bounce: { type: 'hard', message: 'no such mailbox' },
      },
    });
    expect(suppression.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        channel: 'email',
        recipient: 'parent@x.com',
        reason: 'hard_bounce',
        expiresAt: null,
      }),
    );
  });

  it('email.bounced (soft, 1st) → status=bounced, NO suppression', async () => {
    const { svc, suppression } = build({ notification: NOTIFICATION, recentSoftBounces: 0 });
    await svc.handle(TENANT_A, {
      type: 'email.bounced',
      data: { message_id: 'msg_1', to: 'parent@x.com', bounce: { type: 'soft' } },
    });
    expect(suppression.addSuppression).not.toHaveBeenCalled();
  });

  it('email.bounced (soft, 3rd in 30d) → suppression with 30-day expiry', async () => {
    const { svc, suppression } = build({ notification: NOTIFICATION, recentSoftBounces: 2 });
    await svc.handle(TENANT_A, {
      type: 'email.bounced',
      data: { message_id: 'msg_1', to: 'parent@x.com', bounce: { type: 'soft' } },
    });
    expect(suppression.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'soft_bounce_threshold',
        expiresAt: expect.any(Date),
      }),
    );
    const call = suppression.addSuppression.mock.calls[0][0];
    const ageDays = (call.expiresAt.getTime() - Date.now()) / 86400_000;
    expect(ageDays).toBeCloseTo(30, 0);
  });

  it('email.complained → status=complained + permanent suppression', async () => {
    const { svc, suppression } = build({ notification: NOTIFICATION });
    await svc.handle(TENANT_A, {
      type: 'email.complained',
      data: { message_id: 'msg_1', to: 'parent@x.com' },
    });
    expect(suppression.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'complaint',
        expiresAt: null,
      }),
    );
  });

  it('logs and returns when notification not found', async () => {
    const { svc, suppression, prisma } = build({ notification: null });
    await svc.handle(TENANT_A, { type: 'email.bounced', data: { message_id: 'unknown' } });
    expect(prisma.notification.update).not.toHaveBeenCalled();
    expect(suppression.addSuppression).not.toHaveBeenCalled();
  });
});
```

### `apps/api/src/modules/communications/webhooks/twilio-webhook-handler.service.spec.ts` — NEW

```typescript
import { TwilioWebhookHandlerService, stripWhatsAppPrefix } from './twilio-webhook-handler.service';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma) => ({
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function build(notification: unknown = null) {
  const prisma = {
    notification: {
      findFirst: jest.fn().mockResolvedValue(notification),
      update: jest.fn(),
    },
  };
  const suppression = { addSuppression: jest.fn() };
  const svc = new TwilioWebhookHandlerService(prisma as never, suppression as never);
  return { svc, prisma, suppression };
}

const SMS_NOTIFICATION = {
  id: 'n1',
  tenant_id: TENANT_A,
  channel: 'sms',
  provider_message_id: 'SM1',
};

describe('TwilioWebhookHandlerService — SMS', () => {
  it('MessageStatus=delivered → status=delivered', async () => {
    const { svc, prisma } = build(SMS_NOTIFICATION);
    await svc.handleSms(TENANT_A, {
      MessageSid: 'SM1',
      MessageStatus: 'delivered',
      To: '+15551234567',
    });
    expect(prisma.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'delivered' }),
      }),
    );
  });

  it('failed with hard-bounce error code → suppression', async () => {
    const { svc, suppression } = build(SMS_NOTIFICATION);
    await svc.handleSms(TENANT_A, {
      MessageSid: 'SM1',
      MessageStatus: 'failed',
      ErrorCode: '30005',
      To: '+15551234567',
    });
    expect(suppression.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'hard_bounce',
        recipient: '+15551234567',
      }),
    );
  });

  it('failed with non-hard error code → no suppression', async () => {
    const { svc, suppression } = build(SMS_NOTIFICATION);
    await svc.handleSms(TENANT_A, {
      MessageSid: 'SM1',
      MessageStatus: 'failed',
      ErrorCode: '30007',
      To: '+15551234567',
    });
    expect(suppression.addSuppression).not.toHaveBeenCalled();
  });

  it('queued status is a no-op', async () => {
    const { svc, prisma } = build(SMS_NOTIFICATION);
    await svc.handleSms(TENANT_A, { MessageSid: 'SM1', MessageStatus: 'queued' });
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });
});

describe('TwilioWebhookHandlerService — WhatsApp', () => {
  it('inbound message (no MessageStatus, has From) is routed for service-window stub', async () => {
    const { svc, prisma } = build(null);
    await svc.handleWhatsApp(TENANT_A, {
      MessageSid: 'SM1',
      From: 'whatsapp:+15550000',
      To: 'whatsapp:+15551111',
    });
    // Stub for Impl 08 — no notification update, but call returns cleanly.
    expect(prisma.notification.update).not.toHaveBeenCalled();
  });

  it('outbound status callback for WhatsApp follows SMS path', async () => {
    const wa = { ...SMS_NOTIFICATION, channel: 'whatsapp' };
    const { svc, prisma } = build(wa);
    await svc.handleWhatsApp(TENANT_A, {
      MessageSid: 'SM1',
      MessageStatus: 'delivered',
      To: 'whatsapp:+15551234567',
    });
    expect(prisma.notification.update).toHaveBeenCalled();
  });

  it('strips whatsapp: prefix when adding suppression', async () => {
    const wa = { ...SMS_NOTIFICATION, channel: 'whatsapp' };
    const { svc, suppression } = build(wa);
    await svc.handleWhatsApp(TENANT_A, {
      MessageSid: 'SM1',
      MessageStatus: 'failed',
      ErrorCode: '30005',
      To: 'whatsapp:+15551234567',
    });
    expect(suppression.addSuppression).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: '+15551234567', // no `whatsapp:` prefix
      }),
    );
  });
});

describe('stripWhatsAppPrefix', () => {
  it('strips the whatsapp: prefix', () => {
    expect(stripWhatsAppPrefix('whatsapp:+15550000')).toBe('+15550000');
  });
  it('passes through plain numbers', () => {
    expect(stripWhatsAppPrefix('+15550000')).toBe('+15550000');
  });
});
```

### `apps/api/src/modules/communications/suppression/suppression-list.service.spec.ts` — NEW

```typescript
import { SuppressionListService } from './suppression-list.service';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma) => ({
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function build({ row = null }: { row?: unknown } = {}) {
  const prisma = {
    notificationSuppressionList: {
      upsert: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      deleteMany: jest.fn(),
    },
  };
  const cache = new Map<string, string>();
  const redis = {
    get: jest.fn(async (k: string) => cache.get(k) ?? null),
    set: jest.fn(async (k: string, v: string) => {
      cache.set(k, v);
      return 'OK';
    }),
    del: jest.fn(async (k: string) => {
      cache.delete(k);
      return 1;
    }),
  };
  const svc = new SuppressionListService(prisma as never, redis as never);
  return { svc, prisma, redis, cache };
}

describe('SuppressionListService — addSuppression', () => {
  it('upserts a row and invalidates cache', async () => {
    const { svc, prisma, redis } = build();
    // Pre-cache a "not suppressed" entry.
    await redis.set('suppression:' + TENANT_A + ':email:p@x.com', '0');
    await svc.addSuppression({
      tenantId: TENANT_A,
      channel: 'email',
      recipient: 'p@x.com',
      reason: 'hard_bounce',
      source: 'webhook:resend.bounce',
    });
    expect(prisma.notificationSuppressionList.upsert).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalledWith('suppression:' + TENANT_A + ':email:p@x.com');
  });
});

describe('SuppressionListService — isSuppressed', () => {
  it('returns true when DB has a non-expired row', async () => {
    const { svc, prisma } = build({ row: { id: 'r1', reason: 'hard_bounce' } });
    expect(await svc.isSuppressed(TENANT_A, 'email', 'p@x.com')).toBe(true);
    expect(prisma.notificationSuppressionList.findFirst).toHaveBeenCalled();
  });

  it('returns false when DB has no matching row', async () => {
    const { svc } = build({ row: null });
    expect(await svc.isSuppressed(TENANT_A, 'email', 'p@x.com')).toBe(false);
  });

  it('hits the cache on repeated calls (DB queried once)', async () => {
    const { svc, prisma } = build({ row: { id: 'r1', reason: 'hard_bounce' } });
    await svc.isSuppressed(TENANT_A, 'email', 'p@x.com');
    await svc.isSuppressed(TENANT_A, 'email', 'p@x.com');
    await svc.isSuppressed(TENANT_A, 'email', 'p@x.com');
    expect(prisma.notificationSuppressionList.findFirst).toHaveBeenCalledTimes(1);
  });

  it('addSuppression invalidates the cached negative', async () => {
    const { svc, prisma } = build({ row: null });
    expect(await svc.isSuppressed(TENANT_A, 'email', 'p@x.com')).toBe(false); // populates cache "0"

    // Now add — should invalidate the cache.
    prisma.notificationSuppressionList.findFirst = jest
      .fn()
      .mockResolvedValue({ id: 'r1', reason: 'hard_bounce' });
    await svc.addSuppression({
      tenantId: TENANT_A,
      channel: 'email',
      recipient: 'p@x.com',
      reason: 'hard_bounce',
      source: 'manual',
    });
    expect(await svc.isSuppressed(TENANT_A, 'email', 'p@x.com')).toBe(true);
  });

  it('SECURITY: tenant A suppression does NOT affect tenant B', async () => {
    // The findFirst is scoped by tenant_id in the where clause; the cache
    // key includes tenant_id; both axes guard against cross-tenant bleed.
    const { svc, prisma } = build({ row: null });
    prisma.notificationSuppressionList.findFirst = jest.fn(
      async ({ where }: { where: { tenant_id: string } }) => {
        if (where.tenant_id === TENANT_A) return { id: 'r1', reason: 'hard_bounce' };
        return null;
      },
    );
    expect(await svc.isSuppressed(TENANT_A, 'email', 'p@x.com')).toBe(true);
    expect(await svc.isSuppressed(TENANT_B, 'email', 'p@x.com')).toBe(false);
  });
});

describe('SuppressionListService — removeSuppression', () => {
  it('deletes and invalidates cache', async () => {
    const { svc, prisma, redis } = build();
    await svc.removeSuppression(TENANT_A, 'email', 'p@x.com');
    expect(prisma.notificationSuppressionList.deleteMany).toHaveBeenCalled();
    expect(redis.del).toHaveBeenCalled();
  });
});

describe('SuppressionListService — listSuppressions', () => {
  it('returns paginated rows with meta', async () => {
    const { svc, prisma } = build();
    prisma.notificationSuppressionList.findMany = jest.fn().mockResolvedValue([
      {
        id: 'r1',
        channel: 'email',
        recipient_address: 'p@x.com',
        reason: 'hard_bounce',
        source: 'webhook:resend.bounce',
        notification_id: null,
        expires_at: null,
        created_at: new Date('2026-04-01T00:00:00Z'),
      },
    ]);
    prisma.notificationSuppressionList.count = jest.fn().mockResolvedValue(1);
    const out = await svc.listSuppressions({ tenantId: TENANT_A });
    expect(out.data).toHaveLength(1);
    expect(out.meta.total).toBe(1);
  });
});
```

### `apps/worker/src/processors/communications/suppression-list-cleanup.processor.spec.ts` — NEW

```typescript
import { Job } from 'bullmq';

import {
  SUPPRESSION_LIST_CLEANUP_JOB,
  SuppressionListCleanupProcessor,
} from './suppression-list-cleanup.processor';

describe('SuppressionListCleanupProcessor', () => {
  it('deletes only rows whose expires_at has passed', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 7 });
    const prisma = { notificationSuppressionList: { deleteMany } } as never;
    const proc = new SuppressionListCleanupProcessor(prisma);
    await proc.process({ id: 'j', name: SUPPRESSION_LIST_CLEANUP_JOB } as unknown as Job);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    const where = deleteMany.mock.calls[0][0].where;
    expect(where.expires_at.not).toBeNull();
    expect(where.expires_at.lt).toBeInstanceOf(Date);
  });

  it('does nothing for a different job name', async () => {
    const deleteMany = jest.fn();
    const prisma = { notificationSuppressionList: { deleteMany } } as never;
    const proc = new SuppressionListCleanupProcessor(prisma);
    await proc.process({ id: 'j', name: 'other:job' } as unknown as Job);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
```

### Dispatch service — suppression-skip integration test

Extend `apps/api/src/modules/communications/notification-dispatch.service.spec.ts` with a single block:

```typescript
describe('NotificationDispatchService — suppression check', () => {
  it('skips email dispatch and falls back to in_app when recipient is suppressed', async () => {
    // Arrange: build the service with a suppression service that returns
    // true for the recipient. Confirm:
    //   - resendEmail.send NOT called
    //   - notification updated with status=failed, failure_reason='suppressed:hard_bounce'
    //   - createFallbackNotification called with channel='in_app'
  });

  it('proceeds normally when recipient is not suppressed', async () => {
    // Arrange: suppressionService.isSuppressed returns false. Confirm
    // resendEmail.send IS called.
  });
});
```

The exact mock plumbing follows the existing spec's pattern. The new `SuppressionListService` is added as a constructor mock.

### RLS leakage test (apps/api/test/communications-suppression.rls.spec.ts) — NEW

Per `.claude/rules/testing.md`, every new tenant-scoped table needs a leakage test.

```typescript
describe('RLS — notification_suppression_list', () => {
  it('Tenant B cannot read Tenant A suppression rows', async () => {
    // Insert a suppression row for Tenant A directly via Prisma (system
    // context). Then within an RLS context for Tenant B, query for the
    // recipient. Expect zero results.
  });
});
```

The `apps/api/test/` integration test pattern is established by Wave 1. If that infrastructure is not yet in place when this impl lands, leave the RLS leakage assertion as a comment in the unit spec (the in-memory mock test in §`SuppressionListService — isSuppressed` covers the application-layer guard) and record a follow-up note in §5 of the implementation log.

---

## Verification (local dev server)

> **Worktree only — no CI, no production. All verification happens on `localhost`.**

### Setup

1. `pnpm install` (lockfile may have moved if a sibling impl ran).
2. `pnpm --filter @school/api dev` (port 3001) and `pnpm --filter @school/worker dev` in separate terminals.
3. Apply the migration: `pnpm --filter @school/prisma migrate dev` (Impl 01 owns the migration; this impl just verifies it ran).
4. Confirm the worker logs show: `Registered repeatable cron: comms:suppression-list-cleanup (daily 03:00 UTC)`.

### Webhook ingest happy path (Resend bounce)

The fastest local round-trip is `curl` with a hand-computed signature. The verifier service is symmetric — what we sign with locally is what it will accept.

```bash
# Step 1 — pick the NHQS tenant id from the dev DB.
NHQS_ID=$(psql edupod_dev -tAc "SELECT id FROM tenants WHERE slug='nhqs';")

# Step 2 — set a known webhook secret for NHQS email config (Impl 13 will
# do this for all tenants; for an Impl 06 smoke we set just NHQS by hand).
SECRET="whsec_$(echo -n 'local-dev-secret-32-bytes-1234567' | base64)"
psql edupod_dev <<SQL
  UPDATE tenant_email_configs
     SET webhook_secret_encrypted = encode(pgp_sym_encrypt('$SECRET', current_setting('app.encryption_key')), 'base64')
   WHERE tenant_id = '$NHQS_ID';
SQL

# Step 3 — craft a Resend "email.bounced" event for a notification we
# know exists. Pick one from the local DB:
NOTIF_MSG_ID=$(psql edupod_dev -tAc "SELECT provider_message_id FROM notification WHERE tenant_id='$NHQS_ID' AND channel='email' AND provider_message_id IS NOT NULL LIMIT 1;")

BODY='{"type":"email.bounced","data":{"message_id":"'"$NOTIF_MSG_ID"'","to":"hardbounce@invalid.test","bounce":{"type":"hard","message":"no such mailbox"}}}'
SVIX_ID="evt_local_$RANDOM"
SVIX_TS=$(date +%s)
SECRET_BYTES=$(echo -n "${SECRET#whsec_}" | base64 -d | xxd -p -c 256)
SIG=$(echo -n "${SVIX_ID}.${SVIX_TS}.${BODY}" | openssl dgst -sha256 -mac HMAC -macopt hexkey:$SECRET_BYTES | awk '{print $2}' | xxd -r -p | base64)

curl -i -X POST "http://localhost:3001/api/v1/webhooks/communications/email/$NHQS_ID" \
  -H "Content-Type: application/json" \
  -H "svix-id: $SVIX_ID" \
  -H "svix-timestamp: $SVIX_TS" \
  -H "svix-signature: v1,$SIG" \
  -d "$BODY"
# Expect: 200 OK, body {"accepted": true}
```

Confirm side-effects in psql:

```bash
psql edupod_dev <<SQL
  SELECT signature_verified, event_type, channel
    FROM notification_webhook_events
   WHERE tenant_id = '$NHQS_ID'
   ORDER BY received_at DESC LIMIT 1;
  -- Expect: t | email.bounced | email

  SELECT status, failure_reason
    FROM notification
   WHERE provider_message_id = '$NOTIF_MSG_ID';
  -- Expect: bounced | Resend bounce (hard): no such mailbox

  SELECT channel, recipient_address, reason, expires_at
    FROM notification_suppression_list
   WHERE tenant_id = '$NHQS_ID' AND recipient_address = 'hardbounce@invalid.test';
  -- Expect: email | hardbounce@invalid.test | hard_bounce | NULL
SQL
```

### Webhook ingest signature failure path

```bash
# Same body, but garbage signature.
curl -i -X POST "http://localhost:3001/api/v1/webhooks/communications/email/$NHQS_ID" \
  -H "Content-Type: application/json" \
  -H "svix-id: $SVIX_ID" \
  -H "svix-timestamp: $SVIX_TS" \
  -H "svix-signature: v1,wrongwrongwrongwrongwrongwrongwrong=" \
  -d "$BODY"
# Expect: 401 with code WEBHOOK_SIGNATURE_INVALID

# Verify a row was still written with signature_verified=false:
psql edupod_dev -c "SELECT signature_verified FROM notification_webhook_events WHERE tenant_id = '$NHQS_ID' ORDER BY received_at DESC LIMIT 1;"
# Expect: f
```

### Wrong-tenant rejection

```bash
# Use stress-a's tenant id but sign with NHQS's secret. Even if the
# verifier received a "valid" payload, the secret loaded for stress-a is
# different — verification fails.
STRESS_A_ID=$(psql edupod_dev -tAc "SELECT id FROM tenants WHERE slug='stress-a';")

curl -i -X POST "http://localhost:3001/api/v1/webhooks/communications/email/$STRESS_A_ID" \
  -H "Content-Type: application/json" \
  -H "svix-id: $SVIX_ID" \
  -H "svix-timestamp: $SVIX_TS" \
  -H "svix-signature: v1,$SIG" \
  -d "$BODY"
# Expect: 401 — signature signed with NHQS secret, verified against stress-a secret.
```

### Soft-bounce threshold

```bash
# Insert two prior soft bounces for the same recipient via psql.
psql edupod_dev <<SQL
  INSERT INTO notification_webhook_events
    (tenant_id, channel, provider_event_id, event_type, payload_json, signature_verified, received_at)
  VALUES
    ('$NHQS_ID', 'email', 'svix:e1', 'email.bounced',
     '{"data":{"to":"softie@x.com","bounce":{"type":"soft"}}}'::jsonb, true, now() - interval '1 day'),
    ('$NHQS_ID', 'email', 'svix:e2', 'email.bounced',
     '{"data":{"to":"softie@x.com","bounce":{"type":"soft"}}}'::jsonb, true, now() - interval '2 days');
SQL

# Now simulate the 3rd. Recompute signature for the new body:
BODY3='{"type":"email.bounced","data":{"message_id":"'"$NOTIF_MSG_ID"'","to":"softie@x.com","bounce":{"type":"soft"}}}'
SVIX_TS3=$(date +%s)
SIG3=$(echo -n "$SVIX_ID.$SVIX_TS3.$BODY3" | openssl dgst -sha256 -mac HMAC -macopt hexkey:$SECRET_BYTES | awk '{print $2}' | xxd -r -p | base64)

curl -i -X POST "http://localhost:3001/api/v1/webhooks/communications/email/$NHQS_ID" \
  -H "svix-id: $SVIX_ID" -H "svix-timestamp: $SVIX_TS3" \
  -H "svix-signature: v1,$SIG3" -d "$BODY3"

# Verify suppression created with 30-day expiry.
psql edupod_dev -c "SELECT reason, expires_at - now() AS time_remaining FROM notification_suppression_list WHERE recipient_address = 'softie@x.com';"
# Expect: soft_bounce_threshold | ~30 days
```

### Outbound suppression check

Trigger any dispatchable notification to the suppressed recipient:

```bash
# Use the existing /v1/announcements endpoint (or the simplest dispatch
# trigger you have locally — depends on the dev DB seed). Confirm the
# notification row ends up status='failed' with
# failure_reason='suppressed:hard_bounce' and a sibling row in 'in_app'
# is created for the fallback chain.

psql edupod_dev <<SQL
  -- Find the most recent dispatch attempt to hardbounce@invalid.test
  -- (look at the join: notification → user → email).
  SELECT n.status, n.failure_reason, n.channel, n.created_at
    FROM notification n
    JOIN users u ON u.id = n.recipient_user_id
   WHERE n.tenant_id = '$NHQS_ID' AND u.email = 'hardbounce@invalid.test'
   ORDER BY n.created_at DESC LIMIT 5;
SQL
# Expect a 'failed' row on email channel with failure_reason='suppressed:hard_bounce'
# AND a 'queued' or 'delivered' row on in_app for the fallback.
```

### Cron — manual invocation

```bash
# Force the cleanup to run by enqueueing the job directly.
node --eval '
  const { Queue } = require("bullmq");
  const q = new Queue("notifications", { connection: { host: "localhost", port: 6379 } });
  q.add("comms:suppression-list-cleanup", {}).then(() => process.exit(0));
'

# Watch the worker logs:
# Expect:  comms:suppression-list-cleanup done — removed N expired suppression(s)

# Insert a row with expires_at in the past, run the cron, verify deletion.
psql edupod_dev <<SQL
  INSERT INTO notification_suppression_list (tenant_id, channel, recipient_address, reason, source, expires_at)
    VALUES ('$NHQS_ID', 'email', 'expired@x.com', 'soft_bounce_threshold', 'manual', now() - interval '1 hour');
SQL

# Re-enqueue the cron, then:
psql edupod_dev -c "SELECT count(*) FROM notification_suppression_list WHERE recipient_address='expired@x.com';"
# Expect: 0
```

### Smoke summary

Append to the §5 completion record:

```
- Local verification:
  - /v1/webhooks/communications/email/:tenantId — 200 OK with valid signature, 401 with bad sig, both write notification_webhook_events row (verified at HH:MM)
  - Wrong-tenant URL rejected with 401 (verified)
  - Resend bounce (hard) → notification.status='bounced' + suppression row with expires_at=NULL (verified)
  - Soft-bounce threshold — 3rd in 30 days creates 30-day suppression (verified)
  - Resend complaint → suppression with reason=complaint, expires_at=NULL (verified)
  - Outbound dispatch to suppressed recipient → status='failed', failure_reason='suppressed:hard_bounce', in-app fallback created (verified)
  - Suppression cache — repeated isSuppressed calls hit Redis cache, DB queried once (verified via prisma query log)
  - Cleanup cron — manually enqueued, removed 1 expired row (verified)
```

---

## Files touched

### NEW — backend (api)

```
apps/api/src/modules/communications/webhooks/
├── communications-webhooks.controller.ts
├── communications-webhooks.controller.spec.ts
├── webhook-signature-verifier.service.ts
├── webhook-signature-verifier.service.spec.ts
├── resend-webhook-handler.service.ts
├── resend-webhook-handler.service.spec.ts
├── twilio-webhook-handler.service.ts
└── twilio-webhook-handler.service.spec.ts

apps/api/src/modules/communications/suppression/
├── suppression-list.service.ts
└── suppression-list.service.spec.ts

apps/api/test/
└── communications-suppression.rls.spec.ts        (RLS leakage — optional if infra present)
```

### NEW — worker

```
apps/worker/src/processors/communications/
├── suppression-list-cleanup.processor.ts
└── suppression-list-cleanup.processor.spec.ts
```

### UPDATE — backend (api)

```
apps/api/src/modules/communications/communications.module.ts
  + import + register CommunicationsWebhooksController
  + register WebhookSignatureVerifierService
  + register ResendWebhookHandlerService
  + register TwilioWebhookHandlerService
  + register SuppressionListService
  + export SuppressionListService

apps/api/src/modules/communications/notification-dispatch.service.ts
  + constructor: SuppressionListService injection
  + dispatchEmail / dispatchSms / dispatchWhatsApp: pre-dispatch suppression check
  + skipIfSuppressed helper

apps/api/src/modules/configuration/email-config.service.ts
apps/api/src/modules/configuration/sms-config.service.ts
apps/api/src/modules/configuration/whatsapp-config.service.ts
  + getWebhookSecret(tenantId) accessor (each)
```

### UPDATE — worker

```
apps/worker/src/cron/cron-scheduler.service.ts
  + register comms:suppression-list-cleanup repeatable cron

apps/worker/src/processors/notifications/notifications-queue.processor.ts
  + route SUPPRESSION_LIST_CLEANUP_JOB to SuppressionListCleanupProcessor

apps/worker/src/worker.module.ts
  + register SuppressionListCleanupProcessor
```

### Shared file claims (Rule 17 — append before editing)

```
### [WAVE 3 SHARED-FILE CLAIM] — impl 06
- Claims: apps/api/src/modules/communications/communications.module.ts
- Claims: apps/api/src/modules/communications/notification-dispatch.service.ts
- Claims: apps/api/src/modules/configuration/email-config.service.ts
- Claims: apps/api/src/modules/configuration/sms-config.service.ts
- Claims: apps/api/src/modules/configuration/whatsapp-config.service.ts
- Claims: apps/worker/src/cron/cron-scheduler.service.ts
- Claims: apps/worker/src/processors/notifications/notifications-queue.processor.ts
- Claims: apps/worker/src/worker.module.ts
- Until: committed OR flipped to `🛑 blocked`
```

If any of these files are already claimed by Impl 04 / 05 / 07 / 08 / 09 / 10 when you start, coordinate per Rule 17 — wait for their commit, pull (within the worktree), then layer hunks. Most likely conflicts:

- **Impl 04** (provider refactor) edits `notification-dispatch.service.ts`. Coordinate the suppression-check insertion with Impl 04's tenant-config lookup — both are pre-dispatch checks; Impl 04 should sequence FIRST so the tenant-config null-check returns "channel not configured" before suppression is even consulted (saves a Redis hit on disabled channels).
- **Impl 05** (worker parity) edits `cron-scheduler.service.ts`. The cron registration order doesn't matter, but the import block does — sort imports alphabetically.
- **Impl 07 / 08** (deliverability + WhatsApp) also touch `cron-scheduler.service.ts` for their own cron jobs. Layer them in alphabetical order of `comms:domain-verification-refresh` < `comms:suppression-list-cleanup` < `comms:whatsapp-template-sync`.

---

## Rollback

`git revert <commit-sha>` in the worktree. Three considerations:

1. **DB rows persist**. The `notification_webhook_events` and `notification_suppression_list` tables (Impl 01) are not removed by this revert. Rollback only removes the application code that reads/writes them. To proactively clear suppression list rows during a rollback emergency:

   ```sql
   TRUNCATE notification_suppression_list;
   ```

   (Tenant-scoped truncation if needed; full truncate is fine in the worktree's local dev DB.)

2. **Cron persists in Redis**. After reverting, the BullMQ repeatable for `comms:suppression-list-cleanup` is still registered in Redis. Removing the worker's cron registration won't unschedule the existing repeatable. To fully clear:

   ```bash
   redis-cli -h localhost -p 6379 DEL "bull:notifications:repeat:cron:comms:suppression-list-cleanup"
   ```

3. **Pre-rebuild webhook controller** (`apps/api/src/modules/communications/webhook.controller.ts`) is untouched by this impl. After a revert it continues to function for the platform-shared `RESEND_WEBHOOK_SECRET` / `TWILIO_AUTH_TOKEN` env vars. Until Impl 14 deletes that controller, both paths coexist — the new per-tenant controller is purely additive at this point.

If the suppression check inside `notification-dispatch.service.ts` causes a regression in dispatch (e.g. mis-keyed cache, RLS context not set), a hot-fix is to comment out the `skipIfSuppressed` calls in the three dispatch methods and redeploy the API. The webhook ingestion path is independent and can stay live.

---

## Cross-impl notes for subsequent waves

- **Impl 07 (email deliverability)** — when the dispatch service does the domain verification check, sequence it BEFORE the suppression check. A tenant with an unverified domain shouldn't even reach the suppression check; saves Redis hits during early onboarding. The two checks are commutative for correctness but ordering matters for Sentry-tag clarity (the failure_reason will be the FIRST gate to reject).
- **Impl 08 (WhatsApp templates + service window)** — the inbound-WhatsApp branch in `TwilioWebhookHandlerService.handleWhatsApp` is a stub. Impl 08 fills it with `WhatsAppServiceWindowService.updateLastInbound(tenantId, params['From'].replace('whatsapp:', ''))`. The webhook event log row is already written by the controller, so Impl 08 can rely on `notification_webhook_events` as a backup if the service-window update fails.
- **Impl 09 (verifyConfig)** — when the test-send endpoint dispatches, it also goes through `notification-dispatch.service.ts` → suppression check. Test sends to a suppressed recipient should fail — this is intentional, not a bug. The verify endpoint surfaces the verbatim "suppressed:..." reason so the admin can manually clear before re-verifying.
- **Impl 10 (observability)** — add the `notifications_suppressed_total{tenant_id, channel, reason}` counter alongside the existing dispatch counter. The counter increment lives in `skipIfSuppressed` — increment ONCE per skip, with the reason label.
- **Impl 11 (frontend settings)** — no UI for suppression list in V1. The `SuppressionListService.listSuppressions` and `removeSuppression` methods are exposed for tests + future use, no controller wraps them yet.
- **Impl 12 (module gap closure)** — the finance module's direct DB write migration to `NotificationsService.dispatch()` will now also be subject to suppression checks; document this in the migration's commit message.
- **Impl 13 (tenant backfill)** — before the test send walkthrough, set `webhook_secret` on each of the 5 test tenants × 3 channels (15 total). For local dev, use a deterministic per-tenant secret derived from the tenant slug so the verification curl scripts above work for any tenant without re-encoding.
- **Impl 14 (architecture docs + E2E)** — owns the deletion of the platform-shared `webhook.controller.ts` AND the deletion of the `RESEND_WEBHOOK_SECRET` env-validation entry (which Impl 05 should have removed for credentials but the webhook secret may remain until Impl 14). Confirm both during the E2E walkthrough.

---

## Local commit hygiene (Rule 22 + Rule 7)

This impl ships in two natural commits:

1. **`feat(comms): add per-tenant webhook ingestion + suppression list service`** — all NEW files in §"Files touched / NEW", plus the `getWebhookSecret` accessor on the three config services, plus the dispatch service's suppression-check insertion. Tests included.

2. **`chore(comms): register suppression-list-cleanup cron`** — `cron-scheduler.service.ts`, `notifications-queue.processor.ts`, `worker.module.ts`. The cron is operationally distinct from the API ingest path, so a separate commit makes the rollback granular if only one half regresses.

After both commits, append the §5 completion record as a SEPARATE commit (Rule 7):

3. **`docs(comms): record impl 06 completion`** — log entry only.

Pre-commit hook (Rule 24): the husky pre-commit will run lint + type-check on the staged files. Both commits should pass cleanly. If the hook fails on a sibling impl's already-on-branch file, do NOT use `--no-verify` without a §5 audit note naming the dragging impl.
