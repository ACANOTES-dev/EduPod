import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { CrossModuleInsightsService } from './cross-module-insights.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('CrossModuleInsightsService', () => {
  let service: CrossModuleInsightsService;
  let mockPrisma: {
    attendanceRecord: { groupBy: jest.Mock };
    grade: { groupBy: jest.Mock; aggregate: jest.Mock };
    student: { findMany: jest.Mock; count: jest.Mock };
    payrollRun: { findMany: jest.Mock };
    yearGroup: { findMany: jest.Mock };
    invoice: { aggregate: jest.Mock };
    studentAcademicRiskAlert: { count: jest.Mock };
    staffProfile: { findMany: jest.Mock };
    classStaff: { findMany: jest.Mock };
    class: { findMany: jest.Mock };
    attendanceSession: { count: jest.Mock };
    assessment: { findMany: jest.Mock; count: jest.Mock };
    classEnrolment: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      attendanceRecord: { groupBy: jest.fn().mockResolvedValue([]) },
      grade: {
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _avg: { raw_score: null } }),
      },
      student: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'student-1', first_name: 'Alice', last_name: 'Smith' },
        ]),
        count: jest.fn().mockResolvedValue(10),
      },
      payrollRun: { findMany: jest.fn().mockResolvedValue([]) },
      yearGroup: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { aggregate: jest.fn().mockResolvedValue({ _sum: { total_amount: 0, amount_paid: 0 } }) },
      studentAcademicRiskAlert: { count: jest.fn().mockResolvedValue(0) },
      staffProfile: { findMany: jest.fn().mockResolvedValue([]) },
      classStaff: { findMany: jest.fn().mockResolvedValue([]) },
      class: { findMany: jest.fn().mockResolvedValue([]) },
      attendanceSession: { count: jest.fn().mockResolvedValue(0) },
      assessment: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      classEnrolment: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrossModuleInsightsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CrossModuleInsightsService>(CrossModuleInsightsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('attendanceVsGrades', () => {
    it('should return empty result when no shared students', async () => {
      const result = await service.attendanceVsGrades(TENANT_ID);

      expect(result.data_points).toEqual([]);
      expect(result.correlation_coefficient).toBeNull();
      expect(result.insight).toBeNull();
    });

    it('should return data points when students have both attendance and grades', async () => {
      mockPrisma.attendanceRecord.groupBy
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 10 }]) // total
        .mockResolvedValueOnce([{ student_id: 'student-1', _count: 8 }]); // present
      mockPrisma.grade.groupBy.mockResolvedValue([
        { student_id: 'student-1', _avg: { raw_score: 85 }, _count: 5 },
      ]);

      const result = await service.attendanceVsGrades(TENANT_ID);

      expect(result.data_points).toHaveLength(1);
      expect(result.data_points[0]?.attendance_rate).toBe(80);
      expect(result.data_points[0]?.average_grade).toBe(85);
    });
  });

  describe('costPerStudent', () => {
    it('should return empty array when no payroll runs', async () => {
      const result = await service.costPerStudent(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should compute cost_per_student from payroll total and student count', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([
        { period_label: '2026-01', total_pay: 50000 },
      ]);
      mockPrisma.student.count.mockResolvedValue(100);

      const result = await service.costPerStudent(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]?.cost_per_student).toBe(500);
    });
  });

  describe('yearGroupHealthScores', () => {
    it('should return empty array when no year groups', async () => {
      const result = await service.yearGroupHealthScores(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  describe('teacherEffectivenessIndex', () => {
    it('should return empty array when no staff', async () => {
      const result = await service.teacherEffectivenessIndex(TENANT_ID);

      expect(result).toEqual([]);
    });
  });
});
