import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PermissionCacheService } from '../../common/services/permission-cache.service';
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

describe('RolesService', () => {
  let service: RolesService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
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
          { permission: { id: PERM_ID_STAFF_1, permission_key: 'students.view', permission_tier: 'staff' } },
          { permission: { id: PERM_ID_STAFF_2, permission_key: 'students.list', permission_tier: 'staff' } },
        ],
      };

      // First findFirst: role lookup in assignPermissions
      mockPrisma.role.findFirst
        .mockResolvedValueOnce(staffRole)       // assignPermissions role lookup
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
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'TIER_VIOLATION',
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
          { permission: { id: PERM_ID_ADMIN, permission_key: 'tenant.manage', permission_tier: 'admin' } },
          { permission: { id: PERM_ID_STAFF_1, permission_key: 'students.view', permission_tier: 'staff' } },
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
        role_key: 'school_owner',
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
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'ROLE_NOT_FOUND',
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
        .mockResolvedValueOnce({    // getRole at end
          id: ROLE_ID,
          tenant_id: TENANT_ID,
          role_key: 'teacher',
          display_name: 'Teacher',
          is_system_role: false,
          role_tier: 'staff',
          role_permissions: [
            { permission: { id: PERM_ID_STAFF_1, permission_key: 'students.view', permission_tier: 'staff' } },
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
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'ROLE_KEY_EXISTS',
      });
    });
  });
});
