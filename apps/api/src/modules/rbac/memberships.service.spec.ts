/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { createRlsClient } from '../../common/middleware/rls.middleware';
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

const mockCreateRlsClient = createRlsClient as jest.Mock;

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

    it('should log security audit when actorUserId is provided', async () => {
      const suspendedMembership = {
        id: MEMBERSHIP_ID,
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        membership_status: 'suspended',
      };

      mockPrisma.tenantMembership.findFirst
        .mockResolvedValueOnce(suspendedMembership)
        .mockResolvedValueOnce(ownerMembershipFull);

      mockPrisma.tenantMembership.update.mockResolvedValueOnce({
        ...suspendedMembership,
        membership_status: 'active',
      });

      await service.reactivateMembership(TENANT_ID, USER_ID, 'actor-123');

      expect(mockSecurityAuditService.logUserStatusChange).toHaveBeenCalledWith(
        TENANT_ID,
        'actor-123',
        USER_ID,
        'active',
      );
    });
  });

  // ─── listUsers ─────────────────────────────────────────────────────────────

  describe('listUsers', () => {
    it('should list users with default parameters (no filters)', async () => {
      const memberships = [
        {
          id: MEMBERSHIP_ID,
          user: { id: USER_ID, email: 'a@b.com', first_name: 'A', last_name: 'B' },
          membership_roles: [],
        },
      ];
      mockPrisma.tenantMembership.findMany.mockResolvedValue(memberships);
      mockPrisma.tenantMembership.count.mockResolvedValue(1);

      const result = await service.listUsers(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toEqual(memberships);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should apply status filter when provided', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);
      mockPrisma.tenantMembership.count.mockResolvedValue(0);

      await service.listUsers(TENANT_ID, { page: 1, pageSize: 20, status: 'suspended' });

      expect(mockPrisma.tenantMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            membership_status: 'suspended',
          }),
        }),
      );
    });

    it('should apply search filter when provided', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);
      mockPrisma.tenantMembership.count.mockResolvedValue(0);

      await service.listUsers(TENANT_ID, { page: 1, pageSize: 20, search: 'john' });

      expect(mockPrisma.tenantMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: {
              OR: [
                { first_name: { contains: 'john', mode: 'insensitive' } },
                { last_name: { contains: 'john', mode: 'insensitive' } },
                { email: { contains: 'john', mode: 'insensitive' } },
              ],
            },
          }),
        }),
      );
    });

    it('should skip search filter when search is empty/whitespace', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);
      mockPrisma.tenantMembership.count.mockResolvedValue(0);

      await service.listUsers(TENANT_ID, { page: 1, pageSize: 20, search: '   ' });

      const callArgs = mockPrisma.tenantMembership.findMany.mock.calls[0][0];
      expect(callArgs.where.user).toBeUndefined();
    });

    it('should apply role_id filter when provided', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);
      mockPrisma.tenantMembership.count.mockResolvedValue(0);

      await service.listUsers(TENANT_ID, { page: 1, pageSize: 20, role_id: 'role-123' });

      expect(mockPrisma.tenantMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            membership_roles: {
              some: { role_id: 'role-123' },
            },
          }),
        }),
      );
    });

    it('should calculate correct skip for pagination', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);
      mockPrisma.tenantMembership.count.mockResolvedValue(0);

      await service.listUsers(TENANT_ID, { page: 3, pageSize: 10 });

      expect(mockPrisma.tenantMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });
  });

  // ─── getUser ───────────────────────────────────────────────────────────────

  describe('getUser', () => {
    it('should return membership with user details when found', async () => {
      const membership = {
        id: MEMBERSHIP_ID,
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        membership_status: 'active',
        user: { id: USER_ID, email: 'a@b.com', first_name: 'A', last_name: 'B' },
        membership_roles: [],
      };
      mockPrisma.tenantMembership.findFirst.mockResolvedValueOnce(membership);

      const result = await service.getUser(TENANT_ID, USER_ID);

      expect(result).toEqual(membership);
    });

    it('should throw NotFoundException when membership not found', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.getUser(TENANT_ID, USER_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'MEMBERSHIP_NOT_FOUND',
      });
    });
  });

  // ─── updateMembershipRoles ─────────────────────────────────────────────────

  describe('updateMembershipRoles', () => {
    it('should throw NotFoundException when membership not found', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.updateMembershipRoles(TENANT_ID, USER_ID, ['role-1']);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'MEMBERSHIP_NOT_FOUND',
      });
    });

    it('should throw BadRequestException when some role IDs are invalid', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValueOnce({
        id: MEMBERSHIP_ID,
        tenant_id: TENANT_ID,
        user_id: USER_ID,
      });

      // Only 1 of 2 roles found
      mockPrisma.role.findMany.mockResolvedValueOnce([{ id: 'role-1', tenant_id: TENANT_ID }]);

      let caught: unknown;
      try {
        await service.updateMembershipRoles(TENANT_ID, USER_ID, ['role-1', 'role-invalid']);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'ROLE_NOT_FOUND',
      });
    });

    it('should replace membership roles successfully via RLS transaction', async () => {
      mockPrisma.tenantMembership.findFirst
        .mockResolvedValueOnce({
          id: MEMBERSHIP_ID,
          tenant_id: TENANT_ID,
          user_id: USER_ID,
        })
        .mockResolvedValueOnce(ownerMembershipFull); // getUser at end

      mockPrisma.role.findMany.mockResolvedValueOnce([
        { id: 'role-1', tenant_id: TENANT_ID },
        { id: 'role-2', tenant_id: null },
      ]);

      const mockTx = {
        membershipRole: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          createMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.updateMembershipRoles(TENANT_ID, USER_ID, ['role-1', 'role-2']);

      expect(mockTx.membershipRole.deleteMany).toHaveBeenCalledWith({
        where: { membership_id: MEMBERSHIP_ID },
      });
      expect(mockTx.membershipRole.createMany).toHaveBeenCalledWith({
        data: [
          { membership_id: MEMBERSHIP_ID, role_id: 'role-1', tenant_id: TENANT_ID },
          { membership_id: MEMBERSHIP_ID, role_id: 'role-2', tenant_id: TENANT_ID },
        ],
      });
      expect(mockPermissionCacheService.invalidate).toHaveBeenCalledWith(MEMBERSHIP_ID);
      expect(result).toEqual(ownerMembershipFull);
    });

    it('should log security audit when actorUserId is provided', async () => {
      mockPrisma.tenantMembership.findFirst
        .mockResolvedValueOnce({
          id: MEMBERSHIP_ID,
          tenant_id: TENANT_ID,
          user_id: USER_ID,
        })
        .mockResolvedValueOnce(ownerMembershipFull);

      mockPrisma.role.findMany.mockResolvedValueOnce([{ id: 'role-1', tenant_id: TENANT_ID }]);

      const mockTx = {
        membershipRole: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      await service.updateMembershipRoles(TENANT_ID, USER_ID, ['role-1'], 'actor-id');

      expect(mockSecurityAuditService.logMembershipRoleChange).toHaveBeenCalledWith(
        TENANT_ID,
        'actor-id',
        USER_ID,
        ['role-1'],
      );
    });
  });

  // ─── suspendMembership — additional branches ──────────────────────────────

  describe('suspendMembership — audit logging', () => {
    it('should log security audit when actorUserId is provided', async () => {
      mockPrisma.tenantMembership.findFirst
        .mockResolvedValueOnce({
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
        .mockResolvedValueOnce(ownerMembershipFull);

      mockPrisma.tenantMembership.update.mockResolvedValueOnce({});
      mockRedisClient.smembers.mockResolvedValueOnce([]);

      await service.suspendMembership(TENANT_ID, USER_ID, 'actor-id');

      expect(mockSecurityAuditService.logUserStatusChange).toHaveBeenCalledWith(
        TENANT_ID,
        'actor-id',
        USER_ID,
        'suspended',
      );
    });
  });
});
