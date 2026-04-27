import { Injectable, Logger } from '@nestjs/common';

import type { CommsCacheBusEvent } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { CommsCacheBusService } from './comms-cache-bus.service';

const TTL_MS = 30_000; // 30 seconds

interface CacheEntry {
  enabled: boolean;
  fetchedAt: number;
}

/**
 * Per-tenant `is_enabled` cache for the three communication channels.
 *
 * Hits the DB at most once per 30 seconds per (tenant_id, channel)
 * unless invalidated by a `comms:config-changed` event.
 *
 * Used by both API and worker dispatch paths to short-circuit a
 * dispatch when the channel is administratively disabled, BEFORE
 * the per-tenant client cache is even consulted. A disabled tenant
 * never instantiates a Resend / Twilio client.
 *
 * Implementation note: deliberately split from `PerTenantClientCache`
 * (Impl 04) because the two caches have different semantics —
 * `is_enabled` is a single boolean, the client cache stores SDK
 * objects. They share the same Redis pub/sub channel for invalidation.
 */
@Injectable()
export class IsEnabledCacheService {
  private readonly logger = new Logger(IsEnabledCacheService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheBus: CommsCacheBusService,
  ) {
    // Wire pub/sub invalidation. Drop the matching key when the
    // tenant's config-changed event fires — next call refetches.
    this.cacheBus.subscribe((event: CommsCacheBusEvent) => {
      const key = this.cacheKey(event.tenant_id, event.channel);
      this.cache.delete(key);
    });
  }

  /**
   * Returns the current `is_enabled` for the tenant + channel.
   * Cache miss → DB read (then 30-sec cache).
   * No config row → returns `false`.
   */
  async getEnabled(tenantId: string, channel: 'email' | 'sms' | 'whatsapp'): Promise<boolean> {
    const key = this.cacheKey(tenantId, channel);
    const now = Date.now();

    const cached = this.cache.get(key);
    if (cached && now - cached.fetchedAt < TTL_MS) {
      return cached.enabled;
    }

    const enabled = await this.fetchFromDb(tenantId, channel);
    this.cache.set(key, { enabled, fetchedAt: now });
    return enabled;
  }

  /** Manual eviction — exported for tests + the cache bus handler. */
  invalidate(tenantId: string, channel: 'email' | 'sms' | 'whatsapp'): void {
    this.cache.delete(this.cacheKey(tenantId, channel));
  }

  /** Total entries — for observability + tests. */
  size(): number {
    return this.cache.size;
  }

  private cacheKey(tenantId: string, channel: string): string {
    return `${tenantId}:${channel}`;
  }

  private async fetchFromDb(
    tenantId: string,
    channel: 'email' | 'sms' | 'whatsapp',
  ): Promise<boolean> {
    if (channel === 'email') {
      const row = await this.prisma.tenantEmailConfig.findUnique({
        where: { tenant_id: tenantId },
        select: { is_enabled: true },
      });
      return row?.is_enabled === true;
    }
    if (channel === 'sms') {
      const row = await this.prisma.tenantSmsConfig.findUnique({
        where: { tenant_id: tenantId },
        select: { is_enabled: true },
      });
      return row?.is_enabled === true;
    }
    const row = await this.prisma.tenantWhatsAppConfig.findUnique({
      where: { tenant_id: tenantId },
      select: { is_enabled: true },
    });
    return row?.is_enabled === true;
  }
}
