import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Resend } from 'resend';

import type { CommsCacheBusEvent, EmailDispatchResult } from '@school/shared';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { EmailConfigService } from '../../configuration/email-config.service';
import { CommsCacheBusService } from '../comms-cache-bus.service';

import { PerTenantClientCache } from './per-tenant-client-cache';

/**
 * Resend email provider with **per-tenant credentials only**.
 *
 * Resolution rule (post-Impl 05):
 *   - Tenant has `tenant_email_configs.is_enabled = true` → dispatch via tenant credentials
 *   - No row, or `is_enabled = false` → return `{ skipped: true, reason }`
 *
 * The platform `.env` fallback (`RESEND_API_KEY`) is **deleted** by Impl
 * 05. There is no longer a path that dispatches with platform-shared
 * credentials. Tenants must be backfilled via Impl 13 before any
 * channel can dispatch.
 *
 * Per-tenant Resend client cached LRU+TTL (max 1000, 30 min idle).
 * Invalidation: `comms:config-changed` Redis pub/sub events from
 * `CommsCacheBusService` (cross-process eviction).
 */
@Injectable()
export class ResendEmailProvider implements OnModuleInit {
  private readonly logger = new Logger(ResendEmailProvider.name);

  private readonly tenantClientCache = new PerTenantClientCache<Resend>({
    maxSize: 1000,
    ttlMs: 30 * 60 * 1000,
  });

  constructor(
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
   * True iff the tenant has a configured + enabled email config row.
   * Replaces the legacy `isConfigured()` env-presence check.
   */
  async isConfiguredForTenant(tenantId: string): Promise<boolean> {
    const config = await this.emailConfigService.getDecryptedConfig(tenantId);
    return Boolean(config?.is_enabled);
  }

  /**
   * Send an email via Resend using the tenant's credentials.
   *
   * Returns `{ messageId }` on success or `{ skipped, reason }` when
   * dispatch is administratively skipped. Throws only on transient
   * provider errors (the dispatch service handles retry / fallback).
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
  ): Promise<EmailDispatchResult> {
    const tenantConfig = await this.emailConfigService.getDecryptedConfig(tenantId);

    if (!tenantConfig) {
      return { skipped: true, reason: 'channel_not_configured' };
    }
    if (!tenantConfig.is_enabled) {
      return { skipped: true, reason: 'channel_disabled' };
    }

    const client = this.tenantClientCache.getOrCreate(
      tenantId,
      () => new Resend(tenantConfig.resend_api_key),
    );

    const from =
      params.from ??
      (tenantConfig.from_name
        ? `${tenantConfig.from_name} <${tenantConfig.from_email}>`
        : tenantConfig.from_email);
    const replyTo = params.replyTo ?? tenantConfig.reply_to_email ?? undefined;

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
}
