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
              return rows.map((r: Record<string, unknown>) => ({ ...r, assignment_role: 'homeroom' }));
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
      mockPrisma.classStaff.findMany.mockResolvedValue([
        { staff_profile_id: STAFF_PROFILE_ID },
      ]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { user_id: TEACHER_USER_ID },
      ]);

      const result = await service.resolveRecipients(
        TENANT_ID,
        STUDENT_ID,
        'yellow',
        { yellow: { role: 'homeroom_teacher' } },
      );

      expect(result.recipientUserIds).toEqual([TEACHER_USER_ID]);
    });

    it('should resolve year head for amber tier', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ year_group_id: 'yg-1' });
      mockPrisma.membershipRole.findMany.mockResolvedValue([
        { membership: { user_id: YEAR_HEAD_USER_ID } },
      ]);
      mockPrisma.class.findMany.mockResolvedValue([{ id: CLASS_ID }]);
      mockPrisma.classStaff.findMany.mockResolvedValue([
        { staff_profile_id: STAFF_PROFILE_ID },
      ]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { id: STAFF_PROFILE_ID, user_id: YEAR_HEAD_USER_ID },
      ]);

      const result = await service.resolveRecipients(
        TENANT_ID,
        STUDENT_ID,
        'amber',
        { amber: { role: 'year_head' } },
      );

      expect(result.recipientUserIds).toEqual([YEAR_HEAD_USER_ID]);
    });

    it('should resolve multiple roles for red tier', async () => {
      mockPrisma.membershipRole.findMany
        .mockResolvedValueOnce([{ membership: { user_id: PRINCIPAL_USER_ID } }])
        .mockResolvedValueOnce([{ membership: { user_id: YEAR_HEAD_USER_ID } }]);

      const result = await service.resolveRecipients(
        TENANT_ID,
        STUDENT_ID,
        'red',
        { red: { roles: ['principal', 'pastoral_lead'] } },
      );

      expect(result.recipientUserIds).toHaveLength(2);
      expect(result.recipientUserIds).toContain(PRINCIPAL_USER_ID);
    });

    it('should use fallback defaults when no routing rules configured', async () => {
      mockPrisma.classEnrolment.findFirst.mockResolvedValue({ class_id: CLASS_ID });
      mockPrisma.classStaff.findMany.mockResolvedValue([
        { staff_profile_id: STAFF_PROFILE_ID },
      ]);
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { user_id: TEACHER_USER_ID },
      ]);

      const result = await service.resolveRecipients(
        TENANT_ID,
        STUDENT_ID,
        'yellow',
        {},
      );

      expect(result.recipientUserIds).toEqual([TEACHER_USER_ID]);
    });

    it('should deduplicate recipient user IDs', async () => {
      mockPrisma.membershipRole.findMany
        .mockResolvedValueOnce([{ membership: { user_id: PRINCIPAL_USER_ID } }])
        .mockResolvedValueOnce([{ membership: { user_id: PRINCIPAL_USER_ID } }]);

      const result = await service.resolveRecipients(
        TENANT_ID,
        STUDENT_ID,
        'red',
        { red: { roles: ['principal', 'pastoral_lead'] } },
      );

      expect(result.recipientUserIds).toEqual([PRINCIPAL_USER_ID]);
    });

    it('should return empty array when student has no class enrolment', async () => {
      mockPrisma.classEnrolment.findFirst.mockResolvedValue(null);

      const result = await service.resolveRecipients(
        TENANT_ID,
        STUDENT_ID,
        'yellow',
        {},
      );

      expect(result.recipientUserIds).toEqual([]);
    });

    it('should return empty array when student has no year group', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ year_group_id: null });

      const result = await service.resolveRecipients(
        TENANT_ID,
        STUDENT_ID,
        'amber',
        {},
      );

      expect(result.recipientUserIds).toEqual([]);
    });
  });
});
