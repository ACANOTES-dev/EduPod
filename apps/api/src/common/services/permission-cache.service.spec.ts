import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../modules/prisma/prisma.service';
import { RedisService } from '../../modules/redis/redis.service';

import { PermissionCacheService } from './permission-cache.service';

const mockPipelineInstance = {
  del: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

const mockRedisClient = {
  get: jest.fn(),
  setex: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  pipeline: jest.fn().mockReturnValue(mockPipelineInstance),
};

const mockPrisma = {
  membershipRole: {
    findMany: jest.fn(),
  },
  tenantMembership: {
    findMany: jest.fn(),
  },
};

const membershipRolesWithPermissions = [
  {
    role: {
      role_permissions: [
        { permission: { permission_key: 'users.view' } },
        { permission: { permission_key: 'users.manage' } },
      ],
    },
  },
];

describe('PermissionCacheService', () => {
  let service: PermissionCacheService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Re-attach pipeline mock after clearAllMocks
    mockRedisClient.pipeline.mockReturnValue(mockPipelineInstance);
    mockPipelineInstance.del.mockReturnThis();
    mockPipelineInstance.exec.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionCacheService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: RedisService,
          useValue: { getClient: jest.fn().mockReturnValue(mockRedisClient) },
        },
      ],
    }).compile();

    service = module.get<PermissionCacheService>(PermissionCacheService);
  });

  describe('getPermissions', () => {
    it('should cache permissions in Redis when cache is cold', async () => {
      // Cache miss
      mockRedisClient.get.mockResolvedValue(null);
      mockPrisma.membershipRole.findMany.mockResolvedValue(membershipRolesWithPermissions);

      const permissions = await service.getPermissions('membership-1');

      // DB was queried
      expect(mockPrisma.membershipRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { membership_id: 'membership-1' },
        }),
      );

      // Result contains the expected permission keys
      expect(permissions).toEqual(expect.arrayContaining(['users.view', 'users.manage']));
      expect(permissions).toHaveLength(2);

      // setex called with 60-second TTL
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'permissions:membership-1',
        60,
        JSON.stringify(permissions),
      );
    });

    it('should return cached permissions without querying DB on cache hit', async () => {
      const cached = ['users.view', 'users.manage'];
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cached));

      const permissions = await service.getPermissions('membership-1');

      // Returned cached data
      expect(permissions).toEqual(cached);

      // DB was NOT queried
      expect(mockPrisma.membershipRole.findMany).not.toHaveBeenCalled();

      // setex was NOT called (no need to re-cache)
      expect(mockRedisClient.setex).not.toHaveBeenCalled();
    });

    it('should deduplicate permissions from multiple roles', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPrisma.membershipRole.findMany.mockResolvedValue([
        {
          role: {
            role_permissions: [
              { permission: { permission_key: 'users.view' } },
              { permission: { permission_key: 'users.manage' } },
            ],
          },
        },
        {
          role: {
            role_permissions: [
              // Duplicate — should be deduplicated
              { permission: { permission_key: 'users.view' } },
              { permission: { permission_key: 'payroll.view' } },
            ],
          },
        },
      ]);

      const permissions = await service.getPermissions('membership-2');

      // 'users.view' appears in both roles but should only be present once
      const viewCount = permissions.filter((p) => p === 'users.view').length;
      expect(viewCount).toBe(1);
      expect(permissions).toHaveLength(3);
      expect(permissions).toEqual(expect.arrayContaining(['users.view', 'users.manage', 'payroll.view']));
    });

    it('should return empty array when membership has no roles', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPrisma.membershipRole.findMany.mockResolvedValue([]);

      const permissions = await service.getPermissions('membership-no-roles');

      expect(permissions).toEqual([]);
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        'permissions:membership-no-roles',
        60,
        JSON.stringify([]),
      );
    });
  });

  describe('invalidate', () => {
    it('should delete the Redis cache key for the given membership', async () => {
      await service.invalidate('membership-1');

      expect(mockRedisClient.del).toHaveBeenCalledWith('permissions:membership-1');
    });

    it('should use the correct cache key format', async () => {
      await service.invalidate('some-uuid-here');

      expect(mockRedisClient.del).toHaveBeenCalledWith('permissions:some-uuid-here');
    });
  });

  describe('invalidateAllForTenant', () => {
    it('should invalidate cache for all memberships in the tenant via pipeline', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValue([
        { id: 'membership-a' },
        { id: 'membership-b' },
        { id: 'membership-c' },
      ]);

      await service.invalidateAllForTenant('tenant-1');

      // Queried memberships for the right tenant
      expect(mockPrisma.tenantMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: 'tenant-1' },
          select: { id: true },
        }),
      );

      // Pipeline del called once per membership
      expect(mockPipelineInstance.del).toHaveBeenCalledTimes(3);
      expect(mockPipelineInstance.del).toHaveBeenCalledWith('permissions:membership-a');
      expect(mockPipelineInstance.del).toHaveBeenCalledWith('permissions:membership-b');
      expect(mockPipelineInstance.del).toHaveBeenCalledWith('permissions:membership-c');

      // Pipeline executed
      expect(mockPipelineInstance.exec).toHaveBeenCalled();
    });

    it('should do nothing (exec with empty pipeline) when tenant has no memberships', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);

      await service.invalidateAllForTenant('empty-tenant');

      expect(mockPipelineInstance.del).not.toHaveBeenCalled();
      expect(mockPipelineInstance.exec).toHaveBeenCalled();
    });
  });
});
