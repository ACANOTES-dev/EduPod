import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';

import {
  WELLBEING_AI_MODULE_KEYS,
  type TenantAiFlag,
  type WellbeingAiModuleKey,
} from '@school/shared/wellbeing';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * WB-C-03 — Redis pub/sub channel for cross-instance cache invalidation.
 * When `setFlag` mutates a (tenant, module) pair, it publishes here; every
 * other API instance receives the message via its own subscriber connection
 * and clears the matching local cache entry.
 */
const INVALIDATION_CHANNEL = 'ai-flags:invalidated';

interface CacheEntry {
  enabled: boolean;
  expiresAt: number;
}

interface InvalidationPayload {
  tenant_id: string;
  module_key: WellbeingAiModuleKey;
}

/**
 * AiFlagsService — owns the per-(tenant, module) AI feature gate.
 *
 * - `list` / `setFlag` back the admin CRUD surfaced by `AiFlagsController`.
 * - `isEnabled` is the hot path used by `AiFlagGuard`; it caches lookups in
 *   process for `CACHE_TTL_MS` and invalidates on `setFlag`. Cache keys are
 *   `${tenantId}:${moduleKey}`. Multi-instance staleness is bounded by the
 *   TTL — see Wave 5 impl 18 follow-up.
 */
@Injectable()
export class AiFlagsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiFlagsService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private subscriber: Redis | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      // ioredis: a connection in subscribe mode cannot issue regular commands,
      // so we duplicate the publisher connection for the subscriber side.
      this.subscriber = this.redis.getClient().duplicate();
      await this.subscriber.subscribe(INVALIDATION_CHANNEL);
      this.subscriber.on('message', (channel, raw) => {
        if (channel !== INVALIDATION_CHANNEL) return;
        try {
          const payload = JSON.parse(raw) as Partial<InvalidationPayload>;
          if (!payload.tenant_id || !payload.module_key) return;
          this.invalidate(payload.tenant_id, payload.module_key);
        } catch (err) {
          this.logger.warn(`[ai-flags pub/sub] malformed payload: ${(err as Error).message}`);
        }
      });
    } catch (err) {
      // Pub/sub failure must not block the API; per-instance cache still
      // honours the local invalidate() in setFlag, and the 5-min TTL bounds
      // staleness on remote instances.
      this.logger.warn(
        `[ai-flags pub/sub] subscribe failed (continuing without cross-instance invalidation): ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      try {
        await this.subscriber.unsubscribe(INVALIDATION_CHANNEL);
        await this.subscriber.quit();
      } catch (err) {
        this.logger.warn(`[ai-flags pub/sub] shutdown failed: ${(err as Error).message}`);
      }
      this.subscriber = null;
    }
  }

  async list(tenantId: string): Promise<TenantAiFlag[]> {
    const rows = await this.prisma.tenantAiFlag.findMany({
      where: { tenant_id: tenantId },
      orderBy: { module_key: 'asc' },
    });

    const present = new Set(rows.map((row) => row.module_key));
    const missing = WELLBEING_AI_MODULE_KEYS.filter((key) => !present.has(key));

    if (missing.length > 0) {
      // Defensive: impl 01's seed creates all four rows, but a tenant
      // created after the seed shipped without going through the helper
      // could be missing rows. Fill them in lazily so /list always returns
      // the canonical four entries.
      this.logger.warn(
        `Tenant ${tenantId} missing AI flag rows for: ${missing.join(', ')} — backfilling`,
      );
      const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
      await rls.$transaction(async (txClient) => {
        const tx = txClient as unknown as PrismaClient;
        for (const moduleKey of missing) {
          await tx.tenantAiFlag.create({
            data: { tenant_id: tenantId, module_key: moduleKey, enabled: false },
          });
        }
      });
      return this.list(tenantId);
    }

    return rows.map((row) => this.toDto(row));
  }

  async setFlag(
    tenantId: string,
    moduleKey: WellbeingAiModuleKey,
    enabled: boolean,
    byUserId: string,
  ): Promise<TenantAiFlag> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: byUserId });
    const updated = await rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      return tx.tenantAiFlag.upsert({
        where: {
          tenant_id_module_key: { tenant_id: tenantId, module_key: moduleKey },
        },
        update: { enabled, updated_by: byUserId },
        create: {
          tenant_id: tenantId,
          module_key: moduleKey,
          enabled,
          updated_by: byUserId,
        },
      });
    });

    this.cache.delete(this.cacheKey(tenantId, moduleKey));
    // WB-C-03 — fan out invalidation to every other API instance.
    void this.publishInvalidation(tenantId, moduleKey);
    return this.toDto(updated);
  }

  private async publishInvalidation(
    tenantId: string,
    moduleKey: WellbeingAiModuleKey,
  ): Promise<void> {
    try {
      const payload: InvalidationPayload = { tenant_id: tenantId, module_key: moduleKey };
      await this.redis.getClient().publish(INVALIDATION_CHANNEL, JSON.stringify(payload));
    } catch (err) {
      this.logger.warn(`[ai-flags pub/sub] publish failed: ${(err as Error).message}`);
    }
  }

  async isEnabled(tenantId: string, moduleKey: WellbeingAiModuleKey): Promise<boolean> {
    const key = this.cacheKey(tenantId, moduleKey);
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return cached.enabled;
    }

    const row = await this.prisma.tenantAiFlag.findUnique({
      where: {
        tenant_id_module_key: { tenant_id: tenantId, module_key: moduleKey },
      },
      select: { enabled: true },
    });

    const enabled = row?.enabled ?? false;
    this.cache.set(key, { enabled, expiresAt: now + CACHE_TTL_MS });
    return enabled;
  }

  /** Invalidate cache for tests and Wave 5 admin UI hot-reload scenarios. */
  invalidate(tenantId?: string, moduleKey?: WellbeingAiModuleKey): void {
    if (tenantId && moduleKey) {
      this.cache.delete(this.cacheKey(tenantId, moduleKey));
      return;
    }
    if (tenantId) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${tenantId}:`)) this.cache.delete(key);
      }
      return;
    }
    this.cache.clear();
  }

  private cacheKey(tenantId: string, moduleKey: WellbeingAiModuleKey): string {
    return `${tenantId}:${moduleKey}`;
  }

  private toDto(row: {
    id: string;
    tenant_id: string;
    module_key: string;
    enabled: boolean;
    updated_at: Date;
    updated_by: string | null;
  }): TenantAiFlag {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      module_key: row.module_key as WellbeingAiModuleKey,
      enabled: row.enabled,
      updated_at: row.updated_at.toISOString(),
      updated_by: row.updated_by,
    };
  }
}
