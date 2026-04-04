import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { SecurityAuditService } from '../audit-log/security-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { MembershipsService } from './memberships.service';

const TENANT_ID = 'tenant-aaa';
const USER_ID = 'user-bbb';
const MEMBERSHIP_ID = 'membership-ccc';

// A membership object for a school_owner, as returned by tenantMembership.findFirst
// with membership_roles included (matching the actual query shape in suspendMembership)
const ownerMembership = {
  id: MEMBERSHIP_ID,
  tenant_id: TENANT_ID,
  user_id: USER_ID,
  membership_status: 'active',
  membership_roles: [
    {
      role: {
        id: 'role-owner',
        role_key: 'school_principal',
        display_name: 'School Owner',
        role_tier: 'admin',
        is_system_role: true,
      },
    },
  ],
};

// Same membership but after the suspend update, returned by the getUser call
const ownerMembershipFull = {
  ...ownerMembership,
  user: {
    id: USER_ID,
    email: 'owner@school.com',
    first_name: 'Alice',
    last_name: 'Smith',
    phone: null,
    global_status: 'active',
    last_login_at: null,
    created_at: new Date().toISOString(),
  },
};

const mockRedisClient = {
  smembers: jest.fn().mockResolvedValue([]),
  del: jest.fn().mockResolvedValue(1),
};

const mockRedis = {
  getClient: jest.fn().mockReturnValue(mockRedisClient),
};

const mockPermissionCacheService = {
  invalidateAllForTenant: jest.fn().mockResolvedValue(undefined),
  invalidate: jest.fn().mockResolvedValue(undefined),
};

const mockSecurityAuditService = {
  logUserStatusChange: jest.fn().mockResolvedValue(undefined),
  logMembershipRoleChange: jest.fn().mockResolvedValue(undefined),
};

const mockPrisma = {
  tenantMembership: {
    findFirst: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  membershipRole: {
    count: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  role: {
    findMany: jest.fn(),
  },
};

describe('MembershipsService', () => {
  let service: MembershipsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Keep redis client mock stable across clear
    mockRedis.getClient.mockReturnValue(mockRedisClient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
        { provide: SecurityAuditService, useValue: mockSecurityAuditService },
      ],
    }).compile();

    service = module.get<MembershipsService>(MembershipsService);
  });

  // ─── suspendMembership ──────────────────────────────────────────────────────

  describe('suspendMembership', () => {
    it('should prevent suspending any school_owner account', async () => {
      const schoolOwnerMembership = {
        id: MEMBERSHIP_ID,
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        membership_status: 'active',
        membership_roles: [
          {
            role: {
              id: 'role-so',
              role_key: 'school_owner',
              display_name: 'School Owner',
              role_tier: 'platform',
              is_system_role: true,
            },
          },
        ],
      };
      mockPrisma.tenantMembership.findFirst.mockResolvedValueOnce(schoolOwnerMembership);

      let caught: unknown;
      try {
        await service.suspendMembership(TENANT_ID, USER_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect(caught).toMatchObject({ response: { code: expect.any(String) } });
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'SCHOOL_OWNER_PROTECTED',
      });
      expect(mockPrisma.tenantMembership.update).not.toHaveBeenCalled();
    });

    it('should prevent suspending the last school_principal', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValueOnce(ownerMembership);
      mockPrisma.membershipRole.count.mockResolvedValueOnce(1);

      let caught: unknown;
      try {
        await service.suspendMembership(TENANT_ID, USER_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect(caught).toMatchObject({ response: { code: expect.any(String) } });
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'LAST_SCHOOL_PRINCIPAL',
      });

      expect(mockPrisma.membershipRole.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          role: { role_key: 'school_principal' },
          membership: { membership_status: 'active' },
        },
      });
      expect(mockPrisma.tenantMembership.update).not.toHaveBeenCalled();
    });

    it('should allow suspending an owner when multiple owners exist', async () => {
      // Two calls to findFirst: one in suspendMembership, one in getUser at the end
      mockPrisma.tenantMembership.findFirst
        .mockResolvedValueOnce(ownerMembership) // suspendMembership lookup
        .mockResolvedValueOnce(ownerMembershipFull); // getUser lookup after suspend

      // Two active owners exist — safe to suspend this one
      mockPrisma.membershipRole.count.mockResolvedValueOnce(2);

      mockPrisma.tenantMembership.update.mockResolvedValueOnce({
        ...ownerMembership,
        membership_status: 'suspended',
      });

      // Redis session cleanup: no sessions to delete
      mockRedisClient.smembers.mockResolvedValueOnce([]);

      const result = await service.suspendMembership(TENANT_ID, USER_ID);

      expect(mockPrisma.tenantMembership.update).toHaveBeenCalledWith({
        where: { id: MEMBERSHIP_ID },
        data: { membership_status: 'suspended' },
      });
      expect(mockPermissionCacheService.invalidate).toHaveBeenCalledWith(MEMBERSHIP_ID);
      expect(result).toEqual(ownerMembershipFull);
    });

    it('should throw NotFoundException when membership does not exist', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.suspendMembership(TENANT_ID, USER_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect(caught).toMatchObject({ response: { code: expect.any(String) } });
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'MEMBERSHIP_NOT_FOUND',
      });
    });

    it('should throw BadRequestException when membership is already suspended', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValueOnce({
        ...ownerMembership,
        membership_status: 'suspended',
      });

      let caught: unknown;
      try {
        await service.suspendMembership(TENANT_ID, USER_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect(caught).toMatchObject({ response: { code: expect.any(String) } });
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'ALREADY_SUSPENDED',
      });
    });

    it('should clear Redis sessions for the user on successful suspend', async () => {
      const SESSION_ID = 'session-xyz';

      mockPrisma.tenantMembership.findFirst
        .mockResolvedValueOnce({
          // Non-owner membership so the last-owner guard is never triggered
          id: MEMBERSHIP_ID,
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          membership_status: 'active',
          membership_roles: [
            {
              role: {
                id: 'role-staff',
                role_key: 'custom_staff',
                role_tier: 'staff',
                is_system_role: false,
              },
            },
          ],
        })
        .mockResolvedValueOnce(ownerMembershipFull); // getUser at end

      mockPrisma.tenantMembership.update.mockResolvedValueOnce({});

      // Simulate one active session in Redis
      mockRedisClient.smembers.mockResolvedValueOnce([SESSION_ID]);
      mockRedisClient.del.mockResolvedValue(1);

      await service.suspendMembership(TENANT_ID, USER_ID);

      // del called for the session key, then for the user_sessions set
      expect(mockRedisClient.del).toHaveBeenCalledWith(`session:${SESSION_ID}`);
      expect(mockRedisClient.del).toHaveBeenCalledWith(`user_sessions:${USER_ID}`);
    });
  });

  // ─── reactivateMembership ───────────────────────────────────────────────────

  describe('reactivateMembership', () => {
    it('should reactivate a suspended membership', async () => {
      const suspendedMembership = {
        id: MEMBERSHIP_ID,
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        membership_status: 'suspended',
      };

      mockPrisma.tenantMembership.findFirst
        .mockResolvedValueOnce(suspendedMembership) // reactivateMembership lookup
        .mockResolvedValueOnce(ownerMembershipFull); // getUser at end

      mockPrisma.tenantMembership.update.mockResolvedValueOnce({
        ...suspendedMembership,
        membership_status: 'active',
      });

      const result = await service.reactivateMembership(TENANT_ID, USER_ID);

      expect(mockPrisma.tenantMembership.update).toHaveBeenCalledWith({
        where: { id: MEMBERSHIP_ID },
        data: { membership_status: 'active' },
      });
      expect(result).toEqual(ownerMembershipFull);
      expect(mockPermissionCacheService.invalidate).toHaveBeenCalledWith(MEMBERSHIP_ID);
    });

    it('should throw BadRequestException when membership is not suspended', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValueOnce({
        id: MEMBERSHIP_ID,
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        membership_status: 'active',
      });

      let caught: unknown;
      try {
        await service.reactivateMembership(TENANT_ID, USER_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect(caught).toMatchObject({ response: { code: expect.any(String) } });
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'NOT_SUSPENDED',
      });
    });

    it('should throw NotFoundException when membership does not exist', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.reactivateMembership(TENANT_ID, USER_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect(caught).toMatchObject({ response: { code: expect.any(String) } });
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'MEMBERSHIP_NOT_FOUND',
      });
    });
  });
});
