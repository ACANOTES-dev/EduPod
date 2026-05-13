import { MODULE_KEYS_ARRAY } from '@school/shared/modules';

import { TenantModuleService } from './tenant-module.service';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';

function buildService({
  cached,
  rows = [],
  allRows = [],
}: {
  cached?: string | null;
  rows?: Array<{ module_key: string }>;
  allRows?: Array<{ module_key: string }>;
} = {}) {
  const redis = {
    del: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(cached ?? null),
    setex: jest.fn().mockResolvedValue('OK'),
  };
  const prisma = {
    tenantModule: {
      findMany: jest.fn().mockImplementation(async (args: { where: { is_enabled?: boolean } }) => {
        return args.where.is_enabled === true ? rows : allRows;
      }),
    },
  };

  return {
    prisma,
    redis,
    service: new TenantModuleService(prisma as never, redis as never),
  };
}

describe('TenantModuleService', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns canonical keys from cache hits', async () => {
    const { prisma, redis, service } = buildService({
      cached: JSON.stringify(['gradebook', 'legacy_key', 'sen']),
    });

    await expect(service.getEnabledModules(TENANT_ID)).resolves.toEqual(['gradebook', 'sen']);
    expect(prisma.tenantModule.findMany).not.toHaveBeenCalled();
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it('reads from DB on cache miss and re-caches canonical keys', async () => {
    const { prisma, redis, service } = buildService({
      rows: [{ module_key: 'sen' }, { module_key: 'legacy_key' }, { module_key: 'gradebook' }],
    });

    await expect(service.getEnabledModules(TENANT_ID)).resolves.toEqual(['gradebook', 'sen']);
    expect(prisma.tenantModule.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, is_enabled: true },
      select: { module_key: true },
    });
    expect(redis.setex).toHaveBeenCalledWith(
      `tenant_modules:${TENANT_ID}`,
      300,
      JSON.stringify(['gradebook', 'sen']),
    );
  });

  it('returns true or false from isEnabled', async () => {
    const { service } = buildService({
      cached: JSON.stringify(['gradebook']),
    });

    await expect(service.isEnabled(TENANT_ID, 'gradebook')).resolves.toBe(true);
    await expect(service.isEnabled(TENANT_ID, 'sen')).resolves.toBe(false);
  });

  it('deletes the tenant cache key', async () => {
    const { redis, service } = buildService();

    await service.invalidateCache(TENANT_ID);

    expect(redis.del).toHaveBeenCalledWith(`tenant_modules:${TENANT_ID}`);
  });

  it('reports missing registry rows from assertCompleteness', async () => {
    const present = MODULE_KEYS_ARRAY.filter((key) => key !== 'sen').map((module_key) => ({
      module_key,
    }));
    const { service } = buildService({ allRows: present });

    await expect(service.assertCompleteness(TENANT_ID)).resolves.toEqual({
      complete: false,
      missing: ['sen'],
    });
  });
});
