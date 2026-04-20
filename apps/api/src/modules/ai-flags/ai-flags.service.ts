import { Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import {
  WELLBEING_AI_MODULE_KEYS,
  type TenantAiFlag,
  type WellbeingAiModuleKey,
} from '@school/shared/wellbeing';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  enabled: boolean;
  expiresAt: number;
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
export class AiFlagsService {
  private readonly logger = new Logger(AiFlagsService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

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
    return this.toDto(updated);
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
