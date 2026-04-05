import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  RbacReadFacade,
  AcademicReadFacade,
  StaffProfileReadFacade,
  ClassesReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { EarlyWarningCohortService } from './early-warning-cohort.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-uuid-1';
const MEMBERSHIP_ID = 'mem-1';
const ACADEMIC_YEAR_ID = 'ay-uuid-1';

// ─── Admin membership fixture ────────────────────────────────────────────────

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

// ─── Teacher membership fixture ──────────────────────────────────────────────

const teacherMembership = {
  id: MEMBERSHIP_ID,
  membership_roles: [
    {
      role: {
        role_permissions: [{ permission: { permission_key: 'early_warning.view' } }],
      },
    },
  ],
};

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('EarlyWarningCohortService', () => {
  let service: EarlyWarningCohortService;
  let mockPrisma: {
    tenantMembership: { findFirst: jest.Mock };
    staffProfile: { findFirst: jest.Mock };
    classStaff: { findMany: jest.Mock };
    classEnrolment: { findMany: jest.Mock };
    student: { findMany: jest.Mock };
    academicYear: { findFirst: jest.Mock };
    studentRiskProfile: { findMany: jest.Mock };
  };
  let mockStaffProfileFacade: { findByUserId: jest.Mock };
  let mockClassesFacade: {
    findClassesByStaff: jest.Mock;
    findEnrolledStudentIds: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      tenantMembership: { findFirst: jest.fn() },
      staffProfile: { findFirst: jest.fn() },
      classStaff: { findMany: jest.fn().mockResolvedValue([]) },
      classEnrolment: { findMany: jest.fn().mockResolvedValue([]) },
      student: { findMany: jest.fn().mockResolvedValue([]) },
      academicYear: { findFirst: jest.fn() },
      studentRiskProfile: { findMany: jest.fn() },
    };

    mockStaffProfileFacade = {
      findByUserId: jest.fn().mockResolvedValue(null),
    };

    mockClassesFacade = {
      findClassesByStaff: jest.fn().mockResolvedValue([]),
      findEnrolledStudentIds: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        EarlyWarningCohortService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: RbacReadFacade,
          useValue: {
            findMembershipByIdAndUser: mockPrisma.tenantMembership.findFirst,
          },
        },
        {
          provide: AcademicReadFacade,
          useValue: {
            findCurrentYear: mockPrisma.academicYear.findFirst,
          },
        },
        {
          provide: StaffProfileReadFacade,
          useValue: mockStaffProfileFacade,
        },
        {
          provide: ClassesReadFacade,
          useValue: mockClassesFacade,
        },
      ],
    }).compile();

    service = module.get<EarlyWarningCohortService>(EarlyWarningCohortService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getCohortPivot — year_group ──────────────────────────────────────

  describe('getCohortPivot — year_group', () => {
    it('should group profiles by year group with correct averages', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([
        {
          id: 'p1',
          student_id: 's1',
          composite_score: 60,
          attendance_score: 70,
          grades_score: 50,
          behaviour_score: 40,
          wellbeing_score: 30,
          engagement_score: 20,
          risk_tier: 'amber',
          student: {
            id: 's1',
            year_group_id: 'yg-1',
            year_group: { id: 'yg-1', name: '1st Year' },
            class_enrolments: [],
          },
        },
        {
          id: 'p2',
          student_id: 's2',
          composite_score: 40,
          attendance_score: 50,
          grades_score: 30,
          behaviour_score: 20,
          wellbeing_score: 10,
          engagement_score: 10,
          risk_tier: 'yellow',
          student: {
            id: 's2',
            year_group_id: 'yg-1',
            year_group: { id: 'yg-1', name: '1st Year' },
            class_enrolments: [],
          },
        },
        {
          id: 'p3',
          student_id: 's3',
          composite_score: 80,
          attendance_score: 90,
          grades_score: 70,
          behaviour_score: 60,
          wellbeing_score: 50,
          engagement_score: 40,
          risk_tier: 'red',
          student: {
            id: 's3',
            year_group_id: 'yg-2',
            year_group: { id: 'yg-2', name: '2nd Year' },
            class_enrolments: [],
          },
        },
      ]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'year_group',
        period: 'current',
      });

      expect(result.data).toHaveLength(2);

      // Sorted by avg_composite desc → 2nd Year (80) first, 1st Year (50) second
      const secondYear = result.data[0]!;
      expect(secondYear.group_name).toBe('2nd Year');
      expect(secondYear.student_count).toBe(1);
      expect(secondYear.avg_composite).toBe(80);

      const firstYear = result.data[1]!;
      expect(firstYear.group_name).toBe('1st Year');
      expect(firstYear.student_count).toBe(2);
      expect(firstYear.avg_composite).toBe(50);
    });

    it('should throw NotFoundException when no active academic year', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      await expect(
        service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
          group_by: 'year_group',
          period: 'current',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getCohortPivot — class ───────────────────────────────────────────

  describe('getCohortPivot — class', () => {
    it('should group profiles by class', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([
        {
          id: 'p1',
          student_id: 's1',
          composite_score: 60,
          attendance_score: 70,
          grades_score: 50,
          behaviour_score: 40,
          wellbeing_score: 30,
          engagement_score: 20,
          risk_tier: 'amber',
          student: {
            id: 's1',
            year_group_id: 'yg-1',
            year_group: null,
            class_enrolments: [
              { class_entity: { id: 'cls-1', name: 'Maths A', subject_id: null, subject: null } },
              { class_entity: { id: 'cls-2', name: 'English B', subject_id: null, subject: null } },
            ],
          },
        },
      ]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'class',
        period: 'current',
      });

      expect(result.data).toHaveLength(2);
      const classNames = result.data.map((c) => c.group_name);
      expect(classNames).toContain('Maths A');
      expect(classNames).toContain('English B');
    });
  });

  // ─── getCohortPivot — empty results ───────────────────────────────────

  describe('getCohortPivot — empty', () => {
    it('should return empty data array when no profiles exist', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'year_group',
        period: 'current',
      });

      expect(result.data).toEqual([]);
    });
  });

  // ─── resolveRoleScope — null membershipId ─────────────────────────────

  describe('getCohortPivot — resolveRoleScope branches', () => {
    it('should return empty studentIds when membershipId is null', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, null, {
        group_by: 'year_group',
        period: 'current',
      });

      expect(result.data).toEqual([]);
      // Should scope to empty student ids (not unrestricted)
      expect(mockPrisma.studentRiskProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: { in: [] },
          }),
        }),
      );
    });

    it('should return empty studentIds when membership not found', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(null);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'year_group',
        period: 'current',
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

    it('should resolve teacher scope via staff profile and classes', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(teacherMembership);
      mockStaffProfileFacade.findByUserId.mockResolvedValue({ id: 'staff-1' });
      mockClassesFacade.findClassesByStaff.mockResolvedValue([{ class_id: 'cls-1' }]);
      mockClassesFacade.findEnrolledStudentIds.mockResolvedValue(['s1', 's2']);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'year_group',
        period: 'current',
      });

      expect(result.data).toEqual([]);
      expect(mockPrisma.studentRiskProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student_id: { in: ['s1', 's2'] },
          }),
        }),
      );
    });

    it('should return empty studentIds when staff has no classes', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(teacherMembership);
      mockStaffProfileFacade.findByUserId.mockResolvedValue({ id: 'staff-1' });
      mockClassesFacade.findClassesByStaff.mockResolvedValue([]);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'year_group',
        period: 'current',
      });

      expect(result.data).toEqual([]);
    });

    it('should return empty studentIds when no staff profile exists', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(teacherMembership);
      mockStaffProfileFacade.findByUserId.mockResolvedValue(null);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'year_group',
        period: 'current',
      });

      expect(result.data).toEqual([]);
    });
  });

  // ─── getCohortPivot — query filters ───────────────────────────────────

  describe('getCohortPivot — query filters', () => {
    it('should apply tier filter to where clause', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);

      await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'year_group',
        period: 'current',
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

    it('should apply year_group_id filter to where clause', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);

      await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'year_group',
        period: 'current',
        year_group_id: 'yg-1',
      });

      expect(mockPrisma.studentRiskProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student: { year_group_id: 'yg-1' },
          }),
        }),
      );
    });

    it('should apply class_id filter to where clause', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);

      await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'year_group',
        period: 'current',
        class_id: 'cls-1',
      });

      expect(mockPrisma.studentRiskProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student: expect.objectContaining({
              class_enrolments: {
                some: { class_id: 'cls-1', status: 'active' },
              },
            }),
          }),
        }),
      );
    });

    it('should apply both year_group_id and class_id filters', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);

      await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'year_group',
        period: 'current',
        year_group_id: 'yg-1',
        class_id: 'cls-1',
      });

      expect(mockPrisma.studentRiskProfile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            student: expect.objectContaining({
              year_group_id: 'yg-1',
              class_enrolments: {
                some: { class_id: 'cls-1', status: 'active' },
              },
            }),
          }),
        }),
      );
    });
  });

  // ─── getCohortPivot — subject grouping ────────────────────────────────

  describe('getCohortPivot — subject', () => {
    it('should group profiles by subject and deduplicate', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([
        {
          id: 'p1',
          student_id: 's1',
          composite_score: 60,
          attendance_score: 70,
          grades_score: 50,
          behaviour_score: 40,
          wellbeing_score: 30,
          engagement_score: 20,
          risk_tier: 'amber',
          student: {
            id: 's1',
            year_group_id: 'yg-1',
            year_group: null,
            class_enrolments: [
              {
                class_entity: {
                  id: 'cls-1',
                  name: 'Maths A',
                  subject_id: 'sub-1',
                  subject: { id: 'sub-1', name: 'Mathematics' },
                },
              },
              {
                class_entity: {
                  id: 'cls-2',
                  name: 'Maths B',
                  subject_id: 'sub-1',
                  subject: { id: 'sub-1', name: 'Mathematics' },
                },
              },
              {
                class_entity: {
                  id: 'cls-3',
                  name: 'English',
                  subject_id: 'sub-2',
                  subject: { id: 'sub-2', name: 'English' },
                },
              },
              {
                class_entity: {
                  id: 'cls-4',
                  name: 'Art',
                  subject_id: null,
                  subject: null,
                },
              },
            ],
          },
        },
      ]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'subject',
        period: 'current',
      });

      // subject deduplication: sub-1 (Maths A + Maths B) counted once, sub-2 English, null subject skipped
      expect(result.data).toHaveLength(2);
      const subjectNames = result.data.map((d) => d.group_name);
      expect(subjectNames).toContain('Mathematics');
      expect(subjectNames).toContain('English');
    });
  });

  // ─── getCohortPivot — domain grouping ─────────────────────────────────

  describe('getCohortPivot — domain', () => {
    it('should group profiles by domain and use domain-specific avg_composite', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([
        {
          id: 'p1',
          student_id: 's1',
          composite_score: 60,
          attendance_score: 80,
          grades_score: 40,
          behaviour_score: 50,
          wellbeing_score: 30,
          engagement_score: 10,
          risk_tier: 'amber',
          student: {
            id: 's1',
            year_group_id: 'yg-1',
            year_group: null,
            class_enrolments: [],
          },
        },
      ]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'domain',
        period: 'current',
      });

      expect(result.data).toHaveLength(5);

      const attendance = result.data.find((d) => d.group_name === 'Attendance');
      expect(attendance).toBeDefined();
      expect(attendance!.avg_composite).toBe(80);

      const grades = result.data.find((d) => d.group_name === 'Grades');
      expect(grades).toBeDefined();
      expect(grades!.avg_composite).toBe(40);

      const behaviour = result.data.find((d) => d.group_name === 'Behaviour');
      expect(behaviour).toBeDefined();
      expect(behaviour!.avg_composite).toBe(50);

      const wellbeing = result.data.find((d) => d.group_name === 'Wellbeing');
      expect(wellbeing).toBeDefined();
      expect(wellbeing!.avg_composite).toBe(30);

      const engagement = result.data.find((d) => d.group_name === 'Engagement');
      expect(engagement).toBeDefined();
      expect(engagement!.avg_composite).toBe(10);

      // sorted by avg_composite desc
      expect(result.data[0]!.group_name).toBe('Attendance');
    });

    it('edge: should handle getDomainAvg with unknown domain id using 0 fallback', async () => {
      // This tests the ?? 0 branch in getDomainAvg when domainId is not in the map
      // In practice this cannot happen with the current domain grouping, but the branch exists
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'domain',
        period: 'current',
      });

      expect(result.data).toEqual([]);
    });
  });

  // ─── getCohortPivot — year_group with null year_group ─────────────────

  describe('getCohortPivot — edge cases', () => {
    it('edge: should skip profiles with null year_group when grouping by year_group', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([
        {
          id: 'p1',
          student_id: 's1',
          composite_score: 60,
          attendance_score: 70,
          grades_score: 50,
          behaviour_score: 40,
          wellbeing_score: 30,
          engagement_score: 20,
          risk_tier: 'amber',
          student: {
            id: 's1',
            year_group_id: null,
            year_group: null,
            class_enrolments: [],
          },
        },
      ]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'year_group',
        period: 'current',
      });

      // Profile is skipped because year_group is null
      expect(result.data).toEqual([]);
    });

    it('edge: should handle profiles with empty class_enrolments when grouping by class', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([
        {
          id: 'p1',
          student_id: 's1',
          composite_score: 60,
          attendance_score: 70,
          grades_score: 50,
          behaviour_score: 40,
          wellbeing_score: 30,
          engagement_score: 20,
          risk_tier: 'amber',
          student: {
            id: 's1',
            year_group_id: null,
            year_group: null,
            class_enrolments: undefined,
          },
        },
      ]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'class',
        period: 'current',
      });

      // No class enrolments → empty
      expect(result.data).toEqual([]);
    });

    it('edge: should handle profiles with undefined class_enrolments when grouping by subject', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(adminMembership);
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
      mockPrisma.studentRiskProfile.findMany.mockResolvedValue([
        {
          id: 'p1',
          student_id: 's1',
          composite_score: 60,
          attendance_score: 70,
          grades_score: 50,
          behaviour_score: 40,
          wellbeing_score: 30,
          engagement_score: 20,
          risk_tier: 'amber',
          student: {
            id: 's1',
            year_group_id: null,
            year_group: null,
          },
        },
      ]);

      const result = await service.getCohortPivot(TENANT_ID, USER_ID, MEMBERSHIP_ID, {
        group_by: 'subject',
        period: 'current',
      });

      expect(result.data).toEqual([]);
    });
  });
});
