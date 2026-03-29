import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EarlyWarningCohortService,
        { provide: PrismaService, useValue: mockPrisma },
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

      const result = await service.getCohortPivot(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        { group_by: 'year_group', period: 'current' },
      );

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
        service.getCohortPivot(
          TENANT_ID,
          USER_ID,
          MEMBERSHIP_ID,
          { group_by: 'year_group', period: 'current' },
        ),
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

      const result = await service.getCohortPivot(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        { group_by: 'class', period: 'current' },
      );

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

      const result = await service.getCohortPivot(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        { group_by: 'year_group', period: 'current' },
      );

      expect(result.data).toEqual([]);
    });
  });
});
