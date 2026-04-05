import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { SecurityAuditService } from '../audit-log/security-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { RolesService } from './roles.service';

const TENANT_ID = 'tenant-aaa';
const ROLE_ID = 'role-bbb';
const PERM_ID_STAFF_1 = '00000000-0000-0000-0000-000000000001';
const PERM_ID_STAFF_2 = '00000000-0000-0000-0000-000000000002';
const PERM_ID_ADMIN = '00000000-0000-0000-0000-000000000003';

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
    count: jest.fn(),
  },
};

const mockPermissionCacheService = {
  invalidateAllForTenant: jest.fn().mockResolvedValue(undefined),
  invalidate: jest.fn().mockResolvedValue(undefined),
};

const mockSecurityAuditService = {
  logRoleChange: jest.fn().mockResolvedValue(undefined),
  logPermissionChange: jest.fn().mockResolvedValue(undefined),
};

describe('RolesService', () => {
  let service: RolesService;

  beforeEach(async () => {
    jest.resetAllMocks();
    mockPermissionCacheService.invalidateAllForTenant.mockResolvedValue(undefined);
    mockPermissionCacheService.invalidate.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
        { provide: SecurityAuditService, useValue: mockSecurityAuditService },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  // ─── assignPermissions ─────────────────────────────────────────────────────

  describe('assignPermissions', () => {
    it('should allow assigning staff-tier permissions to staff role', async () => {
      // The role being assigned to is a custom staff-tier role
      const staffRole = {
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'custom_staff',
        display_name: 'Custom Staff',
        is_system_role: false,
        role_tier: 'staff',
      };

      // Permission findFirst for getRole after assignment
      const staffRoleWithPerms = {
        ...staffRole,
        role_permissions: [
          {
            permission: {
              id: PERM_ID_STAFF_1,
              permission_key: 'students.view',
              permission_tier: 'staff',
            },
          },
          {
            permission: {
              id: PERM_ID_STAFF_2,
              permission_key: 'students.list',
              permission_tier: 'staff',
            },
          },
        ],
      };

      // First findFirst: role lookup in assignPermissions
      mockPrisma.role.findFirst
        .mockResolvedValueOnce(staffRole) // assignPermissions role lookup
        .mockResolvedValueOnce(staffRoleWithPerms); // getRole at end

      // permission.findMany returns two staff-tier permissions
      mockPrisma.permission.findMany.mockResolvedValueOnce([
        { id: PERM_ID_STAFF_1, permission_key: 'students.view', permission_tier: 'staff' },
        { id: PERM_ID_STAFF_2, permission_key: 'students.list', permission_tier: 'staff' },
      ]);

      mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.rolePermission.createMany.mockResolvedValueOnce({ count: 2 });

      const result = await service.assignPermissions(TENANT_ID, ROLE_ID, [
        PERM_ID_STAFF_1,
        PERM_ID_STAFF_2,
      ]);

      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { role_id: ROLE_ID, permission_id: PERM_ID_STAFF_1, tenant_id: TENANT_ID },
          { role_id: ROLE_ID, permission_id: PERM_ID_STAFF_2, tenant_id: TENANT_ID },
        ],
      });
      expect(mockPermissionCacheService.invalidateAllForTenant).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual(staffRoleWithPerms);
    });

    it('should reject assigning admin-tier permissions to staff role', async () => {
      const staffRole = {
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'custom_staff',
        display_name: 'Custom Staff',
        is_system_role: false,
        role_tier: 'staff',
      };

      mockPrisma.role.findFirst.mockResolvedValueOnce(staffRole);

      // Permission findMany returns an admin-tier permission
      mockPrisma.permission.findMany.mockResolvedValueOnce([
        { id: PERM_ID_ADMIN, permission_key: 'tenant.manage', permission_tier: 'admin' },
      ]);

      let caught: unknown;
      try {
        await service.assignPermissions(TENANT_ID, ROLE_ID, [PERM_ID_ADMIN]);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect(caught).toMatchObject({ response: { code: expect.any(String) } });
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'TIER_VIOLATION',
      });
    });

    it('should allow assigning permissions to system roles (not platform_owner)', async () => {
      const systemRole = {
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'admin',
        display_name: 'School Admin',
        is_system_role: true,
        role_tier: 'admin',
      };

      const systemRoleWithPerms = {
        ...systemRole,
        role_permissions: [
          {
            permission: {
              id: PERM_ID_ADMIN,
              permission_key: 'tenant.manage',
              permission_tier: 'admin',
            },
          },
        ],
      };

      mockPrisma.role.findFirst
        .mockResolvedValueOnce(systemRole)
        .mockResolvedValueOnce(systemRoleWithPerms);

      // System roles skip tier enforcement — no permission.findMany mock needed
      mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.rolePermission.createMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.assignPermissions(TENANT_ID, ROLE_ID, [PERM_ID_ADMIN]);

      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [{ role_id: ROLE_ID, permission_id: PERM_ID_ADMIN, tenant_id: TENANT_ID }],
      });
      // Tier enforcement should have been skipped for system roles
      expect(mockPrisma.permission.findMany).not.toHaveBeenCalled();
      expect(result).toEqual(systemRoleWithPerms);
    });

    it('should reject assigning permissions to platform_owner role', async () => {
      mockPrisma.role.findFirst.mockResolvedValueOnce({
        id: ROLE_ID,
        tenant_id: null,
        role_key: 'school_owner',
        display_name: 'Platform Owner',
        is_system_role: true,
        role_tier: 'platform',
      });

      let caught: unknown;
      try {
        await service.assignPermissions(TENANT_ID, ROLE_ID, [PERM_ID_ADMIN]);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect(caught).toMatchObject({ response: { code: expect.any(String) } });
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'SYSTEM_ROLE_IMMUTABLE',
      });
    });

    it('should allow admin role to have both admin and staff permissions', async () => {
      const adminRole = {
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'custom_admin',
        display_name: 'Custom Admin',
        is_system_role: false,
        role_tier: 'admin',
      };

      const adminRoleWithPerms = {
        ...adminRole,
        role_permissions: [
          {
            permission: {
              id: PERM_ID_ADMIN,
              permission_key: 'tenant.manage',
              permission_tier: 'admin',
            },
          },
          {
            permission: {
              id: PERM_ID_STAFF_1,
              permission_key: 'students.view',
              permission_tier: 'staff',
            },
          },
        ],
      };

      mockPrisma.role.findFirst
        .mockResolvedValueOnce(adminRole)
        .mockResolvedValueOnce(adminRoleWithPerms);

      // Mixed permissions: one admin, one staff — both within admin rank
      mockPrisma.permission.findMany.mockResolvedValueOnce([
        { id: PERM_ID_ADMIN, permission_key: 'tenant.manage', permission_tier: 'admin' },
        { id: PERM_ID_STAFF_1, permission_key: 'students.view', permission_tier: 'staff' },
      ]);

      mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.rolePermission.createMany.mockResolvedValueOnce({ count: 2 });

      const result = await service.assignPermissions(TENANT_ID, ROLE_ID, [
        PERM_ID_ADMIN,
        PERM_ID_STAFF_1,
      ]);

      // No tier violation — createMany should have been called
      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [
          { role_id: ROLE_ID, permission_id: PERM_ID_ADMIN, tenant_id: TENANT_ID },
          { role_id: ROLE_ID, permission_id: PERM_ID_STAFF_1, tenant_id: TENANT_ID },
        ],
      });
      expect(result).toEqual(adminRoleWithPerms);
    });
  });

  // ─── deleteRole ─────────────────────────────────────────────────────────────

  describe('deleteRole', () => {
    it('should prevent deleting system roles', async () => {
      mockPrisma.role.findFirst.mockResolvedValueOnce({
        id: ROLE_ID,
        tenant_id: null,
        role_key: 'school_principal',
        display_name: 'School Owner',
        is_system_role: true,
        role_tier: 'admin',
      });

      let caught: unknown;
      try {
        await service.deleteRole(TENANT_ID, ROLE_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect(caught).toMatchObject({ response: { code: expect.any(String) } });
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'SYSTEM_ROLE_IMMUTABLE',
      });

      // Ensure the role was never actually deleted
      expect(mockPrisma.role.delete).not.toHaveBeenCalled();
    });

    it('should allow deleting custom roles not assigned to any membership', async () => {
      mockPrisma.role.findFirst.mockResolvedValueOnce({
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'custom_role',
        display_name: 'Custom Role',
        is_system_role: false,
        role_tier: 'staff',
      });

      mockPrisma.membershipRole.count.mockResolvedValueOnce(0);
      mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.role.delete.mockResolvedValueOnce({ id: ROLE_ID });

      const result = await service.deleteRole(TENANT_ID, ROLE_ID);

      expect(mockPrisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { role_id: ROLE_ID },
      });
      expect(mockPrisma.role.delete).toHaveBeenCalledWith({
        where: { id: ROLE_ID },
      });
      expect(result).toEqual({ deleted: true });
      expect(mockPermissionCacheService.invalidateAllForTenant).toHaveBeenCalledWith(TENANT_ID);
    });

    it('should block deleting roles that are in use', async () => {
      mockPrisma.role.findFirst.mockResolvedValueOnce({
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'custom_role',
        display_name: 'Custom Role',
        is_system_role: false,
        role_tier: 'staff',
      });

      mockPrisma.membershipRole.count.mockResolvedValueOnce(3);

      let caught: unknown;
      try {
        await service.deleteRole(TENANT_ID, ROLE_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect(caught).toMatchObject({ response: { code: expect.any(String) } });
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'ROLE_IN_USE',
      });
      expect(mockPrisma.role.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when role does not exist', async () => {
      mockPrisma.role.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.deleteRole(TENANT_ID, ROLE_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect(caught).toMatchObject({ response: { code: expect.any(String) } });
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'ROLE_NOT_FOUND',
      });
    });
  });

  // ─── updateRole ─────────────────────────────────────────────────────────────

  describe('updateRole', () => {
    it('should block display_name changes on system roles', async () => {
      mockPrisma.role.findFirst.mockResolvedValueOnce({
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'teacher',
        display_name: 'Teacher',
        is_system_role: true,
        role_tier: 'staff',
      });

      let caught: unknown;
      try {
        await service.updateRole(TENANT_ID, ROLE_ID, { display_name: 'Instructor' });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect(caught).toMatchObject({ response: { code: expect.any(String) } });
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'SYSTEM_ROLE_NAME_LOCKED',
      });
    });

    it('should allow permission changes on system roles', async () => {
      const systemRole = {
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'teacher',
        display_name: 'Teacher',
        is_system_role: true,
        role_tier: 'staff',
      };

      const updatedRole = {
        ...systemRole,
        role_permissions: [
          {
            permission: {
              id: PERM_ID_STAFF_1,
              permission_key: 'students.view',
              permission_tier: 'staff',
            },
          },
        ],
      };

      mockPrisma.role.findFirst
        .mockResolvedValueOnce(systemRole)
        .mockResolvedValueOnce(updatedRole);

      // System roles skip tier enforcement — no permission.findMany mock needed
      mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.rolePermission.createMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.updateRole(TENANT_ID, ROLE_ID, {
        permission_ids: [PERM_ID_STAFF_1],
      });

      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalled();
      expect(mockPrisma.role.update).not.toHaveBeenCalled();
      expect(mockPrisma.permission.findMany).not.toHaveBeenCalled();
      expect(result).toEqual(updatedRole);
    });

    it('should block all changes on platform_owner role', async () => {
      mockPrisma.role.findFirst.mockResolvedValueOnce({
        id: ROLE_ID,
        tenant_id: null,
        role_key: 'school_owner',
        display_name: 'Platform Owner',
        is_system_role: true,
        role_tier: 'platform',
      });

      let caught: unknown;
      try {
        await service.updateRole(TENANT_ID, ROLE_ID, {
          permission_ids: [PERM_ID_ADMIN],
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect(caught).toMatchObject({ response: { code: expect.any(String) } });
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'SYSTEM_ROLE_IMMUTABLE',
      });
    });
  });

  // ─── createRole ─────────────────────────────────────────────────────────────

  describe('createRole', () => {
    it('should create a staff role with valid staff-tier permissions', async () => {
      // validateTierEnforcement: permission.findMany
      mockPrisma.permission.findMany.mockResolvedValueOnce([
        { id: PERM_ID_STAFF_1, permission_key: 'students.view', permission_tier: 'staff' },
      ]);

      // Duplicate key check: role.findFirst → null (no existing)
      mockPrisma.role.findFirst
        .mockResolvedValueOnce(null) // duplicate check
        .mockResolvedValueOnce({
          // getRole at end
          id: ROLE_ID,
          tenant_id: TENANT_ID,
          role_key: 'teacher',
          display_name: 'Teacher',
          is_system_role: false,
          role_tier: 'staff',
          role_permissions: [
            {
              permission: {
                id: PERM_ID_STAFF_1,
                permission_key: 'students.view',
                permission_tier: 'staff',
              },
            },
          ],
        });

      mockPrisma.role.create.mockResolvedValueOnce({
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'teacher',
        display_name: 'Teacher',
        is_system_role: false,
        role_tier: 'staff',
      });

      mockPrisma.rolePermission.createMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.createRole(TENANT_ID, {
        role_key: 'teacher',
        display_name: 'Teacher',
        role_tier: 'staff',
        permission_ids: [PERM_ID_STAFF_1],
      });

      expect(mockPrisma.role.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          role_key: 'teacher',
          display_name: 'Teacher',
          is_system_role: false,
          role_tier: 'staff',
        },
      });
      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [{ role_id: ROLE_ID, permission_id: PERM_ID_STAFF_1, tenant_id: TENANT_ID }],
      });
      expect(mockPermissionCacheService.invalidateAllForTenant).toHaveBeenCalledWith(TENANT_ID);
      expect(result.role_key).toBe('teacher');
    });

    it('should reject creating role with duplicate role_key', async () => {
      // validateTierEnforcement: no permissions, skip (permission.findMany not called)
      // Duplicate check returns an existing role
      mockPrisma.role.findFirst.mockResolvedValueOnce({
        id: 'existing-role',
        tenant_id: TENANT_ID,
        role_key: 'teacher',
      });

      let caught: unknown;
      try {
        await service.createRole(TENANT_ID, {
          role_key: 'teacher',
          display_name: 'Teacher',
          role_tier: 'staff',
          permission_ids: [],
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect(caught).toMatchObject({ response: { code: expect.any(String) } });
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'ROLE_KEY_EXISTS',
      });
    });

    it('should create role with empty permission_ids (no permissions assigned)', async () => {
      // No permissions to validate — skip validateTierEnforcement
      // No existing role with same key
      mockPrisma.role.findFirst
        .mockResolvedValueOnce(null) // duplicate check
        .mockResolvedValueOnce({
          id: ROLE_ID,
          tenant_id: TENANT_ID,
          role_key: 'empty_role',
          display_name: 'Empty Role',
          is_system_role: false,
          role_tier: 'staff',
          role_permissions: [],
        });

      mockPrisma.role.create.mockResolvedValueOnce({
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'empty_role',
        display_name: 'Empty Role',
        is_system_role: false,
        role_tier: 'staff',
      });

      const result = await service.createRole(TENANT_ID, {
        role_key: 'empty_role',
        display_name: 'Empty Role',
        role_tier: 'staff',
        permission_ids: [],
      });

      // rolePermission.createMany should NOT have been called for empty permissions
      expect(mockPrisma.rolePermission.createMany).not.toHaveBeenCalled();
      expect(result.role_key).toBe('empty_role');
    });

    it('should log security audit when actorUserId is provided', async () => {
      mockPrisma.permission.findMany.mockResolvedValueOnce([
        { id: PERM_ID_STAFF_1, permission_key: 'students.view', permission_tier: 'staff' },
      ]);

      mockPrisma.role.findFirst
        .mockResolvedValueOnce(null) // duplicate check
        .mockResolvedValueOnce({
          id: ROLE_ID,
          tenant_id: TENANT_ID,
          role_key: 'audited_role',
          display_name: 'Audited',
          is_system_role: false,
          role_tier: 'staff',
          role_permissions: [],
        });

      mockPrisma.role.create.mockResolvedValueOnce({
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'audited_role',
      });

      mockPrisma.rolePermission.createMany.mockResolvedValueOnce({ count: 1 });

      await service.createRole(
        TENANT_ID,
        {
          role_key: 'audited_role',
          display_name: 'Audited',
          role_tier: 'staff',
          permission_ids: [PERM_ID_STAFF_1],
        },
        'actor-user-id',
      );

      expect(mockSecurityAuditService.logRoleChange).toHaveBeenCalledWith(
        TENANT_ID,
        'actor-user-id',
        'create',
        ROLE_ID,
        expect.objectContaining({ role_key: 'audited_role' }),
      );
    });

    it('should reject when permission IDs are invalid (not found in DB)', async () => {
      mockPrisma.permission.findMany.mockResolvedValueOnce([
        // Only 1 of 2 permissions found
        { id: PERM_ID_STAFF_1, permission_key: 'students.view', permission_tier: 'staff' },
      ]);

      let caught: unknown;
      try {
        await service.createRole(TENANT_ID, {
          role_key: 'bad_perms',
          display_name: 'Bad Perms',
          role_tier: 'staff',
          permission_ids: [PERM_ID_STAFF_1, 'non-existent-perm'],
        });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'PERMISSION_NOT_FOUND',
      });
    });
  });

  // ─── listRoles ─────────────────────────────────────────────────────────────

  describe('listRoles', () => {
    it('should return all roles for the tenant including system roles', async () => {
      const roles = [
        { id: 'r1', tenant_id: TENANT_ID, role_key: 'custom', _count: { role_permissions: 5 } },
        { id: 'r2', tenant_id: null, role_key: 'school_owner', _count: { role_permissions: 20 } },
      ];
      mockPrisma.role.findMany.mockResolvedValueOnce(roles);

      const result = await service.listRoles(TENANT_ID);

      expect(result).toEqual({ data: roles });
      expect(mockPrisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ tenant_id: TENANT_ID }, { tenant_id: null }],
          },
        }),
      );
    });
  });

  // ─── getRole ───────────────────────────────────────────────────────────────

  describe('getRole', () => {
    it('should return role with permissions when found', async () => {
      const role = {
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'teacher',
        role_permissions: [
          { permission: { id: PERM_ID_STAFF_1, permission_key: 'students.view' } },
        ],
      };
      mockPrisma.role.findFirst.mockResolvedValueOnce(role);

      const result = await service.getRole(TENANT_ID, ROLE_ID);

      expect(result).toEqual(role);
    });

    it('should throw NotFoundException when role is not found', async () => {
      mockPrisma.role.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.getRole(TENANT_ID, ROLE_ID);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'ROLE_NOT_FOUND',
      });
    });
  });

  // ─── listPermissions ──────────────────────────────────────────────────────

  describe('listPermissions', () => {
    it('should list all permissions when no tier filter is provided', async () => {
      const permissions = [
        {
          id: 'p1',
          permission_key: 'students.view',
          description: 'View students',
          permission_tier: 'staff',
        },
        {
          id: 'p2',
          permission_key: 'tenant.manage',
          description: 'Manage tenant',
          permission_tier: 'admin',
        },
      ];
      mockPrisma.permission.findMany.mockResolvedValueOnce(permissions);

      const result = await service.listPermissions();

      expect(mockPrisma.permission.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { permission_key: 'asc' },
      });
      expect(result.data).toHaveLength(2);
      expect(result.grouped).toHaveProperty('students');
      expect(result.grouped).toHaveProperty('tenant');
    });

    it('should filter permissions by tier when tier is provided', async () => {
      const permissions = [
        {
          id: 'p1',
          permission_key: 'students.view',
          description: 'View students',
          permission_tier: 'staff',
        },
        {
          id: 'p2',
          permission_key: 'parents.view',
          description: 'View parents',
          permission_tier: 'parent',
        },
      ];
      mockPrisma.permission.findMany.mockResolvedValueOnce(permissions);

      const result = await service.listPermissions('staff');

      expect(mockPrisma.permission.findMany).toHaveBeenCalledWith({
        where: {
          permission_tier: {
            in: expect.arrayContaining(['staff', 'parent']),
          },
        },
        orderBy: { permission_key: 'asc' },
      });
      expect(result.data).toHaveLength(2);
    });

    it('should correctly group permissions by module prefix', async () => {
      const permissions = [
        { id: 'p1', permission_key: 'students.view', description: 'V', permission_tier: 'staff' },
        { id: 'p2', permission_key: 'students.create', description: 'C', permission_tier: 'staff' },
        { id: 'p3', permission_key: 'finance.view', description: 'FV', permission_tier: 'admin' },
      ];
      mockPrisma.permission.findMany.mockResolvedValueOnce(permissions);

      const result = await service.listPermissions();

      expect(result.grouped['students']).toHaveLength(2);
      expect(result.grouped['finance']).toHaveLength(1);
    });

    it('should filter to only parent-tier for parent role tier', async () => {
      mockPrisma.permission.findMany.mockResolvedValueOnce([]);

      await service.listPermissions('parent');

      expect(mockPrisma.permission.findMany).toHaveBeenCalledWith({
        where: {
          permission_tier: {
            in: ['parent'],
          },
        },
        orderBy: { permission_key: 'asc' },
      });
    });

    it('should include all tiers for platform tier', async () => {
      mockPrisma.permission.findMany.mockResolvedValueOnce([]);

      await service.listPermissions('platform');

      expect(mockPrisma.permission.findMany).toHaveBeenCalledWith({
        where: {
          permission_tier: {
            in: expect.arrayContaining(['platform', 'admin', 'staff', 'parent']),
          },
        },
        orderBy: { permission_key: 'asc' },
      });
    });
  });

  // ─── updateRole — additional branches ──────────────────────────────────────

  describe('updateRole — additional branches', () => {
    it('should throw NotFoundException when role not found', async () => {
      mockPrisma.role.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.updateRole(TENANT_ID, ROLE_ID, { display_name: 'New' });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'ROLE_NOT_FOUND',
      });
    });

    it('should update display_name for custom roles', async () => {
      const customRole = {
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'custom_role',
        display_name: 'Old Name',
        is_system_role: false,
        role_tier: 'staff',
      };

      const updatedRole = {
        ...customRole,
        display_name: 'New Name',
        role_permissions: [],
      };

      mockPrisma.role.findFirst
        .mockResolvedValueOnce(customRole) // updateRole lookup
        .mockResolvedValueOnce(updatedRole); // getRole at end

      mockPrisma.role.update.mockResolvedValueOnce(updatedRole);

      const result = await service.updateRole(TENANT_ID, ROLE_ID, {
        display_name: 'New Name',
      });

      expect(mockPrisma.role.update).toHaveBeenCalledWith({
        where: { id: ROLE_ID },
        data: { display_name: 'New Name' },
      });
      expect(result.display_name).toBe('New Name');
    });

    it('should replace permissions with tier enforcement for custom roles', async () => {
      const customRole = {
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'custom_role',
        display_name: 'Custom',
        is_system_role: false,
        role_tier: 'staff',
      };

      const updatedRole = {
        ...customRole,
        role_permissions: [
          {
            permission: {
              id: PERM_ID_STAFF_1,
              permission_key: 'students.view',
              permission_tier: 'staff',
            },
          },
        ],
      };

      mockPrisma.role.findFirst
        .mockResolvedValueOnce(customRole)
        .mockResolvedValueOnce(updatedRole);

      mockPrisma.permission.findMany.mockResolvedValueOnce([
        { id: PERM_ID_STAFF_1, permission_key: 'students.view', permission_tier: 'staff' },
      ]);

      mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.rolePermission.createMany.mockResolvedValueOnce({ count: 1 });

      await service.updateRole(TENANT_ID, ROLE_ID, {
        permission_ids: [PERM_ID_STAFF_1],
      });

      expect(mockPrisma.permission.findMany).toHaveBeenCalled(); // tier enforcement
      expect(mockPrisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { role_id: ROLE_ID },
      });
    });

    it('should use caller tenant_id for permission assignment when role tenant_id is null', async () => {
      const systemRole = {
        id: ROLE_ID,
        tenant_id: null, // system role without tenant
        role_key: 'admin',
        display_name: 'Admin',
        is_system_role: true,
        role_tier: 'admin',
      };

      const updatedRole = { ...systemRole, role_permissions: [] };

      mockPrisma.role.findFirst
        .mockResolvedValueOnce(systemRole)
        .mockResolvedValueOnce(updatedRole);

      mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.rolePermission.createMany.mockResolvedValueOnce({ count: 1 });

      await service.updateRole(TENANT_ID, ROLE_ID, {
        permission_ids: [PERM_ID_STAFF_1],
      });

      // Should use TENANT_ID (caller) since role.tenant_id is null
      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [{ role_id: ROLE_ID, permission_id: PERM_ID_STAFF_1, tenant_id: TENANT_ID }],
      });
    });

    it('should replace permissions with empty array (clear all)', async () => {
      const customRole = {
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'custom_role',
        display_name: 'Custom',
        is_system_role: false,
        role_tier: 'staff',
      };

      const updatedRole = { ...customRole, role_permissions: [] };

      mockPrisma.role.findFirst
        .mockResolvedValueOnce(customRole)
        .mockResolvedValueOnce(updatedRole);

      mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 5 });

      await service.updateRole(TENANT_ID, ROLE_ID, {
        permission_ids: [],
      });

      expect(mockPrisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { role_id: ROLE_ID },
      });
      // createMany should NOT have been called for empty array
      expect(mockPrisma.rolePermission.createMany).not.toHaveBeenCalled();
    });

    it('should log security audit when actorUserId is provided for update', async () => {
      const customRole = {
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'custom_role',
        display_name: 'Old Name',
        is_system_role: false,
        role_tier: 'staff',
      };
      const updatedRole = { ...customRole, display_name: 'New Name', role_permissions: [] };

      mockPrisma.role.findFirst
        .mockResolvedValueOnce(customRole)
        .mockResolvedValueOnce(updatedRole);
      mockPrisma.role.update.mockResolvedValueOnce(updatedRole);

      await service.updateRole(TENANT_ID, ROLE_ID, { display_name: 'New Name' }, 'actor-id');

      expect(mockSecurityAuditService.logRoleChange).toHaveBeenCalledWith(
        TENANT_ID,
        'actor-id',
        'update',
        ROLE_ID,
        expect.objectContaining({
          display_name_changed: true,
          permissions_changed: false,
        }),
      );
    });
  });

  // ─── deleteRole — additional branches ──────────────────────────────────────

  describe('deleteRole — additional branches', () => {
    it('should log security audit when actorUserId is provided for delete', async () => {
      mockPrisma.role.findFirst.mockResolvedValueOnce({
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'custom_role',
        display_name: 'Custom Role',
        is_system_role: false,
        role_tier: 'staff',
      });
      mockPrisma.membershipRole.count.mockResolvedValueOnce(0);
      mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.role.delete.mockResolvedValueOnce({ id: ROLE_ID });

      await service.deleteRole(TENANT_ID, ROLE_ID, 'actor-id');

      expect(mockSecurityAuditService.logRoleChange).toHaveBeenCalledWith(
        TENANT_ID,
        'actor-id',
        'delete',
        ROLE_ID,
        expect.objectContaining({ role_key: 'custom_role' }),
      );
    });
  });

  // ─── assignPermissions — additional branches ──────────────────────────────

  describe('assignPermissions — additional branches', () => {
    it('should throw NotFoundException when role not found', async () => {
      mockPrisma.role.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.assignPermissions(TENANT_ID, ROLE_ID, [PERM_ID_STAFF_1]);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'ROLE_NOT_FOUND',
      });
    });

    it('should handle empty permission_ids (clear all permissions)', async () => {
      const customRole = {
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'custom_role',
        display_name: 'Custom',
        is_system_role: false,
        role_tier: 'staff',
      };

      const updatedRole = { ...customRole, role_permissions: [] };

      mockPrisma.role.findFirst
        .mockResolvedValueOnce(customRole)
        .mockResolvedValueOnce(updatedRole);

      mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 3 });

      await service.assignPermissions(TENANT_ID, ROLE_ID, []);

      expect(mockPrisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { role_id: ROLE_ID },
      });
      expect(mockPrisma.rolePermission.createMany).not.toHaveBeenCalled();
    });

    it('should use caller tenant_id when role has null tenant_id', async () => {
      const systemRole = {
        id: ROLE_ID,
        tenant_id: null,
        role_key: 'admin',
        display_name: 'Admin',
        is_system_role: true,
        role_tier: 'admin',
      };
      const updatedRole = { ...systemRole, role_permissions: [] };

      mockPrisma.role.findFirst
        .mockResolvedValueOnce(systemRole)
        .mockResolvedValueOnce(updatedRole);

      mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.rolePermission.createMany.mockResolvedValueOnce({ count: 1 });

      await service.assignPermissions(TENANT_ID, ROLE_ID, [PERM_ID_STAFF_1]);

      expect(mockPrisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [{ role_id: ROLE_ID, permission_id: PERM_ID_STAFF_1, tenant_id: TENANT_ID }],
      });
    });

    it('should log security audit when actorUserId is provided', async () => {
      const customRole = {
        id: ROLE_ID,
        tenant_id: TENANT_ID,
        role_key: 'custom_staff',
        display_name: 'Custom Staff',
        is_system_role: false,
        role_tier: 'staff',
      };
      const updatedRole = { ...customRole, role_permissions: [] };

      mockPrisma.role.findFirst
        .mockResolvedValueOnce(customRole)
        .mockResolvedValueOnce(updatedRole);

      mockPrisma.permission.findMany.mockResolvedValueOnce([
        { id: PERM_ID_STAFF_1, permission_key: 'students.view', permission_tier: 'staff' },
      ]);

      mockPrisma.rolePermission.deleteMany.mockResolvedValueOnce({ count: 0 });
      mockPrisma.rolePermission.createMany.mockResolvedValueOnce({ count: 1 });

      await service.assignPermissions(TENANT_ID, ROLE_ID, [PERM_ID_STAFF_1], 'actor-id');

      expect(mockSecurityAuditService.logPermissionChange).toHaveBeenCalledWith(
        TENANT_ID,
        'actor-id',
        ROLE_ID,
        [PERM_ID_STAFF_1],
        'grant',
      );
    });
  });
});
