import { Injectable } from '@nestjs/common';
import type Redis from 'ioredis';

import { MODULE_KEYS_ARRAY, type CacheFlushDto, isModuleKey } from '@school/shared';

import { runWithRlsContext } from '../../common/middleware/rls.middleware';
import { TenantModuleCacheBusService } from '../../common/services/tenant-module-cache-bus.service';
import { TenantModuleService } from '../../common/services/tenant-module.service';
import type { PlatformAuditContext } from '../platform-audit/platform-audit.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface CacheStat {
  cache_type: 'permissions' | 'domains' | 'modules' | 'platform_owner' | 'sessions';
  key_count: number;
}

@Injectable()
export class PlatformCacheService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tenantModuleService: TenantModuleService,
    private readonly tenantModuleCacheBusService: TenantModuleCacheBusService,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  async getCacheStats(): Promise<CacheStat[]> {
    const client = this.redis.getClient();
    const [permissions, domains, modules, platformOwner, sessions] = await Promise.all([
      countKeys(client, 'permissions:*'),
      countKeys(client, 'tenant_domain:*'),
      countKeys(client, 'tenant_modules:*'),
      countKeys(client, 'is_platform_owner:*'),
      countKeys(client, 'session:*'),
    ]);

    return [
      { cache_type: 'permissions', key_count: permissions },
      { cache_type: 'domains', key_count: domains },
      { cache_type: 'modules', key_count: modules },
      { cache_type: 'platform_owner', key_count: platformOwner },
      { cache_type: 'sessions', key_count: sessions },
    ];
  }

  async flushCache(
    scope: CacheFlushDto,
    audit?: PlatformAuditContext,
  ): Promise<{ keys_deleted: number }> {
    const keysDeleted = scope.tenant_id
      ? await this.flushTenantCache(scope.tenant_id, scope.cache_type)
      : await this.flushGlobalCache(scope.cache_type);

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: scope.tenant_id ? 'cache_flushed_tenant' : 'cache_flushed_global',
        target_resource_type: 'cache',
        target_resource_id: scope.cache_type,
        target_tenant_id: scope.tenant_id,
        payload: { after: { keys_deleted: keysDeleted }, extra: scope },
      });
    }

    return { keys_deleted: keysDeleted };
  }

  private async flushTenantCache(
    tenantId: string,
    cacheType: CacheFlushDto['cache_type'],
  ): Promise<number> {
    const tasks: Array<Promise<number>> = [];
    if (cacheType === 'permissions' || cacheType === 'all') {
      tasks.push(this.flushTenantPermissions(tenantId));
    }
    if (cacheType === 'domains' || cacheType === 'all') {
      tasks.push(this.flushTenantDomains(tenantId));
    }
    if (cacheType === 'modules' || cacheType === 'all') {
      tasks.push(this.flushTenantModules(tenantId));
    }

    const counts = await Promise.all(tasks);
    return counts.reduce((total, count) => total + count, 0);
  }

  private async flushGlobalCache(cacheType: CacheFlushDto['cache_type']): Promise<number> {
    const tasks: Array<Promise<number>> = [];
    if (cacheType === 'permissions' || cacheType === 'all') {
      tasks.push(deletePattern(this.redis.getClient(), 'permissions:*'));
    }
    if (cacheType === 'domains' || cacheType === 'all') {
      tasks.push(deletePattern(this.redis.getClient(), 'tenant_domain:*'));
    }
    if (cacheType === 'modules' || cacheType === 'all') {
      tasks.push(this.flushAllTenantModules());
    }

    const counts = await Promise.all(tasks);
    return counts.reduce((total, count) => total + count, 0);
  }

  private async flushTenantPermissions(tenantId: string): Promise<number> {
    const memberships = await runWithRlsContext(this.prisma, { tenant_id: tenantId }, async (tx) =>
      tx.tenantMembership.findMany({
        where: { tenant_id: tenantId },
        select: { id: true },
      }),
    );
    if (memberships.length === 0) return 0;

    const client = this.redis.getClient();
    const keys = memberships.flatMap((membership) => [
      `permissions:${membership.id}`,
      `owner:${membership.id}`,
    ]);
    return client.del(...keys);
  }

  private async flushTenantDomains(tenantId: string): Promise<number> {
    const domains = await runWithRlsContext(this.prisma, { tenant_id: tenantId }, async (tx) =>
      tx.tenantDomain.findMany({
        where: { tenant_id: tenantId },
        select: { domain: true },
      }),
    );
    if (domains.length === 0) return 0;

    return this.redis.getClient().del(...domains.map((domain) => `tenant_domain:${domain.domain}`));
  }

  private async flushTenantModules(tenantId: string): Promise<number> {
    const [moduleRows, existed] = await Promise.all([
      runWithRlsContext(this.prisma, { tenant_id: tenantId }, async (tx) =>
        tx.tenantModule.findMany({
          where: { tenant_id: tenantId },
          select: { is_enabled: true, module_key: true },
        }),
      ),
      this.redis.getClient().exists(`tenant_modules:${tenantId}`),
    ]);

    await this.tenantModuleService.invalidateCache(tenantId);
    for (const row of moduleRows) {
      if (isModuleKey(row.module_key)) {
        await this.tenantModuleCacheBusService.publishInvalidation(
          tenantId,
          row.module_key,
          row.is_enabled,
        );
      }
    }

    return existed;
  }

  private async flushAllTenantModules(): Promise<number> {
    const keys = await scanKeys(this.redis.getClient(), 'tenant_modules:*');
    const tenantIds = keys
      .map((key) => key.replace(/^tenant_modules:/, ''))
      .filter((tenantId) => tenantId.length > 0);
    if (tenantIds.length === 0) return 0;

    const uniqueTenantIds = [...new Set(tenantIds)];
    for (const tenantId of uniqueTenantIds) {
      await this.tenantModuleService.invalidateCache(tenantId);
      for (const moduleKey of MODULE_KEYS_ARRAY) {
        await this.tenantModuleCacheBusService.publishInvalidation(tenantId, moduleKey, false);
      }
    }
    return keys.length;
  }
}

async function countKeys(client: Redis, pattern: string): Promise<number> {
  return (await scanKeys(client, pattern)).length;
}

async function deletePattern(client: Redis, pattern: string): Promise<number> {
  let deleted = 0;
  const keys = await scanKeys(client, pattern);
  for (let index = 0; index < keys.length; index += 200) {
    deleted += await client.del(...keys.slice(index, index + 200));
  }
  return deleted;
}

async function scanKeys(client: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, batch] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}
