import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import { SstService } from './sst.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID_A = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID_B = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ACTOR_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const MEMBER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const MEMBERSHIP_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  sstMember: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeMember = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: MEMBER_ID,
  tenant_id: TENANT_ID,
  user_id: USER_ID_A,
  role_description: 'Year Head - 1st Year',
  active: true,
  created_at: new Date('2026-03-20T10:00:00Z'),
  updated_at: new Date('2026-03-20T10:00:00Z'),
  user: {
    first_name: 'Jane',
    last_name: 'Doe',
  },
  ...overrides,
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('SstService', () => {
  let service: SstService;
  let mockPastoralEventService: { write: jest.Mock };
  let mockPermissionCacheService: { getPermissions: jest.Mock };
  let mockPrisma: {
    tenantMembership: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPastoralEventService = {
      write: jest.fn().mockResolvedValue(undefined),
    };

    mockPermissionCacheService = {
      getPermissions: jest.fn().mockResolvedValue([]),
    };

    mockPrisma = {
      tenantMembership: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SstService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PastoralEventService, useValue: mockPastoralEventService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
      ],
    }).compile();

    service = module.get<SstService>(SstService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── addMember ────────────────────────────────────────────────────────────

  describe('addMember', () => {
    it('should create SST member and write audit event', async () => {
      const memberData = makeMember();
      mockRlsTx.sstMember.findFirst.mockResolvedValue(null);
      mockRlsTx.sstMember.create.mockResolvedValue(memberData);

      const result = await service.addMember(
        TENANT_ID,
        USER_ID_A,
        { user_id: USER_ID_A, role_description: 'Year Head - 1st Year' },
        ACTOR_USER_ID,
      );

      expect(result.id).toBe(MEMBER_ID);
      expect(result.user_id).toBe(USER_ID_A);
      expect(result.role_description).toBe('Year Head - 1st Year');
      expect(result.active).toBe(true);

      expect(mockRlsTx.sstMember.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          user_id: USER_ID_A,
          role_description: 'Year Head - 1st Year',
          active: true,
        }),
      });

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'sst_member_added',
          entity_type: 'sst_member',
          entity_id: MEMBER_ID,
          actor_user_id: ACTOR_USER_ID,
          payload: expect.objectContaining({
            member_id: MEMBER_ID,
            user_id: USER_ID_A,
            role_description: 'Year Head - 1st Year',
            added_by_user_id: ACTOR_USER_ID,
          }),
        }),
      );
    });

    it('should throw ConflictException when user is already an SST member', async () => {
      mockRlsTx.sstMember.findFirst.mockResolvedValue(makeMember());

      await expect(
        service.addMember(
          TENANT_ID,
          USER_ID_A,
          { user_id: USER_ID_A, role_description: 'Guidance Counsellor' },
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(ConflictException);

      expect(mockRlsTx.sstMember.create).not.toHaveBeenCalled();
      expect(mockPastoralEventService.write).not.toHaveBeenCalled();
    });

    it('should create member without role_description when omitted', async () => {
      const memberData = makeMember({ role_description: null });
      mockRlsTx.sstMember.findFirst.mockResolvedValue(null);
      mockRlsTx.sstMember.create.mockResolvedValue(memberData);

      const result = await service.addMember(
        TENANT_ID,
        USER_ID_A,
        { user_id: USER_ID_A },
        ACTOR_USER_ID,
      );

      expect(result.role_description).toBeNull();
      expect(mockRlsTx.sstMember.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          role_description: null,
        }),
      });
    });
  });

  // ─── updateMember ─────────────────────────────────────────────────────────

  describe('updateMember', () => {
    it('should update role_description and write audit event with change tracking', async () => {
      const existing = makeMember();
      const updated = makeMember({ role_description: 'SENCO' });
      mockRlsTx.sstMember.findUnique.mockResolvedValue(existing);
      mockRlsTx.sstMember.update.mockResolvedValue(updated);

      const result = await service.updateMember(
        TENANT_ID,
        MEMBER_ID,
        { role_description: 'SENCO' },
        ACTOR_USER_ID,
      );

      expect(result.role_description).toBe('SENCO');

      expect(mockRlsTx.sstMember.update).toHaveBeenCalledWith({
        where: { id: MEMBER_ID },
        data: { role_description: 'SENCO' },
      });

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'sst_member_updated',
          entity_type: 'sst_member',
          entity_id: MEMBER_ID,
          actor_user_id: ACTOR_USER_ID,
          payload: expect.objectContaining({
            member_id: MEMBER_ID,
            changes: expect.arrayContaining([
              expect.objectContaining({
                field: 'role_description',
                old_value: 'Year Head - 1st Year',
                new_value: 'SENCO',
              }),
            ]),
            updated_by_user_id: ACTOR_USER_ID,
          }),
        }),
      );
    });

    it('should toggle active status to false', async () => {
      const existing = makeMember({ active: true });
      const updated = makeMember({ active: false });
      mockRlsTx.sstMember.findUnique.mockResolvedValue(existing);
      mockRlsTx.sstMember.update.mockResolvedValue(updated);

      const result = await service.updateMember(
        TENANT_ID,
        MEMBER_ID,
        { active: false },
        ACTOR_USER_ID,
      );

      expect(result.active).toBe(false);

      expect(mockRlsTx.sstMember.update).toHaveBeenCalledWith({
        where: { id: MEMBER_ID },
        data: { active: false },
      });

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            changes: expect.arrayContaining([
              expect.objectContaining({
                field: 'active',
                old_value: true,
                new_value: false,
              }),
            ]),
          }),
        }),
      );
    });

    it('should toggle active status to true', async () => {
      const existing = makeMember({ active: false });
      const updated = makeMember({ active: true });
      mockRlsTx.sstMember.findUnique.mockResolvedValue(existing);
      mockRlsTx.sstMember.update.mockResolvedValue(updated);

      const result = await service.updateMember(
        TENANT_ID,
        MEMBER_ID,
        { active: true },
        ACTOR_USER_ID,
      );

      expect(result.active).toBe(true);
    });

    it('should throw NotFoundException for non-existent member', async () => {
      mockRlsTx.sstMember.findUnique.mockResolvedValue(null);

      await expect(
        service.updateMember(
          TENANT_ID,
          'nonexistent-id',
          { role_description: 'SENCO' },
          ACTOR_USER_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── removeMember ─────────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('should delete member and write audit event', async () => {
      const existing = makeMember();
      mockRlsTx.sstMember.findUnique.mockResolvedValue(existing);
      mockRlsTx.sstMember.delete.mockResolvedValue(existing);

      await service.removeMember(TENANT_ID, MEMBER_ID, ACTOR_USER_ID);

      expect(mockRlsTx.sstMember.delete).toHaveBeenCalledWith({
        where: { id: MEMBER_ID },
      });

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'sst_member_removed',
          entity_type: 'sst_member',
          entity_id: MEMBER_ID,
          actor_user_id: ACTOR_USER_ID,
          payload: expect.objectContaining({
            member_id: MEMBER_ID,
            user_id: USER_ID_A,
            removed_by_user_id: ACTOR_USER_ID,
          }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent member', async () => {
      mockRlsTx.sstMember.findUnique.mockResolvedValue(null);

      await expect(
        service.removeMember(TENANT_ID, 'nonexistent-id', ACTOR_USER_ID),
      ).rejects.toThrow(NotFoundException);

      expect(mockRlsTx.sstMember.delete).not.toHaveBeenCalled();
      expect(mockPastoralEventService.write).not.toHaveBeenCalled();
    });
  });

  // ─── listMembers ──────────────────────────────────────────────────────────

  describe('listMembers', () => {
    it('should list all members when no filter is provided', async () => {
      const members = [
        makeMember({ id: 'member-1', user_id: USER_ID_A, active: true }),
        makeMember({ id: 'member-2', user_id: USER_ID_B, active: false }),
      ];
      mockRlsTx.sstMember.findMany.mockResolvedValue(members);

      const result = await service.listMembers(TENANT_ID);

      expect(result).toHaveLength(2);
      expect(mockRlsTx.sstMember.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        include: {
          user: {
            select: {
              first_name: true,
              last_name: true,
            },
          },
        },
        orderBy: { created_at: 'asc' },
      });
      expect(result[0]?.user_name).toBeDefined();
    });

    it('should list only active members when filter active=true', async () => {
      const activeMembers = [makeMember({ id: 'member-1', user_id: USER_ID_A, active: true })];
      mockRlsTx.sstMember.findMany.mockResolvedValue(activeMembers);

      const result = await service.listMembers(TENANT_ID, { active: true });

      expect(result).toHaveLength(1);
      expect(mockRlsTx.sstMember.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, active: true },
        include: {
          user: {
            select: {
              first_name: true,
              last_name: true,
            },
          },
        },
        orderBy: { created_at: 'asc' },
      });
    });

    it('should list only inactive members when filter active=false', async () => {
      const inactiveMembers = [makeMember({ id: 'member-2', user_id: USER_ID_B, active: false })];
      mockRlsTx.sstMember.findMany.mockResolvedValue(inactiveMembers);

      const result = await service.listMembers(TENANT_ID, { active: false });

      expect(result).toHaveLength(1);
      expect(mockRlsTx.sstMember.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, active: false },
        include: {
          user: {
            select: {
              first_name: true,
              last_name: true,
            },
          },
        },
        orderBy: { created_at: 'asc' },
      });
    });
  });

  describe('getActiveMembers', () => {
    it('should return user ids with resolved names for active members', async () => {
      const activeMembers = [
        makeMember({ id: 'member-1', user_id: USER_ID_A, active: true }),
        makeMember({
          id: 'member-2',
          user_id: USER_ID_B,
          active: true,
          user: { first_name: 'John', last_name: 'Smith' },
        }),
      ];
      mockRlsTx.sstMember.findMany.mockResolvedValue(activeMembers);

      const result = await service.getActiveMembers(TENANT_ID);

      expect(result).toEqual([
        { user_id: USER_ID_A, name: 'Jane Doe' },
        { user_id: USER_ID_B, name: 'John Smith' },
      ]);
    });
  });

  // ─── getActiveMemberUserIds ───────────────────────────────────────────────

  describe('getActiveMemberUserIds', () => {
    it('should return user_ids of active members only', async () => {
      const activeMembers = [
        makeMember({ id: 'member-1', user_id: USER_ID_A, active: true }),
        makeMember({ id: 'member-2', user_id: USER_ID_B, active: true }),
      ];
      mockRlsTx.sstMember.findMany.mockResolvedValue(activeMembers);

      const result = await service.getActiveMemberUserIds(TENANT_ID);

      expect(result).toEqual([USER_ID_A, USER_ID_B]);
    });

    it('should return empty array when no active members', async () => {
      mockRlsTx.sstMember.findMany.mockResolvedValue([]);

      const result = await service.getActiveMemberUserIds(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  // ─── ensureTierAccess ─────────────────────────────────────────────────────

  describe('ensureTierAccess', () => {
    it('should return both true when user has tier1 and tier2 permissions', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({
        id: MEMBERSHIP_ID,
      });
      mockPermissionCacheService.getPermissions.mockResolvedValue([
        'pastoral.view_tier1',
        'pastoral.view_tier2',
        'pastoral.manage_sst',
      ]);

      const result = await service.ensureTierAccess(TENANT_ID, USER_ID_A);

      expect(result).toEqual({ hasTier1: true, hasTier2: true });
      expect(mockPastoralEventService.write).not.toHaveBeenCalled();
    });

    it('should return hasTier1=false when missing pastoral.view_tier1', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({
        id: MEMBERSHIP_ID,
      });
      mockPermissionCacheService.getPermissions.mockResolvedValue(['pastoral.view_tier2']);

      const result = await service.ensureTierAccess(TENANT_ID, USER_ID_A);

      expect(result).toEqual({ hasTier1: false, hasTier2: true });

      // Should log a warning event
      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'sst_tier_access_warning',
          payload: expect.objectContaining({
            reason: 'missing_permissions',
            missing_permissions: ['pastoral.view_tier1'],
          }),
        }),
      );
    });

    it('should return hasTier2=false when missing pastoral.view_tier2', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({
        id: MEMBERSHIP_ID,
      });
      mockPermissionCacheService.getPermissions.mockResolvedValue(['pastoral.view_tier1']);

      const result = await service.ensureTierAccess(TENANT_ID, USER_ID_A);

      expect(result).toEqual({ hasTier1: true, hasTier2: false });

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'sst_tier_access_warning',
          payload: expect.objectContaining({
            missing_permissions: ['pastoral.view_tier2'],
          }),
        }),
      );
    });

    it('should return both false when both permissions missing', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({
        id: MEMBERSHIP_ID,
      });
      mockPermissionCacheService.getPermissions.mockResolvedValue([]);

      const result = await service.ensureTierAccess(TENANT_ID, USER_ID_A);

      expect(result).toEqual({ hasTier1: false, hasTier2: false });

      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            missing_permissions: ['pastoral.view_tier1', 'pastoral.view_tier2'],
          }),
        }),
      );
    });

    it('should return both false when user has no membership in tenant', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(null);

      const result = await service.ensureTierAccess(TENANT_ID, USER_ID_A);

      expect(result).toEqual({ hasTier1: false, hasTier2: false });

      // Should log a warning event
      expect(mockPastoralEventService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'sst_tier_access_warning',
          payload: expect.objectContaining({
            reason: 'no_membership_found',
          }),
        }),
      );

      // Should NOT call getPermissions since there's no membership
      expect(mockPermissionCacheService.getPermissions).not.toHaveBeenCalled();
    });
  });
});
