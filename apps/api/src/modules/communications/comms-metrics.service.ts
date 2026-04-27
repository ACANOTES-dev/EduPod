import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Histogram } from 'prom-client';

import type { CommsProviderChannel } from '@school/shared';

import { MetricsService } from '../metrics/metrics.service';

type AnyChannel = CommsProviderChannel | 'in_app';

type DispatchStatus = 'sent' | 'delivered' | 'failed' | 'suppressed' | 'skipped';

type SuppressionReason =
  | 'hard_bounce'
  | 'soft_bounce_threshold'
  | 'complaint'
  | 'manual'
  | 'unsubscribe';

const DISPATCH_DURATION_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10] as const;

/**
 * Per-tenant Prometheus metrics for the comms module.
 *
 * **Cardinality note:** `tenant_id` is high-cardinality but BOUNDED — capped
 * by tenant count (target ≤ 200 in V1, hard cap ~hundreds before revisit).
 * Beyond that, switch to top-K + 'other' bucketing.
 */
@Injectable()
export class CommsMetricsService implements OnModuleInit {
  private dispatched: Counter<'tenant_id' | 'channel' | 'status'> | null = null;
  private dispatchDuration: Histogram<'tenant_id' | 'channel'> | null = null;
  private suppressed: Counter<'tenant_id' | 'channel' | 'reason'> | null = null;
  private webhookReceived: Counter<
    'tenant_id' | 'channel' | 'event_type' | 'signature_valid'
  > | null = null;
  private templateRenders: Counter<'tenant_id' | 'channel' | 'template_key' | 'locale'> | null =
    null;
  private providerErrors: Counter<'tenant_id' | 'channel' | 'error_code'> | null = null;

  constructor(@Inject(MetricsService) private readonly metricsService: MetricsService) {}

  onModuleInit(): void {
    const registry = this.metricsService.getCommsRegistry();

    this.dispatched = new Counter({
      name: 'notifications_dispatched_total',
      help: 'Total notifications dispatched by channel and outcome.',
      labelNames: ['tenant_id', 'channel', 'status'] as const,
      registers: [registry],
    });

    this.dispatchDuration = new Histogram({
      name: 'notifications_dispatch_duration_seconds',
      help: 'Duration of provider dispatch calls in seconds.',
      labelNames: ['tenant_id', 'channel'] as const,
      buckets: [...DISPATCH_DURATION_BUCKETS],
      registers: [registry],
    });

    this.suppressed = new Counter({
      name: 'notifications_suppressed_total',
      help: 'Notifications skipped because the recipient is on the suppression list.',
      labelNames: ['tenant_id', 'channel', 'reason'] as const,
      registers: [registry],
    });

    this.webhookReceived = new Counter({
      name: 'notifications_webhook_received_total',
      help: 'Inbound webhook events received (Resend / Twilio status callbacks).',
      labelNames: ['tenant_id', 'channel', 'event_type', 'signature_valid'] as const,
      registers: [registry],
    });

    this.templateRenders = new Counter({
      name: 'notifications_template_renders_total',
      help: 'Template renders by template key and locale.',
      labelNames: ['tenant_id', 'channel', 'template_key', 'locale'] as const,
      registers: [registry],
    });

    this.providerErrors = new Counter({
      name: 'notifications_provider_errors_total',
      help: 'Provider-side errors mapped to error codes (Resend status / Twilio error codes).',
      labelNames: ['tenant_id', 'channel', 'error_code'] as const,
      registers: [registry],
    });
  }

  // ─── Recording API ─────────────────────────────────────────────────────

  recordDispatch(
    tenantId: string,
    channel: AnyChannel,
    status: DispatchStatus,
    durationMs: number,
  ): void {
    if (!this.dispatched || !this.dispatchDuration) return;
    this.dispatched.inc({ tenant_id: tenantId, channel, status });
    this.dispatchDuration.observe({ tenant_id: tenantId, channel }, Math.max(0, durationMs) / 1000);
  }

  recordSuppression(tenantId: string, channel: AnyChannel, reason: SuppressionReason): void {
    if (!this.suppressed) return;
    this.suppressed.inc({ tenant_id: tenantId, channel, reason });
  }

  recordWebhook(
    tenantId: string,
    channel: AnyChannel,
    eventType: string,
    signatureValid: boolean,
  ): void {
    if (!this.webhookReceived) return;
    this.webhookReceived.inc({
      tenant_id: tenantId,
      channel,
      event_type: eventType,
      signature_valid: String(signatureValid),
    });
  }

  recordTemplateRender(
    tenantId: string,
    channel: AnyChannel,
    templateKey: string,
    locale: string,
  ): void {
    if (!this.templateRenders) return;
    this.templateRenders.inc({
      tenant_id: tenantId,
      channel,
      template_key: templateKey,
      locale,
    });
  }

  recordProviderError(tenantId: string, channel: AnyChannel, errorCode: string): void {
    if (!this.providerErrors) return;
    this.providerErrors.inc({ tenant_id: tenantId, channel, error_code: errorCode });
  }
}
