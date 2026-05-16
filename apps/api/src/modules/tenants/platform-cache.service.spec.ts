import { TenantModuleCacheBusService } from '../../common/services/tenant-module-cache-bus.service';
import { TenantModuleService } from '../../common/services/tenant-module.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { PlatformCacheService } from './platform-cache.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  runWithRlsContext: jest.fn((prisma, _context, fn) => fn(prisma)),
}));

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const MEMBERSHIP_ID = '22222222-2222-4222-8222-222222222222';

function buildRedis() {
  const keys = [
    `permissions:${MEMBERSHIP_ID}`,
    `owner:${MEMBERSHIP_ID}`,
    'tenant_domain:school.example.test',
    `tenant_modules:${TENANT_ID}`,
    'is_platform_owner:admin',
    'session:abc',
  ];
  const deleted = new Set<string>();

  return {
    del: jest.fn((...deleteKeys: string[]) => {
      for (const key of deleteKeys) deleted.add(key);
      return Promise.resolve(deleteKeys.length);
    }),
    exists: jest.fn().mockResolvedValue(1),
    scan: jest.fn((_cursor: string, _match: string, pattern: string) =>
      Promise.resolve([
        '0',
        keys.filter((key) => {
          const prefix = pattern.replace('*', '');
          return key.startsWith(prefix);
        }),
      ]),
    ),
  };
}

function buildPrisma() {
  return {
    tenantDomain: {
      findMany: jest.fn().mockResolvedValue([{ domain: 'school.example.test' }]),
    },
    tenantMembership: {
      findMany: jest.fn().mockResolvedValue([{ id: MEMBERSHIP_ID }]),
    },
    tenantModule: {
      findMany: jest.fn().mockResolvedValue([{ is_enabled: true, module_key: 'finance' }]),
    },
  };
}

describe('PlatformCacheService', () => {
  let platformAuditService: jest.Mocked<Pick<PlatformAuditService, 'log'>>;
  let prisma: ReturnType<typeof buildPrisma>;
  let redis: ReturnType<typeof buildRedis>;
  let service: PlatformCacheService;
  let tenantModuleCacheBusService: jest.Mocked<
    Pick<TenantModuleCacheBusService, 'publishInvalidation'>
  >;
  let tenantModuleService: jest.Mocked<Pick<TenantModuleService, 'invalidateCache'>>;

  beforeEach(() => {
    prisma = buildPrisma();
    redis = buildRedis();
    tenantModuleService = { invalidateCache: jest.fn().mockResolvedValue(undefined) };
    tenantModuleCacheBusService = { publishInvalidation: jest.fn().mockResolvedValue(undefined) };
    platformAuditService = { log: jest.fn().mockResolvedValue(undefined) };
    service = new PlatformCacheService(
      prisma as unknown as PrismaService,
      { getClient: () => redis } as unknown as RedisService,
      tenantModuleService as unknown as TenantModuleService,
      tenantModuleCacheBusService as unknown as TenantModuleCacheBusService,
      platformAuditService as unknown as PlatformAuditService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('counts Redis cache keys using SCAN patterns', async () => {
    const stats = await service.getCacheStats();

    expect(redis.scan).toHaveBeenCalledWith('0', 'MATCH', 'permissions:*', 'COUNT', 200);
    expect(redis.scan).toHaveBeenCalledWith('0', 'MATCH', 'tenant_domain:*', 'COUNT', 200);
    expect(stats).toEqual(
      expect.arrayContaining([
        { cache_type: 'permissions', key_count: 1 },
        { cache_type: 'domains', key_count: 1 },
        { cache_type: 'modules', key_count: 1 },
      ]),
    );
  });

  it('flushes tenant caches and publishes module invalidation', async () => {
    const result = await service.flushCache(
      { cache_type: 'all', tenant_id: TENANT_ID },
      { actor_user_id: 'admin' },
    );

    expect(result).toEqual({ keys_deleted: 4 });
    expect(redis.del).toHaveBeenCalledWith(
      `permissions:${MEMBERSHIP_ID}`,
      `owner:${MEMBERSHIP_ID}`,
    );
    expect(redis.del).toHaveBeenCalledWith('tenant_domain:school.example.test');
    expect(tenantModuleService.invalidateCache).toHaveBeenCalledWith(TENANT_ID);
    expect(tenantModuleCacheBusService.publishInvalidation).toHaveBeenCalledWith(
      TENANT_ID,
      'finance',
      true,
    );
    expect(platformAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'cache_flushed_tenant', target_tenant_id: TENANT_ID }),
    );
  });
});
