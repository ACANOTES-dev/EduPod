import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RbacReadFacade } from './rbac-read.facade';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ROLE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const mockPrisma = {
  tenantMembership: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  membershipRole: {
    findMany: jest.fn(),
  },
  role: {
    findFirst: jest.fn(),
  },
  permission: {
    findMany: jest.fn(),
  },
};

describe('RbacReadFacade', () => {
  let facade: RbacReadFacade;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [RbacReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<RbacReadFacade>(RbacReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Memberships ────────────────────────────────────────────────────────────

  describe('findMembershipWithPermissions', () => {
    it('should return membership with permissions when found', async () => {
      const membership = {
        id: MEMBERSHIP_ID,
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        membership_status: 'active',
        membership_roles: [],
      };
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(membership);

      const result = await facade.findMembershipWithPermissions(TENANT_ID, MEMBERSHIP_ID);

      expect(result).toEqual(membership);
      expect(mockPrisma.tenantMembership.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MEMBERSHIP_ID, tenant_id: TENANT_ID },
        }),
      );
    });

    it('should return null when membership not found', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(null);

      const result = await facade.findMembershipWithPermissions(TENANT_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findMembershipByUserWithPermissions', () => {
    it('should find membership by user ID with role/permission chain', async () => {
      const membership = {
        id: MEMBERSHIP_ID,
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        membership_status: 'active',
        membership_roles: [
          {
            role: {
              id: ROLE_ID,
              role_permissions: [{ permission: { id: 'p1', permission_key: 'students.view' } }],
            },
          },
        ],
      };
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(membership);

      const result = await facade.findMembershipByUserWithPermissions(TENANT_ID, USER_ID);

      expect(result).toEqual(membership);
      expect(mockPrisma.tenantMembership.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: USER_ID, tenant_id: TENANT_ID },
        }),
      );
    });
  });

  describe('findMembershipByIdAndUser', () => {
    it('should find membership by both membership ID and user ID', async () => {
      const membership = {
        id: MEMBERSHIP_ID,
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        membership_status: 'active',
        membership_roles: [],
      };
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(membership);

      const result = await facade.findMembershipByIdAndUser(TENANT_ID, MEMBERSHIP_ID, USER_ID);

      expect(result).toEqual(membership);
      expect(mockPrisma.tenantMembership.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: MEMBERSHIP_ID, user_id: USER_ID, tenant_id: TENANT_ID },
        }),
      );
    });

    it('should return null when no matching membership', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(null);

      const result = await facade.findMembershipByIdAndUser(TENANT_ID, 'bad-id', USER_ID);

      expect(result).toBeNull();
    });
  });

  describe('findMembershipSummary', () => {
    it('should return summary without role chain', async () => {
      const summary = {
        id: MEMBERSHIP_ID,
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        membership_status: 'active',
      };
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(summary);

      const result = await facade.findMembershipSummary(TENANT_ID, USER_ID);

      expect(result).toEqual(summary);
    });
  });

  describe('findAllMembershipsForUser', () => {
    it('should return all memberships for a user across tenants (DSAR)', async () => {
      const memberships = [
        { id: 'm1', tenant_id: 't1', user_id: USER_ID, membership_status: 'active' },
        { id: 'm2', tenant_id: 't2', user_id: USER_ID, membership_status: 'suspended' },
      ];
      mockPrisma.tenantMembership.findMany.mockResolvedValue(memberships);

      const result = await facade.findAllMembershipsForUser(USER_ID);

      expect(result).toEqual(memberships);
      expect(mockPrisma.tenantMembership.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { user_id: USER_ID },
        }),
      );
    });
  });

  describe('countMembershipsWithPermission', () => {
    it('should count active memberships with specific permission', async () => {
      mockPrisma.tenantMembership.count.mockResolvedValue(5);

      const result = await facade.countMembershipsWithPermission(TENANT_ID, 'students.view');

      expect(result).toBe(5);
      expect(mockPrisma.tenantMembership.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            membership_status: 'active',
          }),
        }),
      );
    });
  });

  describe('findMembershipsWithPermissionAndUser', () => {
    it('should return memberships with user display names', async () => {
      const memberships = [{ user_id: USER_ID, user: { first_name: 'John', last_name: 'Doe' } }];
      mockPrisma.tenantMembership.findMany.mockResolvedValue(memberships);

      const result = await facade.findMembershipsWithPermissionAndUser(TENANT_ID, 'students.view');

      expect(result).toEqual(memberships);
    });
  });

  describe('countActiveMemberships', () => {
    it('should count active memberships for a tenant', async () => {
      mockPrisma.tenantMembership.count.mockResolvedValue(10);

      const result = await facade.countActiveMemberships(TENANT_ID);

      expect(result).toBe(10);
    });
  });

  describe('findFirstActiveMembershipUserId', () => {
    it('should return user_id of the oldest active membership', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({ user_id: USER_ID });

      const result = await facade.findFirstActiveMembershipUserId(TENANT_ID);

      expect(result).toBe(USER_ID);
      expect(mockPrisma.tenantMembership.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { created_at: 'asc' },
        }),
      );
    });

    it('should return null when no active membership exists', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(null);

      const result = await facade.findFirstActiveMembershipUserId(TENANT_ID);

      expect(result).toBeNull();
    });
  });

  // ─── Membership Roles ───────────────────────────────────────────────────────

  describe('findMembershipsByRoleKey', () => {
    it('should find membership roles by role key', async () => {
      const roles = [
        {
          membership_id: MEMBERSHIP_ID,
          role_id: ROLE_ID,
          tenant_id: TENANT_ID,
          membership: { user_id: USER_ID },
        },
      ];
      mockPrisma.membershipRole.findMany.mockResolvedValue(roles);

      const result = await facade.findMembershipsByRoleKey(TENANT_ID, 'school_principal');

      expect(result).toEqual(roles);
    });
  });

  // ─── Roles ──────────────────────────────────────────────────────────────────

  describe('findRoleById', () => {
    it('should find role by ID including system roles', async () => {
      const role = {
        id: ROLE_ID,
        role_key: 'admin',
        display_name: 'School Admin',
        is_system_role: true,
        role_tier: 'admin',
      };
      mockPrisma.role.findFirst.mockResolvedValue(role);

      const result = await facade.findRoleById(TENANT_ID, ROLE_ID);

      expect(result).toEqual(role);
      expect(mockPrisma.role.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: ROLE_ID,
            OR: [{ tenant_id: TENANT_ID }, { tenant_id: null }],
          },
        }),
      );
    });

    it('should return null when role not found', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      const result = await facade.findRoleById(TENANT_ID, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findRoleByKey', () => {
    it('should find role by key including system roles', async () => {
      const role = {
        id: ROLE_ID,
        role_key: 'school_principal',
        display_name: 'School Principal',
        is_system_role: true,
        role_tier: 'admin',
      };
      mockPrisma.role.findFirst.mockResolvedValue(role);

      const result = await facade.findRoleByKey(TENANT_ID, 'school_principal');

      expect(result).toEqual(role);
    });
  });

  describe('countAllActiveMemberships', () => {
    it('should count all active memberships across all tenants', async () => {
      mockPrisma.tenantMembership.count.mockResolvedValue(100);

      const result = await facade.countAllActiveMemberships();

      expect(result).toBe(100);
      expect(mockPrisma.tenantMembership.count).toHaveBeenCalledWith({
        where: { membership_status: 'active' },
      });
    });
  });

  describe('findMembershipWithUser', () => {
    it('should find active membership with user details', async () => {
      const membership = {
        id: MEMBERSHIP_ID,
        tenant_id: TENANT_ID,
        user_id: USER_ID,
        membership_status: 'active',
        user: { id: USER_ID, email: 'a@b.com', first_name: 'A', last_name: 'B' },
      };
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(membership);

      const result = await facade.findMembershipWithUser(TENANT_ID, USER_ID);

      expect(result).toEqual(membership);
    });

    it('should return null when no active membership found', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(null);

      const result = await facade.findMembershipWithUser(TENANT_ID, USER_ID);

      expect(result).toBeNull();
    });
  });

  describe('findMembershipUserIds', () => {
    it('should return all membership user IDs for a tenant', async () => {
      const memberships = [
        { id: 'm1', user_id: 'u1' },
        { id: 'm2', user_id: 'u2' },
      ];
      mockPrisma.tenantMembership.findMany.mockResolvedValue(memberships);

      const result = await facade.findMembershipUserIds(TENANT_ID);

      expect(result).toEqual(memberships);
    });
  });

  describe('findActiveUserIdsByRoleKey', () => {
    it('should return user IDs of active members with specified role', async () => {
      mockPrisma.membershipRole.findMany.mockResolvedValue([
        { membership: { user_id: 'u1' } },
        { membership: { user_id: 'u2' } },
      ]);

      const result = await facade.findActiveUserIdsByRoleKey(TENANT_ID, 'school_principal');

      expect(result).toEqual(['u1', 'u2']);
    });

    it('should return empty array when no members have the role', async () => {
      mockPrisma.membershipRole.findMany.mockResolvedValue([]);

      const result = await facade.findActiveUserIdsByRoleKey(TENANT_ID, 'nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('findActiveMembershipsByRoleKeys', () => {
    it('should find active memberships across all tenants with given role keys', async () => {
      const memberships = [
        { tenant_id: 't1', user_id: 'u1', user: { preferred_locale: 'en' } },
        { tenant_id: 't2', user_id: 'u2', user: { preferred_locale: 'ar' } },
      ];
      mockPrisma.tenantMembership.findMany.mockResolvedValue(memberships);

      const result = await facade.findActiveMembershipsByRoleKeys([
        'school_owner',
        'school_principal',
      ]);

      expect(result).toEqual(memberships);
    });
  });

  describe('findActiveMembershipsWithLocale', () => {
    it('should find active memberships with user locale for a tenant', async () => {
      const memberships = [
        { user_id: 'u1', user: { preferred_locale: 'en' } },
        { user_id: 'u2', user: { preferred_locale: null } },
      ];
      mockPrisma.tenantMembership.findMany.mockResolvedValue(memberships);

      const result = await facade.findActiveMembershipsWithLocale(TENANT_ID);

      expect(result).toEqual(memberships);
    });
  });

  describe('findSystemRoleByKey', () => {
    it('should find system role by key (global, tenant_id=null)', async () => {
      const role = { id: ROLE_ID, role_key: 'platform_admin' };
      mockPrisma.role.findFirst.mockResolvedValue(role);

      const result = await facade.findSystemRoleByKey('platform_admin');

      expect(result).toEqual(role);
      expect(mockPrisma.role.findFirst).toHaveBeenCalledWith({
        where: { role_key: 'platform_admin', tenant_id: null },
        select: { id: true, role_key: true },
      });
    });

    it('should return null when system role not found', async () => {
      mockPrisma.role.findFirst.mockResolvedValue(null);

      const result = await facade.findSystemRoleByKey('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findAllPermissions', () => {
    it('should return all permissions', async () => {
      const permissions = [
        { id: 'p1', permission_key: 'students.view' },
        { id: 'p2', permission_key: 'students.create' },
      ];
      mockPrisma.permission.findMany.mockResolvedValue(permissions);

      const result = await facade.findAllPermissions();

      expect(result).toEqual(permissions);
      expect(mockPrisma.permission.findMany).toHaveBeenCalledWith({
        take: 1000,
        select: { id: true, permission_key: true },
      });
    });
  });
});
