import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

import type { CommsCacheBusEvent, EmailDispatchResult } from '@school/shared';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { EmailConfigService } from '../../configuration/email-config.service';
import { CommsCacheBusService } from '../comms-cache-bus.service';
import { CommsMetricsService } from '../comms-metrics.service';
import { EmailDomainService } from '../deliverability/email-domain.service';

import { PerTenantClientCache } from './per-tenant-client-cache';
import { mapResendError } from './provider-error-mapping';

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
    private readonly emailDomain: EmailDomainService,
    private readonly configService: ConfigService,
    private readonly metrics: CommsMetricsService,
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

    // Impl 07: refuse to dispatch from a domain that hasn't completed
    // SPF/DKIM/DMARC verification — Resend would land us in spam.
    // Bypass for local dev only via COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV.
    const senderDomain = this.extractDomain(params.from ?? tenantConfig.from_email);
    if (!senderDomain) {
      this.logger.warn(
        `[ResendEmailProvider] tenant=${tenantId} from="${params.from ?? tenantConfig.from_email}" blocked — invalid_from_email`,
      );
      return { skipped: true, reason: 'invalid_from_email' };
    }
    const bypass =
      this.configService.get<string>('COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV') === 'true';
    if (!bypass) {
      const verified = await this.emailDomain.getVerified(tenantId, senderDomain);
      if (!verified) {
        this.logger.warn(
          `[ResendEmailProvider] tenant=${tenantId} from=${params.from ?? tenantConfig.from_email} domain=${senderDomain} blocked — sender_domain_unverified`,
        );
        return { skipped: true, reason: 'sender_domain_unverified' };
      }
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
      const statusCode = (error as { statusCode?: number }).statusCode;
      const errorCode = mapResendError(statusCode, error.message);
      this.metrics.recordProviderError(tenantId, 'email', errorCode);
      this.logger.error(`Resend email failed tenant=${tenantId}: ${error.message}`, error.name);
      throw new Error(`Resend email failed: ${error.message}`);
    }

    const messageId = data?.id ?? '';
    this.logger.log(`Email sent tenant=${tenantId} messageId=${messageId}`);
    return { messageId };
  }

  /**
   * Extract the domain part of an RFC 5321 `from` header. Tolerates the
   * `Display Name <addr@host>` form by reading the `@` from the right.
   * Returns null on malformed input.
   */
  private extractDomain(from: string): string | null {
    if (!from) return null;
    // Strip display-name wrapping if present
    const angleStart = from.lastIndexOf('<');
    const angleEnd = from.lastIndexOf('>');
    const addr =
      angleStart >= 0 && angleEnd > angleStart ? from.slice(angleStart + 1, angleEnd) : from;
    const at = addr.lastIndexOf('@');
    if (at < 0 || at >= addr.length - 1) return null;
    return addr
      .slice(at + 1)
      .trim()
      .toLowerCase();
  }
}
