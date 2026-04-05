import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  ClassesReadFacade,
  StaffProfileReadFacade,
  StudentReadFacade,
  RbacReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { EarlyWarningRoutingService } from './early-warning-routing.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = '22222222-2222-2222-2222-222222222222';
const TEACHER_USER_ID = '33333333-3333-3333-3333-333333333333';
const YEAR_HEAD_USER_ID = '44444444-4444-4444-4444-444444444444';
const PRINCIPAL_USER_ID = '55555555-5555-5555-5555-555555555555';
const CLASS_ID = '66666666-6666-6666-6666-666666666666';
const STAFF_PROFILE_ID = '77777777-7777-7777-7777-777777777777';

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    classEnrolment: {
      findFirst: jest.fn(),
    },
    classStaff: {
      findMany: jest.fn(),
    },
    staffProfile: {
      findMany: jest.fn(),
    },
    student: {
      findFirst: jest.fn(),
    },
    membershipRole: {
      findMany: jest.fn(),
    },
    class: {
      findMany: jest.fn(),
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('EarlyWarningRoutingService', () => {
  let service: EarlyWarningRoutingService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        EarlyWarningRoutingService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ClassesReadFacade,
          useValue: {
            findClassIdsForStudent: jest.fn().mockImplementation(async () => {
              const row = await mockPrisma.classEnrolment.findFirst();
              return row ? [row.class_id] : [];
            }),
            findStaffByClass: jest.fn().mockImplementation(async () => {
              const rows = await mockPrisma.classStaff.findMany();
              return rows.map((r: Record<string, unknown>) => ({
                ...r,
                assignment_role: 'homeroom',
              }));
            }),
            findStaffByClasses: jest.fn().mockImplementation(async () => {
              const rows = await mockPrisma.classStaff.findMany();
              return rows;
            }),
            findByYearGroup: mockPrisma.class.findMany,
          },
        },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            findByIds: jest.fn().mockImplementation(async () => {
              const rows = await mockPrisma.staffProfile.findMany();
              return rows ?? [];
            }),
          },
        },
        {
          provide: StudentReadFacade,
          useValue: {
            findById: mockPrisma.student.findFirst,
          },
        },
        {
          provide: RbacReadFacade,
          useValue: {
            findActiveUserIdsByRoleKey: jest.fn().mockImplementation(async () => {
              const rows = await mockPrisma.membershipRole.findMany();
              return rows.map((r: { membership: { user_id: string } }) => r.membership.user_id);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EarlyWarningRoutingService>(EarlyWarningRoutingService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('resolveRecipients', () => {
    it('should resolve homeroom teacher for yellow tier', async () => {
      mockPrisma.classEnrolment.findFirst.mockResolvedValue({ class_id: CLASS_ID });
      mockPrisma.classStaff.findMany.mockResolvedValue([{ staff_profile_id: STAFF_PROFILE_ID }]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([{ user_id: TEACHER_USER_ID }]);

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'yellow', {
        yellow: { role: 'homeroom_teacher' },
      });

      expect(result.recipientUserIds).toEqual([TEACHER_USER_ID]);
    });

    it('should resolve year head for amber tier', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ year_group_id: 'yg-1' });
      mockPrisma.membershipRole.findMany.mockResolvedValue([
        { membership: { user_id: YEAR_HEAD_USER_ID } },
      ]);
      mockPrisma.class.findMany.mockResolvedValue([{ id: CLASS_ID }]);
      mockPrisma.classStaff.findMany.mockResolvedValue([{ staff_profile_id: STAFF_PROFILE_ID }]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { id: STAFF_PROFILE_ID, user_id: YEAR_HEAD_USER_ID },
      ]);

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'amber', {
        amber: { role: 'year_head' },
      });

      expect(result.recipientUserIds).toEqual([YEAR_HEAD_USER_ID]);
    });

    it('should resolve multiple roles for red tier', async () => {
      mockPrisma.membershipRole.findMany
        .mockResolvedValueOnce([{ membership: { user_id: PRINCIPAL_USER_ID } }])
        .mockResolvedValueOnce([{ membership: { user_id: YEAR_HEAD_USER_ID } }]);

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'red', {
        red: { roles: ['principal', 'pastoral_lead'] },
      });

      expect(result.recipientUserIds).toHaveLength(2);
      expect(result.recipientUserIds).toContain(PRINCIPAL_USER_ID);
    });

    it('should use fallback defaults when no routing rules configured', async () => {
      mockPrisma.classEnrolment.findFirst.mockResolvedValue({ class_id: CLASS_ID });
      mockPrisma.classStaff.findMany.mockResolvedValue([{ staff_profile_id: STAFF_PROFILE_ID }]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([{ user_id: TEACHER_USER_ID }]);

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'yellow', {});

      expect(result.recipientUserIds).toEqual([TEACHER_USER_ID]);
    });

    it('should deduplicate recipient user IDs', async () => {
      mockPrisma.membershipRole.findMany
        .mockResolvedValueOnce([{ membership: { user_id: PRINCIPAL_USER_ID } }])
        .mockResolvedValueOnce([{ membership: { user_id: PRINCIPAL_USER_ID } }]);

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'red', {
        red: { roles: ['principal', 'pastoral_lead'] },
      });

      expect(result.recipientUserIds).toEqual([PRINCIPAL_USER_ID]);
    });

    it('should return empty array when student has no class enrolment', async () => {
      mockPrisma.classEnrolment.findFirst.mockResolvedValue(null);

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'yellow', {});

      expect(result.recipientUserIds).toEqual([]);
    });

    it('should return empty array when student has no year group', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ year_group_id: null });

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'amber', {});

      expect(result.recipientUserIds).toEqual([]);
    });

    it('should use fallback defaults for amber tier when no routing rules', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ year_group_id: 'yg-1' });
      mockPrisma.membershipRole.findMany.mockResolvedValue([
        { membership: { user_id: YEAR_HEAD_USER_ID } },
      ]);
      mockPrisma.class.findMany.mockResolvedValue([{ id: CLASS_ID }]);
      mockPrisma.classStaff.findMany.mockResolvedValue([{ staff_profile_id: STAFF_PROFILE_ID }]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { id: STAFF_PROFILE_ID, user_id: YEAR_HEAD_USER_ID },
      ]);

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'amber', {});

      expect(result.recipientUserIds).toContain(YEAR_HEAD_USER_ID);
      expect(result.routedRole).toBe('year_head');
    });

    it('should use fallback defaults for red tier when no routing rules', async () => {
      mockPrisma.membershipRole.findMany
        .mockResolvedValueOnce([{ membership: { user_id: PRINCIPAL_USER_ID } }])
        .mockResolvedValueOnce([{ membership: { user_id: YEAR_HEAD_USER_ID } }]);

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'red', {});

      expect(result.recipientUserIds).toContain(PRINCIPAL_USER_ID);
      expect(result.routedRole).toBe('principal, pastoral_lead');
    });

    it('should resolve generic role via resolveByRole for unknown role keys', async () => {
      mockPrisma.membershipRole.findMany.mockResolvedValue([
        { membership: { user_id: PRINCIPAL_USER_ID } },
      ]);

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'yellow', {
        yellow: { role: 'custom_role' },
      });

      expect(result.recipientUserIds).toContain(PRINCIPAL_USER_ID);
      expect(result.routedRole).toBe('custom_role');
    });

    it('should handle tierRule with roles array', async () => {
      mockPrisma.membershipRole.findMany
        .mockResolvedValueOnce([{ membership: { user_id: PRINCIPAL_USER_ID } }])
        .mockResolvedValueOnce([{ membership: { user_id: YEAR_HEAD_USER_ID } }]);

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'amber', {
        amber: { roles: ['principal', 'pastoral_lead'] },
      });

      // Both are resolved by resolveByRole, so the mocks return one user each
      expect(result.recipientUserIds.length).toBeGreaterThanOrEqual(1);
      expect(result.routedRole).toBe('principal, pastoral_lead');
    });

    it('should return empty homeroom teacher when class has no homeroom staff', async () => {
      mockPrisma.classEnrolment.findFirst.mockResolvedValue({ class_id: CLASS_ID });
      // findStaffByClass returns rows but they'll be mapped with assignment_role: 'homeroom'
      // But the inner filter is on the mock level — classStaff.findMany returns empty
      mockPrisma.classStaff.findMany.mockResolvedValue([]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([]);

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'yellow', {
        yellow: { role: 'homeroom_teacher' },
      });

      // No homeroom staff found in the class → empty result
      // The mock maps all to homeroom, so this tests the case where no staff exist at all
      expect(result.recipientUserIds).toEqual([]);
    });

    it('should fallback to all year heads when no scoped year heads in year group classes', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ year_group_id: 'yg-1' });
      // year heads by role
      mockPrisma.membershipRole.findMany.mockResolvedValue([
        { membership: { user_id: YEAR_HEAD_USER_ID } },
      ]);
      mockPrisma.class.findMany.mockResolvedValue([{ id: CLASS_ID }]);
      // Class staff returns staff that are NOT year heads
      mockPrisma.classStaff.findMany.mockResolvedValue([{ staff_profile_id: 'other-staff-id' }]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { id: 'other-staff-id', user_id: 'other-user-id' },
      ]);

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'amber', {
        amber: { role: 'year_head' },
      });

      // scopedUserIds is empty since YEAR_HEAD_USER_ID is not in staffUserIds
      // Falls back to allYearHeadUserIds
      expect(result.recipientUserIds).toContain(YEAR_HEAD_USER_ID);
    });

    it('should return all year heads when no classes in year group', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ year_group_id: 'yg-1' });
      mockPrisma.membershipRole.findMany.mockResolvedValue([
        { membership: { user_id: YEAR_HEAD_USER_ID } },
      ]);
      mockPrisma.class.findMany.mockResolvedValue([]); // No classes in year group

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'amber', {
        amber: { role: 'year_head' },
      });

      expect(result.recipientUserIds).toContain(YEAR_HEAD_USER_ID);
    });

    it('should return empty when year_head role returns no users', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ year_group_id: 'yg-1' });
      mockPrisma.membershipRole.findMany.mockResolvedValue([]); // No year heads

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'amber', {
        amber: { role: 'year_head' },
      });

      expect(result.recipientUserIds).toEqual([]);
    });

    it('should filter non-string values from roles array', async () => {
      mockPrisma.membershipRole.findMany.mockResolvedValue([
        { membership: { user_id: PRINCIPAL_USER_ID } },
      ]);

      const result = await service.resolveRecipients(TENANT_ID, STUDENT_ID, 'red', {
        red: { roles: ['principal', 42, null, 'pastoral_lead'] },
      });

      // Only string roles should be processed
      expect(result.routedRole).toBe('principal, pastoral_lead');
    });
  });
});
