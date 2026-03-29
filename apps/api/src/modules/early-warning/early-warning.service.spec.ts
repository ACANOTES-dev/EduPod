import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

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
    $transaction: jest.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
    ),
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
        EarlyWarningService,
        { provide: PrismaService, useValue: mockPrisma },
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
    const query = { page: 1, pageSize: 20, sort: 'composite_score' as const, order: 'desc' as const };

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

      await expect(
        service.listProfiles(TENANT_ID, USER_ID, MEMBERSHIP_ID, query),
      ).rejects.toThrow(NotFoundException);
    });

    it('should scope to teacher classes when user has no manage permission', async () => {
      // Teacher membership — no early_warning.manage
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({
        id: MEMBERSHIP_ID,
        membership_roles: [
          {
            role: {
              role_permissions: [
                { permission: { permission_key: 'early_warning.view' } },
              ],
            },
          },
        ],
      });
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: 'staff-profile-1' });
      mockPrisma.classStaff.findMany.mockResolvedValue([
        { class_id: 'class-1' },
      ]);
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
              role_permissions: [
                { permission: { permission_key: 'early_warning.view' } },
              ],
            },
          },
        ],
      });
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: 'staff-profile-1' });
      mockPrisma.classStaff.findMany.mockResolvedValue([
        { class_id: 'class-1' },
      ]);
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

      await expect(
        service.acknowledgeProfile(TENANT_ID, USER_ID, STUDENT_ID),
      ).rejects.toThrow(NotFoundException);
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

      await expect(
        service.assignStaff(TENANT_ID, USER_ID, STUDENT_ID, dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when profile does not exist', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({ id: 'mem-staff' });
      mockRlsTx.studentRiskProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.assignStaff(TENANT_ID, USER_ID, STUDENT_ID, dto),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
