/* eslint-disable import/order -- jest.mock must precede mocked imports */

// ─── Mock data constants ──────────────────────────────────────────────────────

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const MEMBERSHIP_A = '44444444-4444-4444-8444-444444444444';
const MEMBERSHIP_B = '55555555-5555-4555-8555-555555555555';
const ROLE_ID = '66666666-6666-4666-8666-666666666666';
const PERM_ID_1 = '77777777-7777-4777-8777-777777777777';
const PERM_ID_2 = '88888888-8888-4888-8888-888888888888';

// ─── In-memory Redis store ────────────────────────────────────────────────────

const redisStore = new Map<string, string>();

// Pipeline operations are collected then flushed on exec()
const mockPipelineOps: Array<() => void> = [];

const mockRedisClient = {
  get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
  setex: jest.fn(async (key: string, _ttl: number, value: string) => {
    redisStore.set(key, value);
    return 'OK';
  }),
  del: jest.fn(async (...keys: string[]) => {
    for (const k of keys) redisStore.delete(k);
    return keys.length;
  }),
  pipeline: jest.fn(() => {
    // Clear any leftover ops from a previous pipeline call within the same test
    mockPipelineOps.length = 0;
    return {
      del: jest.fn((key: string) => {
        mockPipelineOps.push(() => redisStore.delete(key));
        // pipeline commands are chainable — return the pipeline itself
        return { del: jest.fn(), exec: jest.fn() };
      }),
      exec: jest.fn(async () => {
        mockPipelineOps.forEach((op) => op());
        mockPipelineOps.length = 0;
        return [];
      }),
    };
  }),
  smembers: jest.fn(async () => []),
};

// ─── Mock Prisma models ───────────────────────────────────────────────────────

const mockPrisma = {
  role: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  permission: {
    findMany: jest.fn(),
  },
  rolePermission: {
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  membershipRole: {
    findMany: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
  tenantMembership: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
};

// ─── RLS middleware mock ──────────────────────────────────────────────────────

jest.mock('../../common/middleware/rls.middleware', () => ({
  runWithRlsContext: jest.fn(
    async (_prisma: unknown, _ctx: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn(mockPrisma),
  ),
  createRlsClient: jest.fn(() => ({
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
  })),
}));

// ─── Imports (after jest.mock) ────────────────────────────────────────────────

import { Test, TestingModule } from '@nestjs/testing';

import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { SecurityAuditService } from '../audit-log/security-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { MembershipsService } from './memberships.service';
import { RolesService } from './roles.service';

// ─── Mock SecurityAuditService ────────────────────────────────────────────────

const mockSecurityAuditService = {
  logRoleChange: jest.fn().mockResolvedValue(undefined),
  logPermissionChange: jest.fn().mockResolvedValue(undefined),
  logUserStatusChange: jest.fn().mockResolvedValue(undefined),
  logMembershipRoleChange: jest.fn().mockResolvedValue(undefined),
};

// ─── Mock RedisService ────────────────────────────────────────────────────────

const mockRedisService = {
  getClient: jest.fn().mockReturnValue(mockRedisClient),
};

// ─── Helper: seed cache for a membership ──────────────────────────────────────

/**
 * Populate mock Prisma to return membership role data so that
 * `PermissionCacheService.getPermissions()` performs a DB load and caches the result.
 */
function setupMembershipRoleData(membershipId: string, permissionKeys: string[]) {
  mockPrisma.membershipRole.findMany.mockResolvedValueOnce(
    permissionKeys.map((key, idx) => ({
      membership_id: membershipId,
      role: {
        id: ROLE_ID,
        role_permissions: [
          {
            permission: {
              id: `perm-${idx}`,
              permission_key: key,
            },
          },
        ],
      },
    })),
  );
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Permission Cache Invalidation — Integration', () => {
  let rolesService: RolesService;
  let membershipsService: MembershipsService;
  let permissionCacheService: PermissionCacheService;

  beforeEach(async () => {
    jest.clearAllMocks();
    redisStore.clear();
    mockPipelineOps.length = 0;

    // Keep redis mocks stable after clearAllMocks
    mockRedisService.getClient.mockReturnValue(mockRedisClient);
    mockRedisClient.get.mockImplementation(async (key: string) => redisStore.get(key) ?? null);
    mockRedisClient.setex.mockImplementation(async (key: string, _ttl: number, value: string) => {
      redisStore.set(key, value);
      return 'OK';
    });
    mockRedisClient.del.mockImplementation(async (...keys: string[]) => {
      for (const k of keys) redisStore.delete(k);
      return keys.length;
    });
    mockRedisClient.pipeline.mockImplementation(() => {
      mockPipelineOps.length = 0;
      const pipelineObj = {
        del: jest.fn((key: string) => {
          mockPipelineOps.push(() => redisStore.delete(key));
          return pipelineObj;
        }),
        exec: jest.fn(async () => {
          mockPipelineOps.forEach((op) => op());
          mockPipelineOps.length = 0;
          return [];
        }),
      };
      return pipelineObj;
    });
    mockRedisClient.smembers.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        MembershipsService,
        PermissionCacheService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedisService },
        { provide: SecurityAuditService, useValue: mockSecurityAuditService },
      ],
    }).compile();

    rolesService = module.get<RolesService>(RolesService);
    membershipsService = module.get<MembershipsService>(MembershipsService);
    permissionCacheService = module.get<PermissionCacheService>(PermissionCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Helper: populate cache and assert it was stored ────────────────────────

  async function populateAndAssert(membershipId: string, permKeys: string[]): Promise<void> {
    setupMembershipRoleData(membershipId, permKeys);
    const perms = await permissionCacheService.getPermissions(membershipId);
    expect(perms).toEqual(expect.arrayContaining(permKeys));
    expect(redisStore.has(`permissions:${membershipId}`)).toBe(true);
  }

  // ─── RolesService — assignPermissions ───────────────────────────────────────

  it('should invalidate all tenant caches when role permissions are changed via assignPermissions', async () => {
    // 1. Populate cache for membership A
    await populateAndAssert(MEMBERSHIP_A, ['students.view', 'students.list']);

    // 2. Mock the tenant membership lookup for invalidateAllForTenant
    mockPrisma.tenantMembership.findMany.mockResolvedValueOnce([{ id: MEMBERSHIP_A }]);

    // 3. Mock role lookup in assignPermissions
    mockPrisma.role.findFirst
      .mockResolvedValueOnce({
        id: ROLE_ID,
        tenant_id: TENANT_A,
        role_key: 'custom_staff',
        display_name: 'Custom Staff',
        is_system_role: false,
        role_tier: 'staff',
      })
      // getRole at end of assignPermissions
      .mockResolvedValueOnce({
        id: ROLE_ID,
        tenant_id: TENANT_A,
        role_key: 'custom_staff',
        display_name: 'Custom Staff',
        is_system_role: false,
        role_tier: 'staff',
        role_permissions: [
          {
            permission: {
              id: PERM_ID_1,
              permission_key: 'students.view',
              permission_tier: 'staff',
            },
          },
        ],
      });

    // validateTierEnforcement — permission lookup
    mockPrisma.permission.findMany.mockResolvedValueOnce([
      { id: PERM_ID_1, permission_key: 'students.view', permission_tier: 'staff' },
    ]);

    mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.rolePermission.createMany.mockResolvedValueOnce({ count: 1 });

    // Act
    await rolesService.assignPermissions(TENANT_A, ROLE_ID, [PERM_ID_1]);

    // Assert: cache was cleared
    expect(redisStore.has(`permissions:${MEMBERSHIP_A}`)).toBe(false);
  });

  // ─── RolesService — updateRole ──────────────────────────────────────────────

  it('should invalidate all tenant caches when role is updated via updateRole', async () => {
    // 1. Populate cache
    await populateAndAssert(MEMBERSHIP_A, ['students.view']);

    // 2. Mock the tenant membership lookup for invalidateAllForTenant
    mockPrisma.tenantMembership.findMany.mockResolvedValueOnce([{ id: MEMBERSHIP_A }]);

    // 3. Mock role lookup in updateRole
    const existingRole = {
      id: ROLE_ID,
      tenant_id: TENANT_A,
      role_key: 'custom_staff',
      display_name: 'Custom Staff',
      is_system_role: false,
      role_tier: 'staff',
    };

    mockPrisma.role.findFirst
      .mockResolvedValueOnce(existingRole) // updateRole lookup
      .mockResolvedValueOnce({
        ...existingRole,
        role_permissions: [
          {
            permission: {
              id: PERM_ID_2,
              permission_key: 'students.edit',
              permission_tier: 'staff',
            },
          },
        ],
      }); // getRole at end

    // validateTierEnforcement for custom role
    mockPrisma.permission.findMany.mockResolvedValueOnce([
      { id: PERM_ID_2, permission_key: 'students.edit', permission_tier: 'staff' },
    ]);

    mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.rolePermission.createMany.mockResolvedValueOnce({ count: 1 });

    // Act
    await rolesService.updateRole(TENANT_A, ROLE_ID, { permission_ids: [PERM_ID_2] });

    // Assert: cache was cleared
    expect(redisStore.has(`permissions:${MEMBERSHIP_A}`)).toBe(false);
  });

  // ─── RolesService — createRole ──────────────────────────────────────────────

  it('should invalidate all tenant caches when a new role is created', async () => {
    // 1. Populate cache
    await populateAndAssert(MEMBERSHIP_A, ['students.view']);

    // 2. Mock the tenant membership lookup for invalidateAllForTenant
    mockPrisma.tenantMembership.findMany.mockResolvedValueOnce([{ id: MEMBERSHIP_A }]);

    // 3. validateTierEnforcement — permission lookup
    mockPrisma.permission.findMany.mockResolvedValueOnce([
      { id: PERM_ID_1, permission_key: 'students.view', permission_tier: 'staff' },
    ]);

    // Duplicate key check — no existing role
    mockPrisma.role.findFirst
      .mockResolvedValueOnce(null) // duplicate check
      .mockResolvedValueOnce({
        // getRole at end
        id: ROLE_ID,
        tenant_id: TENANT_A,
        role_key: 'new_role',
        display_name: 'New Role',
        is_system_role: false,
        role_tier: 'staff',
        role_permissions: [
          {
            permission: {
              id: PERM_ID_1,
              permission_key: 'students.view',
              permission_tier: 'staff',
            },
          },
        ],
      });

    mockPrisma.role.create.mockResolvedValueOnce({
      id: ROLE_ID,
      tenant_id: TENANT_A,
      role_key: 'new_role',
      display_name: 'New Role',
      is_system_role: false,
      role_tier: 'staff',
    });

    mockPrisma.rolePermission.createMany.mockResolvedValueOnce({ count: 1 });

    // Act
    await rolesService.createRole(TENANT_A, {
      role_key: 'new_role',
      display_name: 'New Role',
      role_tier: 'staff',
      permission_ids: [PERM_ID_1],
    });

    // Assert: cache was cleared
    expect(redisStore.has(`permissions:${MEMBERSHIP_A}`)).toBe(false);
  });

  // ─── RolesService — deleteRole ──────────────────────────────────────────────

  it('should invalidate all tenant caches when a role is deleted', async () => {
    // 1. Populate cache
    await populateAndAssert(MEMBERSHIP_A, ['students.view']);

    // 2. Mock the tenant membership lookup for invalidateAllForTenant
    mockPrisma.tenantMembership.findMany.mockResolvedValueOnce([{ id: MEMBERSHIP_A }]);

    // 3. Mock role lookup in deleteRole
    mockPrisma.role.findFirst.mockResolvedValueOnce({
      id: ROLE_ID,
      tenant_id: TENANT_A,
      role_key: 'custom_staff',
      display_name: 'Custom Staff',
      is_system_role: false,
      role_tier: 'staff',
    });

    // No memberships assigned to this role
    mockPrisma.membershipRole.count.mockResolvedValueOnce(0);
    mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 2 });
    mockPrisma.role.delete.mockResolvedValueOnce({ id: ROLE_ID });

    // Act
    await rolesService.deleteRole(TENANT_A, ROLE_ID);

    // Assert: cache was cleared
    expect(redisStore.has(`permissions:${MEMBERSHIP_A}`)).toBe(false);
  });

  // ─── MembershipsService — updateMembershipRoles ─────────────────────────────

  it('should invalidate single membership cache when roles are reassigned via updateMembershipRoles', async () => {
    // 1. Populate cache
    await populateAndAssert(MEMBERSHIP_A, ['students.view']);

    // 2. Mock membership lookup in updateMembershipRoles
    mockPrisma.tenantMembership.findFirst
      .mockResolvedValueOnce({
        id: MEMBERSHIP_A,
        tenant_id: TENANT_A,
        user_id: USER_ID,
        membership_status: 'active',
      })
      // getUser at end — full membership with roles and user data
      .mockResolvedValueOnce({
        id: MEMBERSHIP_A,
        tenant_id: TENANT_A,
        user_id: USER_ID,
        membership_status: 'active',
        user: {
          id: USER_ID,
          email: 'test@school.com',
          first_name: 'Test',
          last_name: 'User',
          phone: null,
          global_status: 'active',
          last_login_at: null,
          created_at: new Date().toISOString(),
        },
        membership_roles: [],
      });

    // Role verification — all requested roles exist
    const newRoleId = '99999999-9999-4999-8999-999999999999';
    mockPrisma.role.findMany.mockResolvedValueOnce([
      { id: newRoleId, tenant_id: TENANT_A, role_key: 'teacher', is_system_role: true },
    ]);

    // RLS transaction mocks (deleteMany + createMany happen inside createRlsClient.$transaction)
    mockPrisma.membershipRole.deleteMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.membershipRole.createMany.mockResolvedValueOnce({ count: 1 });

    // Act
    await membershipsService.updateMembershipRoles(TENANT_A, USER_ID, [newRoleId]);

    // Assert: cache for this specific membership was cleared
    expect(redisStore.has(`permissions:${MEMBERSHIP_A}`)).toBe(false);
  });

  // ─── MembershipsService — suspendMembership ─────────────────────────────────

  it('should invalidate single membership cache when membership is suspended', async () => {
    // 1. Populate cache
    await populateAndAssert(MEMBERSHIP_A, ['students.view', 'students.list']);

    // 2. Mock membership lookup in suspendMembership (includes roles for owner check)
    mockPrisma.tenantMembership.findFirst
      .mockResolvedValueOnce({
        id: MEMBERSHIP_A,
        tenant_id: TENANT_A,
        user_id: USER_ID,
        membership_status: 'active',
        membership_roles: [
          {
            role: {
              id: ROLE_ID,
              role_key: 'custom_staff',
              display_name: 'Staff',
              role_tier: 'staff',
              is_system_role: false,
            },
          },
        ],
      })
      // getUser at end
      .mockResolvedValueOnce({
        id: MEMBERSHIP_A,
        tenant_id: TENANT_A,
        user_id: USER_ID,
        membership_status: 'suspended',
        user: {
          id: USER_ID,
          email: 'test@school.com',
          first_name: 'Test',
          last_name: 'User',
          phone: null,
          global_status: 'active',
          last_login_at: null,
          created_at: new Date().toISOString(),
        },
        membership_roles: [],
      });

    mockPrisma.tenantMembership.update.mockResolvedValueOnce({
      id: MEMBERSHIP_A,
      membership_status: 'suspended',
    });

    // Act
    await membershipsService.suspendMembership(TENANT_A, USER_ID);

    // Assert: cache for this specific membership was cleared
    expect(redisStore.has(`permissions:${MEMBERSHIP_A}`)).toBe(false);
  });

  // ─── MembershipsService — reactivateMembership ──────────────────────────────

  it('should invalidate single membership cache when membership is reactivated', async () => {
    // 1. Populate cache
    await populateAndAssert(MEMBERSHIP_A, ['students.view']);

    // 2. Mock membership lookup in reactivateMembership
    mockPrisma.tenantMembership.findFirst
      .mockResolvedValueOnce({
        id: MEMBERSHIP_A,
        tenant_id: TENANT_A,
        user_id: USER_ID,
        membership_status: 'suspended',
      })
      // getUser at end
      .mockResolvedValueOnce({
        id: MEMBERSHIP_A,
        tenant_id: TENANT_A,
        user_id: USER_ID,
        membership_status: 'active',
        user: {
          id: USER_ID,
          email: 'test@school.com',
          first_name: 'Test',
          last_name: 'User',
          phone: null,
          global_status: 'active',
          last_login_at: null,
          created_at: new Date().toISOString(),
        },
        membership_roles: [],
      });

    mockPrisma.tenantMembership.update.mockResolvedValueOnce({
      id: MEMBERSHIP_A,
      membership_status: 'active',
    });

    // Act
    await membershipsService.reactivateMembership(TENANT_A, USER_ID);

    // Assert: cache for this specific membership was cleared
    expect(redisStore.has(`permissions:${MEMBERSHIP_A}`)).toBe(false);
  });

  // ─── Cross-tenant isolation ─────────────────────────────────────────────────

  it('should not invalidate cache for other tenants when a role changes', async () => {
    // 1. Populate cache for BOTH tenants
    await populateAndAssert(MEMBERSHIP_A, ['students.view']);
    await populateAndAssert(MEMBERSHIP_B, ['finance.view']);

    // Verify both caches are present
    expect(redisStore.has(`permissions:${MEMBERSHIP_A}`)).toBe(true);
    expect(redisStore.has(`permissions:${MEMBERSHIP_B}`)).toBe(true);

    // 2. Mock invalidateAllForTenant to return ONLY Tenant A's memberships
    mockPrisma.tenantMembership.findMany.mockResolvedValueOnce([{ id: MEMBERSHIP_A }]);

    // 3. Mock assignPermissions flow for Tenant A
    mockPrisma.role.findFirst
      .mockResolvedValueOnce({
        id: ROLE_ID,
        tenant_id: TENANT_A,
        role_key: 'custom_staff',
        display_name: 'Custom Staff',
        is_system_role: false,
        role_tier: 'staff',
      })
      .mockResolvedValueOnce({
        id: ROLE_ID,
        tenant_id: TENANT_A,
        role_key: 'custom_staff',
        display_name: 'Custom Staff',
        is_system_role: false,
        role_tier: 'staff',
        role_permissions: [
          {
            permission: {
              id: PERM_ID_1,
              permission_key: 'students.view',
              permission_tier: 'staff',
            },
          },
        ],
      });

    mockPrisma.permission.findMany.mockResolvedValueOnce([
      { id: PERM_ID_1, permission_key: 'students.view', permission_tier: 'staff' },
    ]);

    mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 0 });
    mockPrisma.rolePermission.createMany.mockResolvedValueOnce({ count: 1 });

    // Act: change permissions for Tenant A only
    await rolesService.assignPermissions(TENANT_A, ROLE_ID, [PERM_ID_1]);

    // Assert: Tenant A cache was cleared, Tenant B cache is untouched
    expect(redisStore.has(`permissions:${MEMBERSHIP_A}`)).toBe(false);
    expect(redisStore.has(`permissions:${MEMBERSHIP_B}`)).toBe(true);
  });
});
