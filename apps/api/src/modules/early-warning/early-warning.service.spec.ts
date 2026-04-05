import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  RbacReadFacade,
  AcademicReadFacade,
  StaffProfileReadFacade,
  ClassesReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { EarlyWarningService } from './early-warning.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-uuid-1';
const MEMBERSHIP_ID = 'mem-1';
const STUDENT_ID = 'student-uuid-1';
const ACADEMIC_YEAR_ID = 'ay-uuid-1';
const PROFILE_ID = 'profile-uuid-1';

// ─── RLS mock ────────────────────────────────────────────────────────────────

const mockRlsTx = {
  studentRiskProfile: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

const buildMockPrisma = () => ({
  tenantMembership: {
    findFirst: jest.fn(),
  },
  staffProfile: {
    findFirst: jest.fn(),
  },
  classStaff: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  classEnrolment: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  student: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  academicYear: {
    findFirst: jest.fn(),
  },
  studentRiskProfile: {
    count: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    groupBy: jest.fn(),
  },
  studentRiskSignal: {
    findMany: jest.fn(),
  },
  earlyWarningTierTransition: {
    findMany: jest.fn(),
  },
  user: {
    findFirst: jest.fn(),
  },
});

// ─── Helper: mock admin membership ──────────────────────────────────────────

const adminMembership = {
  id: MEMBERSHIP_ID,
  membership_roles: [
    {
      role: {
        role_permissions: [
          { permission: { permission_key: 'early_warning.manage' } },
          { permission: { permission_key: 'early_warning.view' } },
        ],
      },
    },
  ],
};

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('EarlyWarningService', () => {
  let service: EarlyWarningService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        EarlyWarningService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: RbacReadFacade,
          useValue: {
            findMembershipByIdAndUser: mockPrisma.tenantMembership.findFirst,
            findMembershipSummary: jest.fn().mockImplementation(async () => {
              const row = await mockPrisma.tenantMembership.findFirst();
              return row ? { ...row, membership_status: 'active' } : null;
            }),
          },
        },
        {
          provide: AcademicReadFacade,
          useValue: {
            findCurrentYearId: jest.fn().mockImplementation(async () => {
              const ay = await mockPrisma.academicYear.findFirst();
              if (!ay) {
                throw new NotFoundException({
                  code: 'ACADEMIC_YEAR_NOT_FOUND',
                  message: 'No active academic year found for this tenant',
                });
              }
              return ay.id;
            }),
          },
        },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            findByUserId: mockPrisma.staffProfile.findFirst,
          },
        },
        {
          provide: ClassesReadFacade,
          useValue: {
            findClassesByStaff: mockPrisma.classStaff.findMany,
            findEnrolledStudentIds: jest.fn().mockImplementation(async () => {
              const rows = await mockPrisma.classEnrolment.findMany();
              return rows.map((r: { student_id: string }) => r.student_id);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<EarlyWarningService>(EarlyWarningService);

    // Reset RLS mocks
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => fn.mockReset()),
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listProfiles ─────────────────────────────────────────────────────

  describe('listProfiles', () => {
    const query = {
      page: 1,
      pageSize: 20,
      sort: 'composite_score' as const,
      order: 'desc' as const,
    };

    it('should return paginated profiles for admin (unrestricted)', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.count.mockResolvedValue(1);
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([
        {
          id: PROFILE_ID,
          student_id: STUDENT_ID,
          composite_score: 65,
          risk_tier: 'amber',
          tier_entered_at: new Date('2026-03-25'),
          attendance_score: 70,
          grades_score: 60,
          behaviour_score: 55,
          wellbeing_score: 50,
          engagement_score: 40,
          signal_summary_json: {
            topSignals: [{ summaryFragment: 'Absent 3 consecutive days' }],
          },
          trend_json: { dailyScores: [50, 55, 60, 65] },
          assigned_to_user_id: null,
          last_computed_at: new Date('2026-03-28'),
          student: {
            id: STUDENT_ID,
            first_name: 'John',
            last_name: 'Doe',
            year_group: { name: 'Year 5' },
            class_enrolments: [{ class_entity: { name: '5A' } }],
          },
          assigned_to: null,
        },
      ]);

      const result = await service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, query);

      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.student_name).toBe('John Doe');
      expect(result.data[0]!.composite_score).toBe(65);
      expect(result.data[0]!.top_signal).toBe('Absent 3 consecutive days');
      expect(result.data[0]!.year_group_name).toBe('Year 5');
      expect(result.data[0]!.class_name).toBe('5A');
      expect(result.data[0]!.trend_data).toEqual([50, 55, 60, 65]);
    });

    it('should throw NotFoundException when no active academic year', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      await expect(service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, query)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should scope to teacher classes when user has no manage permission', async () => {
      // Teacher membership — no early_warning.manage
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({
        id: MEMBERSHIP_ID,
        membership_roles: [
          {
            role: {
              role_permissions: [{ permission: { permission_key: 'early_warning.view' } }],
            },
          },
        ],
      });
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: 'staff-profile-1' });
      mockPrisma.classStaff.findMany.mockResolvedValue([{ class_id: 'class-1' }]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        { student_id: 'student-a' },
        { student_id: 'student-b' },
      ]);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.count.mockResolvedValue(0);
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);

      const result = await service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, query);

      expect(result.data).toEqual([]);
      // Verify the where clause was scoped
      expect(mockPrisma.studentRiskProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: { in: ['student-a', 'student-b'] },
          }),
        }),
      );
    });
  });

  // ─── getTierSummary ───────────────────────────────────────────────────

  describe('getTierSummary', () => {
    it('should return tier distribution counts', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.groupBy.mockResolvedValue([
        { risk_tier: 'green', _count: { id: 180 } },
        { risk_tier: 'yellow', _count: { id: 28 } },
        { risk_tier: 'amber', _count: { id: 12 } },
        { risk_tier: 'red', _count: { id: 3 } },
      ]);

      const result = await service.getTierSummary(TENANT_ID, USER_ID, MEMBERSHIP_ID, {});

      expect(result).toEqual({
        green: 180,
        yellow: 28,
        amber: 12,
        red: 3,
        total: 223,
      });
    });
  });

  // ─── getStudentDetail ─────────────────────────────────────────────────

  describe('getStudentDetail', () => {
    it('should return full student detail with signals and transitions', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
        composite_score: 65,
        risk_tier: 'amber',
        tier_entered_at: new Date('2026-03-25'),
        attendance_score: 70,
        grades_score: 60,
        behaviour_score: 55,
        wellbeing_score: 50,
        engagement_score: 40,
        signal_summary_json: { summaryText: 'Test summary' },
        trend_json: { dailyScores: [50, 55, 60, 65] },
        assigned_to_user_id: null,
        assigned_to: null,
        assigned_at: null,
        last_computed_at: new Date('2026-03-28'),
        student: { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' },
      });
      mockPrisma.studentRiskSignal.findMany.mockResolvedValue([
        {
          id: 'sig-1',
          domain: 'attendance',
          signal_type: 'consecutive_absences',
          severity: 'high',
          score_contribution: 25,
          details_json: { days: 3 },
          detected_at: new Date('2026-03-27'),
        },
      ]);
      mockPrisma.earlyWarningTierTransition.findMany.mockResolvedValue([
        {
          id: 'trans-1',
          from_tier: 'yellow',
          to_tier: 'amber',
          composite_score: 55,
          trigger_signals_json: { signal: 'attendance' },
          transitioned_at: new Date('2026-03-25'),
        },
      ]);

      const result = await service.getStudentDetail(TENANT_ID, USER_ID, MEMBERSHIP_ID, STUDENT_ID);

      expect(result.student_name).toBe('John Doe');
      expect(result.signals).toHaveLength(1);
      expect(result.signals[0]!.signal_type).toBe('consecutive_absences');
      expect(result.transitions).toHaveLength(1);
      expect(result.transitions[0]!.to_tier).toBe('amber');
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.getStudentDetail(TENANT_ID, USER_ID, MEMBERSHIP_ID, STUDENT_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when teacher cannot access student', async () => {
      // Teacher membership — no early_warning.manage
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({
        id: MEMBERSHIP_ID,
        membership_roles: [
          {
            role: {
              role_permissions: [{ permission: { permission_key: 'early_warning.view' } }],
            },
          },
        ],
      });
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: 'staff-profile-1' });
      mockPrisma.classStaff.findMany.mockResolvedValue([{ class_id: 'class-1' }]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        { student_id: 'other-student' }, // Not STUDENT_ID
      ]);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });

      await expect(
        service.getStudentDetail(TENANT_ID, USER_ID, MEMBERSHIP_ID, STUDENT_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── acknowledgeProfile ───────────────────────────────────────────────

  describe('acknowledgeProfile', () => {
    it('should update the profile with acknowledged_by and acknowledged_at', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockRlsTx.studentRiskProfile.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
      });
      mockRlsTx.studentRiskProfile.update.mockResolvedValue({});

      await service.acknowledgeProfile(TENANT_ID, USER_ID, STUDENT_ID);

      expect(mockRlsTx.studentRiskProfile.update).toHaveBeenCalledWith({
        where: { id: PROFILE_ID },
        data: {
          acknowledged_by_user_id: USER_ID,
          acknowledged_at: expect.any(Date),
        },
      });
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockRlsTx.studentRiskProfile.findFirst.mockResolvedValue(null);

      await expect(service.acknowledgeProfile(TENANT_ID, USER_ID, STUDENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── assignStaff ──────────────────────────────────────────────────────

  describe('assignStaff', () => {
    const dto = { assigned_to_user_id: 'staff-uuid-1' };

    it('should assign a staff member to the risk profile', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({ id: 'mem-staff' });
      mockRlsTx.studentRiskProfile.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
      });
      mockRlsTx.studentRiskProfile.update.mockResolvedValue({
        id: PROFILE_ID,
        assigned_to_user_id: 'staff-uuid-1',
        assigned_at: new Date('2026-03-28T10:00:00Z'),
      });

      const result = await service.assignStaff(TENANT_ID, USER_ID, STUDENT_ID, dto);

      expect(result.assigned_to_user_id).toBe('staff-uuid-1');
      expect(mockRlsTx.studentRiskProfile.update).toHaveBeenCalledWith({
        where: { id: PROFILE_ID },
        data: {
          assigned_to_user_id: 'staff-uuid-1',
          assigned_at: expect.any(Date),
        },
      });
    });

    it('should throw NotFoundException when target user has no active membership', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(null);

      await expect(service.assignStaff(TENANT_ID, USER_ID, STUDENT_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({ id: 'mem-staff' });
      mockRlsTx.studentRiskProfile.findFirst.mockResolvedValue(null);

      await expect(service.assignStaff(TENANT_ID, USER_ID, STUDENT_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when target membership is not active', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      // findMembershipSummary returns inactive membership
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({
        id: 'mem-staff',
        membership_status: 'suspended',
      });

      await expect(service.assignStaff(TENANT_ID, USER_ID, STUDENT_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── listProfiles — query filter branches ─────────────────────────────

  describe('listProfiles — filter branches', () => {
    const baseQuery = {
      page: 1,
      pageSize: 20,
      sort: 'composite_score' as const,
      order: 'desc' as const,
    };

    beforeEach(() => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.count.mockResolvedValue(0);
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);
    });

    it('should apply tier filter', async () => {
      await service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        ...baseQuery,
        tier: 'red',
      });

      expect(mockPrisma.studentRiskProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            risk_tier: 'red',
          }),
        }),
      );
    });

    it('should apply year_group_id filter only', async () => {
      await service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        ...baseQuery,
        year_group_id: 'yg-1',
      });

      expect(mockPrisma.studentRiskProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student: expect.objectContaining({
              year_group_id: 'yg-1',
            }),
          }),
        }),
      );
    });

    it('should apply class_id filter only', async () => {
      await service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        ...baseQuery,
        class_id: 'cls-1',
      });

      expect(mockPrisma.studentRiskProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student: expect.objectContaining({
              class_enrolments: { some: { class_id: 'cls-1', status: 'active' } },
            }),
          }),
        }),
      );
    });

    it('should apply search filter on top of other student filters', async () => {
      await service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        ...baseQuery,
        year_group_id: 'yg-1',
        search: 'john',
      });

      expect(mockPrisma.studentRiskProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student: expect.objectContaining({
              year_group_id: 'yg-1',
              OR: [
                { first_name: { contains: 'john', mode: 'insensitive' } },
                { last_name: { contains: 'john', mode: 'insensitive' } },
              ],
            }),
          }),
        }),
      );
    });

    it('should apply search filter alone without year_group_id or class_id', async () => {
      await service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        ...baseQuery,
        search: 'smith',
      });

      expect(mockPrisma.studentRiskProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student: expect.objectContaining({
              OR: expect.arrayContaining([
                { first_name: { contains: 'smith', mode: 'insensitive' } },
              ]),
            }),
          }),
        }),
      );
    });

    it('should sort by student_name', async () => {
      await service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        ...baseQuery,
        sort: 'student_name',
        order: 'asc',
      });

      expect(mockPrisma.studentRiskProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { student: { last_name: 'asc' } },
        }),
      );
    });

    it('should sort by tier_entered_at', async () => {
      await service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        ...baseQuery,
        sort: 'tier_entered_at',
        order: 'desc',
      });

      expect(mockPrisma.studentRiskProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { tier_entered_at: 'desc' },
        }),
      );
    });
  });

  // ─── listProfiles — data mapping edge cases ───────────────────────────

  describe('listProfiles — data mapping branches', () => {
    const query = {
      page: 1,
      pageSize: 20,
      sort: 'composite_score' as const,
      order: 'desc' as const,
    };

    beforeEach(() => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
    });

    it('should handle null signal_summary_json', async () => {
      mockPrisma.studentRiskProfile.count.mockResolvedValue(1);
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([
        {
          id: PROFILE_ID,
          student_id: STUDENT_ID,
          composite_score: 50,
          risk_tier: 'yellow',
          tier_entered_at: new Date(),
          signal_summary_json: null,
          trend_json: null,
          last_computed_at: new Date(),
          student: {
            id: STUDENT_ID,
            first_name: 'Jane',
            last_name: 'Doe',
            year_group: null,
            class_enrolments: [],
          },
          assigned_to: null,
        },
      ]);

      const result = await service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, query);

      expect(result.data[0]!.top_signal).toBeNull();
      expect(result.data[0]!.trend_data).toEqual([]);
      expect(result.data[0]!.year_group_name).toBeNull();
      expect(result.data[0]!.class_name).toBeNull();
      expect(result.data[0]!.assigned_to_name).toBeNull();
    });

    it('should handle signal_summary_json with topSignals but no summaryFragment', async () => {
      mockPrisma.studentRiskProfile.count.mockResolvedValue(1);
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([
        {
          id: PROFILE_ID,
          student_id: STUDENT_ID,
          composite_score: 50,
          risk_tier: 'yellow',
          tier_entered_at: new Date(),
          signal_summary_json: { topSignals: [{}] },
          trend_json: { dailyScores: [10, 20] },
          last_computed_at: new Date(),
          student: null,
          assigned_to: { id: 'user-1', first_name: 'Admin', last_name: 'User' },
        },
      ]);

      const result = await service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, query);

      // topSignals[0] exists but has no summaryFragment
      expect(result.data[0]!.top_signal).toBeNull();
      expect(result.data[0]!.student_name).toBe('Unknown');
      expect(result.data[0]!.assigned_to_name).toBe('Admin User');
    });

    it('should handle empty topSignals array', async () => {
      mockPrisma.studentRiskProfile.count.mockResolvedValue(1);
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([
        {
          id: PROFILE_ID,
          student_id: STUDENT_ID,
          composite_score: 50,
          risk_tier: 'yellow',
          tier_entered_at: new Date(),
          signal_summary_json: { topSignals: [] },
          trend_json: {},
          last_computed_at: new Date(),
          student: {
            id: STUDENT_ID,
            first_name: 'John',
            last_name: 'Doe',
            year_group: { name: 'Year 3' },
            class_enrolments: [{ class_entity: { name: '3B' } }],
          },
          assigned_to: null,
        },
      ]);

      const result = await service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, query);

      expect(result.data[0]!.top_signal).toBeNull();
      expect(result.data[0]!.trend_data).toEqual([]);
    });
  });

  // ─── listProfiles — null membershipId ──────────────────────────────────

  describe('listProfiles — null membershipId', () => {
    it('should scope to empty student ids when membershipId is null', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.count.mockResolvedValue(0);
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);

      const result = await service.listProfiles(TENANT_ID, USER_ID, null, {
        page: 1,
        pageSize: 20,
        sort: 'composite_score',
        order: 'desc',
      });

      expect(result.data).toEqual([]);
      expect(mockPrisma.studentRiskProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: { in: [] },
          }),
        }),
      );
    });
  });

  // ─── getTierSummary — filter branches ──────────────────────────────────

  describe('getTierSummary — filter branches', () => {
    beforeEach(() => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.groupBy.mockResolvedValue([]);
    });

    it('should apply year_group_id filter', async () => {
      await service.getTierSummary(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        year_group_id: 'yg-1',
      });

      expect(mockPrisma.studentRiskProfile.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student: expect.objectContaining({
              year_group_id: 'yg-1',
            }),
          }),
        }),
      );
    });

    it('should apply class_id filter', async () => {
      await service.getTierSummary(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        class_id: 'cls-1',
      });

      expect(mockPrisma.studentRiskProfile.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student: expect.objectContaining({
              class_enrolments: { some: { class_id: 'cls-1', status: 'active' } },
            }),
          }),
        }),
      );
    });

    it('should return zero summary when groupBy returns unrecognized tiers', async () => {
      mockPrisma.studentRiskProfile.groupBy.mockResolvedValue([
        { risk_tier: 'unknown_tier', _count: { id: 5 } },
      ]);

      const result = await service.getTierSummary(TENANT_ID, USER_ID, MEMBERSHIP_ID, {});

      // unknown_tier is not in summary so it's skipped
      expect(result.total).toBe(0);
      expect(result.green).toBe(0);
    });
  });

  // ─── getStudentDetail — data mapping branches ──────────────────────────

  describe('getStudentDetail — data mapping branches', () => {
    beforeEach(() => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
    });

    it('should handle null signal details_json', async () => {
      mockPrisma.studentRiskProfile.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
        composite_score: 50,
        risk_tier: 'yellow',
        tier_entered_at: null,
        attendance_score: 50,
        grades_score: 50,
        behaviour_score: 50,
        wellbeing_score: 50,
        engagement_score: 50,
        signal_summary_json: null,
        trend_json: null,
        assigned_to_user_id: null,
        student: null,
        assigned_to: { id: 'u1', first_name: 'Staff', last_name: 'Member' },
      });
      mockPrisma.studentRiskSignal.findMany.mockResolvedValue([
        {
          id: 'sig-1',
          domain: 'attendance',
          signal_type: 'consecutive_absences',
          severity: 'high',
          score_contribution: 25,
          details_json: null,
          detected_at: new Date(),
        },
      ]);
      mockPrisma.earlyWarningTierTransition.findMany.mockResolvedValue([]);

      const result = await service.getStudentDetail(TENANT_ID, USER_ID, MEMBERSHIP_ID, STUDENT_ID);

      expect(result.student_name).toBe('Unknown');
      expect(result.summary_text).toBe('');
      expect(result.trend_data).toEqual([]);
      // null tier_entered_at uses current date
      expect(result.tier_entered_at).toBeDefined();
      expect(result.assigned_to_name).toBe('Staff Member');
      // Signal with null details_json should use signal_type as fallback for summaryFragment
      expect(result.signals[0]!.summary_fragment).toBe('consecutive_absences');
    });

    it('should handle signal with details_json containing summaryFragment', async () => {
      mockPrisma.studentRiskProfile.findFirst.mockResolvedValue({
        id: PROFILE_ID,
        student_id: STUDENT_ID,
        composite_score: 50,
        risk_tier: 'yellow',
        tier_entered_at: new Date(),
        attendance_score: 50,
        grades_score: 50,
        behaviour_score: 50,
        wellbeing_score: 50,
        engagement_score: 50,
        signal_summary_json: { summaryText: 'Here is a summary' },
        trend_json: { dailyScores: [10, 20, 30] },
        assigned_to_user_id: null,
        student: { id: STUDENT_ID, first_name: 'Ali', last_name: 'Khan' },
        assigned_to: null,
      });
      mockPrisma.studentRiskSignal.findMany.mockResolvedValue([
        {
          id: 'sig-1',
          domain: 'behaviour',
          signal_type: 'incident_frequency',
          severity: 'medium',
          score_contribution: 15,
          details_json: { summaryFragment: 'Custom fragment text' },
          detected_at: new Date(),
        },
      ]);
      mockPrisma.earlyWarningTierTransition.findMany.mockResolvedValue([]);

      const result = await service.getStudentDetail(TENANT_ID, USER_ID, MEMBERSHIP_ID, STUDENT_ID);

      expect(result.student_name).toBe('Ali Khan');
      expect(result.summary_text).toBe('Here is a summary');
      expect(result.trend_data).toEqual([10, 20, 30]);
      expect(result.assigned_to_name).toBeNull();
      expect(result.signals[0]!.summary_fragment).toBe('Custom fragment text');
    });
  });
});
