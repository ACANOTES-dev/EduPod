import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../modules/prisma/prisma.service';
import { RedisService } from '../../modules/redis/redis.service';

import { PermissionCacheService } from './permission-cache.service';

const MEMBERSHIP_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_MEMBERSHIP_ID = '22222222-2222-4222-8222-222222222222';
const EMPTY_MEMBERSHIP_ID = '33333333-3333-4333-8333-333333333333';
const TENANT_ID = '44444444-4444-4444-8444-444444444444';
const EMPTY_TENANT_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_MEMBERSHIP_ID = '66666666-6666-4666-8666-666666666666';

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
  $transaction: jest.fn(),
  membershipRole: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
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

    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: typeof mockPrisma & { $executeRawUnsafe: jest.Mock }) => Promise<unknown>) =>
        fn({
          ...mockPrisma,
          $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
        }),
    );

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

      const permissions = await service.getPermissions(MEMBERSHIP_ID);

      // DB was queried
      expect(mockPrisma.membershipRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { membership_id: MEMBERSHIP_ID },
        }),
      );

      // Result contains the expected permission keys
      expect(permissions).toEqual(expect.arrayContaining(['users.view', 'users.manage']));
      expect(permissions).toHaveLength(2);

      // setex called with 60-second TTL
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        `permissions:${MEMBERSHIP_ID}`,
        60,
        JSON.stringify(permissions),
      );
    });

    it('should return cached permissions without querying DB on cache hit', async () => {
      const cached = ['users.view', 'users.manage'];
      mockRedisClient.get.mockResolvedValue(JSON.stringify(cached));

      const permissions = await service.getPermissions(MEMBERSHIP_ID);

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

      const permissions = await service.getPermissions(SECOND_MEMBERSHIP_ID);

      // 'users.view' appears in both roles but should only be present once
      const viewCount = permissions.filter((p) => p === 'users.view').length;
      expect(viewCount).toBe(1);
      expect(permissions).toHaveLength(3);
      expect(permissions).toEqual(
        expect.arrayContaining(['users.view', 'users.manage', 'payroll.view']),
      );
    });

    it('should return empty array when membership has no roles', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPrisma.membershipRole.findMany.mockResolvedValue([]);

      const permissions = await service.getPermissions(EMPTY_MEMBERSHIP_ID);

      expect(permissions).toEqual([]);
      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        `permissions:${EMPTY_MEMBERSHIP_ID}`,
        60,
        JSON.stringify([]),
      );
    });
  });

  describe('isOwner', () => {
    it('should return true and cache the result when membership holds the school_owner role', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPrisma.membershipRole.findFirst = jest
        .fn()
        .mockResolvedValue({ role_id: 'role-owner-id' });

      const result = await service.isOwner(MEMBERSHIP_ID);

      expect(result).toBe(true);
      expect(mockRedisClient.setex).toHaveBeenCalledWith(`owner:${MEMBERSHIP_ID}`, 300, '1');
    });

    it('should return false and cache the result when membership does not hold the school_owner role', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPrisma.membershipRole.findFirst = jest.fn().mockResolvedValue(null);

      const result = await service.isOwner(MEMBERSHIP_ID);

      expect(result).toBe(false);
      expect(mockRedisClient.setex).toHaveBeenCalledWith(`owner:${MEMBERSHIP_ID}`, 300, '0');
    });

    it('should return true from cache without querying the DB on cache hit', async () => {
      mockRedisClient.get.mockResolvedValue('1');

      const result = await service.isOwner(MEMBERSHIP_ID);

      expect(result).toBe(true);
      expect(mockPrisma.membershipRole.findFirst).not.toHaveBeenCalled();
      expect(mockRedisClient.setex).not.toHaveBeenCalled();
    });

    it('should return false from cache without querying the DB on cache hit', async () => {
      mockRedisClient.get.mockResolvedValue('0');

      const result = await service.isOwner(SECOND_MEMBERSHIP_ID);

      expect(result).toBe(false);
      expect(mockPrisma.membershipRole.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('invalidate', () => {
    it('should delete both cache keys for the given membership via pipeline', async () => {
      await service.invalidate(MEMBERSHIP_ID);

      expect(mockRedisClient.pipeline).toHaveBeenCalled();
      expect(mockPipelineInstance.del).toHaveBeenCalledWith(`permissions:${MEMBERSHIP_ID}`);
      expect(mockPipelineInstance.del).toHaveBeenCalledWith(`owner:${MEMBERSHIP_ID}`);
      expect(mockPipelineInstance.exec).toHaveBeenCalled();
    });

    it('should use the correct cache key format', async () => {
      await service.invalidate(OTHER_MEMBERSHIP_ID);

      expect(mockPipelineInstance.del).toHaveBeenCalledWith(`permissions:${OTHER_MEMBERSHIP_ID}`);
      expect(mockPipelineInstance.del).toHaveBeenCalledWith(`owner:${OTHER_MEMBERSHIP_ID}`);
    });
  });

  describe('invalidateAllForTenant', () => {
    it('should invalidate cache for all memberships in the tenant via pipeline', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValue([
        { id: '77777777-7777-4777-8777-777777777777' },
        { id: '88888888-8888-4888-8888-888888888888' },
        { id: '99999999-9999-4999-8999-999999999999' },
      ]);

      await service.invalidateAllForTenant(TENANT_ID);

      // Queried memberships for the right tenant
      expect(mockPrisma.tenantMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
          select: { id: true },
        }),
      );

      // Pipeline del called twice per membership (permissions: + owner:)
      expect(mockPipelineInstance.del).toHaveBeenCalledTimes(6);
      expect(mockPipelineInstance.del).toHaveBeenCalledWith(
        'permissions:77777777-7777-4777-8777-777777777777',
      );
      expect(mockPipelineInstance.del).toHaveBeenCalledWith(
        'owner:77777777-7777-4777-8777-777777777777',
      );
      expect(mockPipelineInstance.del).toHaveBeenCalledWith(
        'permissions:88888888-8888-4888-8888-888888888888',
      );
      expect(mockPipelineInstance.del).toHaveBeenCalledWith(
        'owner:88888888-8888-4888-8888-888888888888',
      );
      expect(mockPipelineInstance.del).toHaveBeenCalledWith(
        'permissions:99999999-9999-4999-8999-999999999999',
      );
      expect(mockPipelineInstance.del).toHaveBeenCalledWith(
        'owner:99999999-9999-4999-8999-999999999999',
      );

      // Pipeline executed
      expect(mockPipelineInstance.exec).toHaveBeenCalled();
    });

    it('should do nothing (exec with empty pipeline) when tenant has no memberships', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);

      await service.invalidateAllForTenant(EMPTY_TENANT_ID);

      expect(mockPipelineInstance.del).not.toHaveBeenCalled();
      expect(mockPipelineInstance.exec).toHaveBeenCalled();
    });
  });
});
