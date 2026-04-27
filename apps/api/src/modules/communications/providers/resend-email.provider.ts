import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

import type { CommsCacheBusEvent } from '@school/shared';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { EmailConfigService } from '../../configuration/email-config.service';
import { CommsCacheBusService } from '../comms-cache-bus.service';

import { PerTenantClientCache } from './per-tenant-client-cache';

/**
 * Resend email provider with per-tenant credentials.
 *
 * Resolution order on `send`:
 *   1. Tenant config (`tenant_email_configs.is_enabled = true`) — primary path
 *   2. Platform `.env` (`RESEND_API_KEY` / `RESEND_FROM_EMAIL`) — temporary
 *      fallback. Removed by Impl 05.
 *
 * The per-tenant Resend client is cached (LRU + idle TTL). Cache
 * invalidation is driven by `comms:config-changed` Redis pub/sub events
 * — the API and worker each subscribe and drop the relevant tenant's
 * client when its config changes.
 */
@Injectable()
export class ResendEmailProvider implements OnModuleInit {
  private readonly logger = new Logger(ResendEmailProvider.name);

  private readonly tenantClientCache = new PerTenantClientCache<Resend>({
    maxSize: 1000,
    ttlMs: 30 * 60 * 1000,
  });

  /** Shared platform client used as the temporary `.env` fallback. Removed by Impl 05. */
  private platformFallbackClient: Resend | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerRegistry,
    private readonly emailConfigService: EmailConfigService,
    private readonly cacheBus: CommsCacheBusService,
  ) {}

  onModuleInit(): void {
    this.cacheBus.subscribe((event: CommsCacheBusEvent) => {
      if (event.channel !== 'email') return;
      this.tenantClientCache.invalidate(event.tenant_id);
      this.logger.log(`Invalidated email client cache for tenant=${event.tenant_id}`);
    });
  }

  /**
   * @deprecated Removed by Impl 05. Kept temporarily so the dispatch
   * service's startup self-check still runs while Impl 05 is in flight.
   */
  isConfigured(): boolean {
    return !!this.configService.get<string>('RESEND_API_KEY');
  }

  /**
   * True if EITHER the tenant has a `tenant_email_configs` row with
   * `is_enabled = true`, OR the platform `.env` fallback is set.
   * Impl 05 collapses this to "tenant config only".
   */
  async isConfiguredForTenant(tenantId: string): Promise<boolean> {
    const config = await this.emailConfigService.getDecryptedConfig(tenantId);
    if (config?.is_enabled) return true;
    return this.isConfigured();
  }

  /**
   * Send an email via Resend. Resolves tenant credentials FIRST; falls
   * back to platform `.env` only if no tenant config row exists.
   *
   * @param tenantId - the tenant whose credentials should send this mail
   * @param params   - the message itself
   */
  async send(
    tenantId: string,
    params: {
      to: string;
      subject: string;
      html: string;
      from?: string;
      replyTo?: string;
      tags?: { name: string; value: string }[];
      idempotencyKey?: string;
    },
  ): Promise<{ messageId: string }> {
    const tenantConfig = await this.emailConfigService.getDecryptedConfig(tenantId);

    let client: Resend;
    let from: string;
    let replyTo: string | undefined;

    if (tenantConfig?.is_enabled) {
      client = this.tenantClientCache.getOrCreate(
        tenantId,
        () => new Resend(tenantConfig.resend_api_key),
      );
      from =
        params.from ??
        (tenantConfig.from_name
          ? `${tenantConfig.from_name} <${tenantConfig.from_email}>`
          : tenantConfig.from_email);
      replyTo = params.replyTo ?? tenantConfig.reply_to_email ?? undefined;
    } else {
      client = this.ensurePlatformFallbackClient();
      from =
        params.from ?? this.configService.get<string>('RESEND_FROM_EMAIL') ?? 'noreply@edupod.app';
      replyTo = params.replyTo;
      this.logger.warn(
        `tenant=${tenantId} has no email config; falling back to platform .env credentials. ` +
          'This path is removed by Impl 05 — backfill via Impl 13.',
      );
    }

    this.logger.log(`Sending email tenant=${tenantId} to=${params.to} subject="${params.subject}"`);

    const { data, error } = await this.circuitBreaker.exec('resend', () =>
      client.emails.send({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(params.tags && params.tags.length > 0 ? { tags: params.tags } : {}),
        ...(params.idempotencyKey ? { headers: { 'X-Entity-Ref-ID': params.idempotencyKey } } : {}),
      }),
    );

    if (error) {
      this.logger.error(`Resend email failed tenant=${tenantId}: ${error.message}`, error.name);
      throw new Error(`Resend email failed: ${error.message}`);
    }

    const messageId = data?.id ?? '';
    this.logger.log(`Email sent tenant=${tenantId} messageId=${messageId}`);
    return { messageId };
  }

  private ensurePlatformFallbackClient(): Resend {
    if (this.platformFallbackClient) return this.platformFallbackClient;
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error(
        'Resend is not configured. Tenant has no email config and platform .env fallback is empty.',
      );
    }
    this.platformFallbackClient = new Resend(apiKey);
    return this.platformFallbackClient;
  }
}
