import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';

import { MODULE_KEYS_ARRAY, isModuleKey } from '@school/shared/modules';
import type { ModuleKey } from '@school/shared/modules';

import type { PrismaService } from '../../modules/prisma/prisma.service';
import type { RedisService } from '../../modules/redis/redis.service';

export const TENANT_MODULE_PRISMA_CLIENT = 'TENANT_MODULE_PRISMA_CLIENT';
export const TENANT_MODULE_REDIS_CLIENT = 'TENANT_MODULE_REDIS_CLIENT';

type TenantModulePrismaClient = Pick<PrismaClient, 'tenantModule'> | PrismaService;
type TenantModuleRedisClient = Pick<Redis, 'del' | 'get' | 'setex'> | RedisService;

interface TenantModuleRow {
  id?: string;
  tenant_id?: string;
  module_key: string;
  is_enabled?: boolean;
}

function hasRedisGetClient(value: TenantModuleRedisClient): value is RedisService {
  return typeof (value as RedisService).getClient === 'function';
}

@Injectable()
export class TenantModuleService {
  static readonly CACHE_PREFIX = 'tenant_modules:';
  static readonly CACHE_TTL_SECONDS = 5 * 60;

  constructor(
    @Inject(TENANT_MODULE_PRISMA_CLIENT)
    private readonly prisma: TenantModulePrismaClient,
    @Inject(TENANT_MODULE_REDIS_CLIENT)
    private readonly redis: TenantModuleRedisClient,
  ) {}

  /**
   * Returns enabled module keys for a tenant, cached for five minutes.
   *
   * SAFETY: a key absent from this list is treated as disabled. That includes
   * missing tenant_modules rows. Module Gating implementation 02 backfills
   * every tenant x registry key before enforcement ships, so missing rows are
   * intentionally default-deny and indicate data drift.
   */
  async getEnabledModules(tenantId: string): Promise<ModuleKey[]> {
    const cacheKey = this.cacheKey(tenantId);
    const cached = await this.getRedisClient().get(cacheKey);
    if (cached) {
      return this.parseCachedModules(cached);
    }

    const rows = await this.prisma.tenantModule.findMany({
      where: { tenant_id: tenantId, is_enabled: true },
      select: { module_key: true },
    });
    const modules = this.normaliseModuleRows(rows);

    await this.getRedisClient().setex(
      cacheKey,
      TenantModuleService.CACHE_TTL_SECONDS,
      JSON.stringify(modules),
    );

    return modules;
  }

  async isEnabled(tenantId: string, key: ModuleKey): Promise<boolean> {
    const enabledModules = await this.getEnabledModules(tenantId);
    return enabledModules.includes(key);
  }

  async getModuleRows(tenantId: string): Promise<
    Array<{
      id: string;
      tenant_id: string;
      module_key: string;
      is_enabled: boolean;
    }>
  > {
    return this.prisma.tenantModule.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, tenant_id: true, module_key: true, is_enabled: true },
      orderBy: { module_key: 'asc' },
    });
  }

  async invalidateCache(tenantId: string): Promise<void> {
    await this.getRedisClient().del(this.cacheKey(tenantId));
  }

  async assertCompleteness(tenantId: string): Promise<{ complete: boolean; missing: ModuleKey[] }> {
    const rows = await this.prisma.tenantModule.findMany({
      where: { tenant_id: tenantId },
      select: { module_key: true },
    });
    const present = new Set(rows.map((row) => row.module_key));
    const missing = MODULE_KEYS_ARRAY.filter((key) => !present.has(key));

    return { complete: missing.length === 0, missing };
  }

  private cacheKey(tenantId: string): string {
    return `${TenantModuleService.CACHE_PREFIX}${tenantId}`;
  }

  private getRedisClient(): Pick<Redis, 'del' | 'get' | 'setex'> {
    return hasRedisGetClient(this.redis) ? this.redis.getClient() : this.redis;
  }

  private normaliseModuleRows(rows: TenantModuleRow[]): ModuleKey[] {
    return rows
      .map((row) => row.module_key)
      .filter(isModuleKey)
      .sort((a, b) => a.localeCompare(b));
  }

  private parseCachedModules(cached: string): ModuleKey[] {
    try {
      const parsed = JSON.parse(cached) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((value): value is ModuleKey => {
        return typeof value === 'string' && isModuleKey(value);
      });
    } catch {
      return [];
    }
  }
}
