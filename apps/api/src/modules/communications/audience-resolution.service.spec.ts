import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { AudienceResolutionService, AudienceTarget } from './audience-resolution.service';

const TENANT_ID = 'tenant-uuid-1';

function buildMockParent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'parent-1',
    user_id: 'user-1',
    preferred_contact_channels: ['email'],
    status: 'active',
    ...overrides,
  };
}

describe('AudienceResolutionService', () => {
  let service: AudienceResolutionService;
  let mockPrisma: {
    parent: {
      findMany: jest.Mock;
    };
    student: {
      findMany: jest.Mock;
    };
    classEnrolment: {
      findMany: jest.Mock;
    };
    householdParent: {
      findMany: jest.Mock;
    };
    studentParent: {
      findMany: jest.Mock;
    };
    tenantNotificationSetting: {
      findFirst: jest.Mock;
    };
    user: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      parent: {
        findMany: jest.fn(),
      },
      student: {
        findMany: jest.fn(),
      },
      classEnrolment: {
        findMany: jest.fn(),
      },
      householdParent: {
        findMany: jest.fn(),
      },
      studentParent: {
        findMany: jest.fn(),
      },
      tenantNotificationSetting: {
        findFirst: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AudienceResolutionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AudienceResolutionService>(AudienceResolutionService);

    jest.clearAllMocks();
  });

  // Helper to set up the tenant notification setting mock (used in most tests)
  function mockNotificationSettings(channels: string[], isEnabled = true) {
    mockPrisma.tenantNotificationSetting.findFirst.mockResolvedValue({
      tenant_id: TENANT_ID,
      notification_type: 'announcement.published',
      is_enabled: isEnabled,
      channels,
    });
  }

  // ─── resolve() — by scope ─────────────────────────────────────────────────

  describe('resolve() — school scope', () => {
    it('should resolve school scope to all parents with user accounts', async () => {
      const parents = Array.from({ length: 5 }, (_, i) =>
        buildMockParent({ id: `parent-${i}`, user_id: `user-${i}` }),
      );
      // getAllParentIds
      mockPrisma.parent.findMany
        .mockResolvedValueOnce(parents.map((p) => ({ id: p.id })))
        // resolveParentsToTargets
        .mockResolvedValueOnce(parents);

      mockNotificationSettings(['email']);

      const result = await service.resolve(TENANT_ID, 'school', {});

      expect(result).toHaveLength(5);
      expect(mockPrisma.parent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            user_id: { not: null },
            status: 'active',
          }),
        }),
      );
    });

    it('should exclude parents without user_id from school scope', async () => {
      // getAllParentIds only returns parents with user_id (the query already filters)
      mockPrisma.parent.findMany
        .mockResolvedValueOnce([{ id: 'parent-1' }, { id: 'parent-2' }])
        // resolveParentsToTargets returns only those with user_id
        .mockResolvedValueOnce([
          buildMockParent({ id: 'parent-1', user_id: 'user-1' }),
          // parent-2 has no user_id (filtered out by the second query)
        ]);

      mockNotificationSettings(['email']);

      const result = await service.resolve(TENANT_ID, 'school', {});

      // Only 1 parent has user_id in the resolve step
      expect(result).toHaveLength(1);
      expect(result[0].user_id).toBe('user-1');
    });
  });

  describe('resolve() — year_group scope', () => {
    it('should resolve year_group scope via students in that year group', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        { id: 'student-1' },
        { id: 'student-2' },
      ]);
      mockPrisma.studentParent.findMany.mockResolvedValue([
        { parent_id: 'parent-1' },
        { parent_id: 'parent-2' },
      ]);
      mockPrisma.parent.findMany.mockResolvedValue([
        buildMockParent({ id: 'parent-1', user_id: 'user-1' }),
        buildMockParent({ id: 'parent-2', user_id: 'user-2' }),
      ]);
      mockNotificationSettings(['email']);

      const result = await service.resolve(TENANT_ID, 'year_group', {
        year_group_ids: ['yg-1'],
      });

      expect(result).toHaveLength(2);
      expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            year_group_id: { in: ['yg-1'] },
          }),
        }),
      );
    });
  });

  describe('resolve() — class scope', () => {
    it('should resolve class scope via active enrolments', async () => {
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        { student_id: 'student-1' },
        { student_id: 'student-2' },
      ]);
      mockPrisma.studentParent.findMany.mockResolvedValue([
        { parent_id: 'parent-1' },
      ]);
      mockPrisma.parent.findMany.mockResolvedValue([
        buildMockParent({ id: 'parent-1', user_id: 'user-1' }),
      ]);
      mockNotificationSettings(['email', 'sms']);

      const result = await service.resolve(TENANT_ID, 'class', {
        class_ids: ['cls-1'],
      });

      expect(result).toHaveLength(1);
      expect(mockPrisma.classEnrolment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            class_id: { in: ['cls-1'] },
            status: 'active',
          }),
        }),
      );
    });
  });

  describe('resolve() — household scope', () => {
    it('should resolve household scope via household_parents', async () => {
      mockPrisma.householdParent.findMany.mockResolvedValue([
        { parent_id: 'parent-1' },
        { parent_id: 'parent-2' },
      ]);
      mockPrisma.parent.findMany.mockResolvedValue([
        buildMockParent({ id: 'parent-1', user_id: 'user-1' }),
        buildMockParent({ id: 'parent-2', user_id: 'user-2' }),
      ]);
      mockNotificationSettings(['email']);

      const result = await service.resolve(TENANT_ID, 'household', {
        household_ids: ['hh-1'],
      });

      expect(result).toHaveLength(2);
      expect(mockPrisma.householdParent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            household_id: { in: ['hh-1'] },
          }),
        }),
      );
    });
  });

  describe('resolve() — custom scope', () => {
    it('should resolve custom scope directly from user_ids', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-1', preferred_locale: 'en' },
        { id: 'user-2', preferred_locale: 'ar' },
      ]);

      const result = await service.resolve(TENANT_ID, 'custom', {
        user_ids: ['user-1', 'user-2'],
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        user_id: 'user-1',
        locale: 'en',
        channels: ['in_app'],
      });
      expect(result[1]).toEqual({
        user_id: 'user-2',
        locale: 'ar',
        channels: ['in_app'],
      });
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['user-1', 'user-2'] } },
        }),
      );
    });
  });

  // ─── Edge cases: de-duplication ────────────────────────────────────────────

  describe('edge cases — de-duplication', () => {
    it('edge: parent linked to multiple students in same class returns 1 target', async () => {
      // Two students in same class, both linked to same parent
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        { student_id: 'student-1' },
        { student_id: 'student-2' },
      ]);
      // Both students point to same parent
      mockPrisma.studentParent.findMany.mockResolvedValue([
        { parent_id: 'parent-1' },
        { parent_id: 'parent-1' },
      ]);
      mockPrisma.parent.findMany.mockResolvedValue([
        buildMockParent({ id: 'parent-1', user_id: 'user-1' }),
      ]);
      mockNotificationSettings(['email']);

      const result = await service.resolve(TENANT_ID, 'class', {
        class_ids: ['cls-1'],
      });

      // De-duplicated to 1 target
      expect(result).toHaveLength(1);
      expect(result[0].user_id).toBe('user-1');
    });

    it('edge: parent linked across multiple year groups returns 1 target', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        { id: 'student-1' },
        { id: 'student-2' },
      ]);
      // Both students map to the same parent
      mockPrisma.studentParent.findMany.mockResolvedValue([
        { parent_id: 'parent-1' },
        { parent_id: 'parent-1' },
      ]);
      mockPrisma.parent.findMany.mockResolvedValue([
        buildMockParent({ id: 'parent-1', user_id: 'user-1' }),
      ]);
      mockNotificationSettings(['email']);

      const result = await service.resolve(TENANT_ID, 'year_group', {
        year_group_ids: ['yg-1', 'yg-2'],
      });

      expect(result).toHaveLength(1);
    });

    it('edge: should return empty list when no matching parents found', async () => {
      mockPrisma.parent.findMany
        .mockResolvedValueOnce([]) // getAllParentIds returns empty
        .mockResolvedValueOnce([]); // resolveParentsToTargets also empty

      mockNotificationSettings(['email']);

      const result = await service.resolve(TENANT_ID, 'school', {});

      expect(result).toEqual([]);
    });
  });

  // ─── Channel resolution per parent ────────────────────────────────────────

  describe('channel resolution per parent', () => {
    it('should always include in_app when parent has a user account', async () => {
      mockPrisma.parent.findMany
        .mockResolvedValueOnce([{ id: 'parent-1' }])
        .mockResolvedValueOnce([
          buildMockParent({ id: 'parent-1', user_id: 'user-1', preferred_contact_channels: ['email'] }),
        ]);
      mockNotificationSettings(['email']);

      const result = await service.resolve(TENANT_ID, 'school', {});

      expect(result).toHaveLength(1);
      expect(result[0].channels).toContain('in_app');
    });

    it('should intersect parent preferences with tenant notification settings', async () => {
      mockPrisma.parent.findMany
        .mockResolvedValueOnce([{ id: 'parent-1' }])
        .mockResolvedValueOnce([
          buildMockParent({
            id: 'parent-1',
            user_id: 'user-1',
            preferred_contact_channels: ['email', 'sms', 'whatsapp'],
          }),
        ]);
      // Tenant only enables email and whatsapp
      mockNotificationSettings(['email', 'whatsapp']);

      const result = await service.resolve(TENANT_ID, 'school', {});

      expect(result[0].channels).toContain('email');
      expect(result[0].channels).toContain('whatsapp');
      expect(result[0].channels).toContain('in_app');
      expect(result[0].channels).not.toContain('sms');
    });

    it('should exclude channel if disabled at tenant level', async () => {
      mockPrisma.parent.findMany
        .mockResolvedValueOnce([{ id: 'parent-1' }])
        .mockResolvedValueOnce([
          buildMockParent({
            id: 'parent-1',
            user_id: 'user-1',
            preferred_contact_channels: ['sms'],
          }),
        ]);
      // Tenant only enables email — sms not enabled
      mockNotificationSettings(['email']);

      const result = await service.resolve(TENANT_ID, 'school', {});

      // sms is excluded because tenant does not enable it
      expect(result[0].channels).not.toContain('sms');
      // in_app is always included
      expect(result[0].channels).toContain('in_app');
    });
  });
});
