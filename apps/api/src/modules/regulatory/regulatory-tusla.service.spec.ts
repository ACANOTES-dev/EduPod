import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RegulatoryTuslaService } from './regulatory-tusla.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_A = '11111111-1111-1111-1111-111111111111';
const STUDENT_B = '22222222-2222-2222-2222-222222222222';
const SANCTION_ID = '33333333-3333-3333-3333-333333333333';
const EXCLUSION_ID = '44444444-4444-4444-4444-444444444444';

const mockStudentA = {
  id: STUDENT_A,
  first_name: 'Alice',
  last_name: 'Murphy',
  student_number: 'STU-001',
  date_of_birth: new Date('2010-03-15'),
  year_group: { id: 'yg-1', name: '1st Year' },
};

const mockStudentB = {
  id: STUDENT_B,
  first_name: 'Brian',
  last_name: 'O\'Brien',
  student_number: 'STU-002',
  date_of_birth: new Date('2010-06-22'),
  year_group: { id: 'yg-1', name: '1st Year' },
};

describe('RegulatoryTuslaService', () => {
  let service: RegulatoryTuslaService;
  let mockPrisma: {
    dailyAttendanceSummary: {
      groupBy: jest.Mock;
      count: jest.Mock;
    };
    attendanceRecord: {
      findMany: jest.Mock;
    };
    tuslaAbsenceCodeMapping: {
      findMany: jest.Mock;
    };
    student: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
    behaviourSanction: {
      findMany: jest.Mock;
    };
    behaviourExclusionCase: {
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      dailyAttendanceSummary: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      attendanceRecord: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      tuslaAbsenceCodeMapping: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      student: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      behaviourSanction: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      behaviourExclusionCase: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryTuslaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RegulatoryTuslaService>(RegulatoryTuslaService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Threshold Monitor ──────────────────────────────────────────────────────

  describe('getThresholdMonitor', () => {
    it('should return students with absent days >= 80% of threshold', async () => {
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([
        { student_id: STUDENT_A, _count: { student_id: 22 } },
        { student_id: STUDENT_B, _count: { student_id: 18 } },
      ]);
      mockPrisma.student.findMany.mockResolvedValue([mockStudentA, mockStudentB]);

      const result = await service.getThresholdMonitor(TENANT_ID, { threshold_days: 20 });

      expect(result.threshold).toBe(20);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.student!.id).toBe(STUDENT_A);
      expect(result.data[0]!.absent_days).toBe(22);
      expect(result.data[0]!.status).toBe('exceeding');
      expect(result.data[1]!.absent_days).toBe(18);
      expect(result.data[1]!.status).toBe('approaching');
    });

    it('should use default threshold of 20 when not specified', async () => {
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);

      const result = await service.getThresholdMonitor(TENANT_ID, {});

      expect(result.threshold).toBe(20);
      expect(result.data).toHaveLength(0);
    });

    it('should exclude students below approaching threshold', async () => {
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([
        { student_id: STUDENT_A, _count: { student_id: 10 } },
      ]);

      const result = await service.getThresholdMonitor(TENANT_ID, { threshold_days: 20 });

      // 10 < 16 (80% of 20), so not included
      expect(result.data).toHaveLength(0);
    });

    it('should apply date range filters', async () => {
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);

      await service.getThresholdMonitor(TENANT_ID, {
        start_date: '2025-09-01',
        end_date: '2025-12-20',
      });

      expect(mockPrisma.dailyAttendanceSummary.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            summary_date: {
              gte: new Date('2025-09-01'),
              lte: new Date('2025-12-20'),
            },
          }),
        }),
      );
    });
  });

  // ─── SAR Generation ─────────────────────────────────────────────────────────

  describe('generateSar', () => {
    it('should produce correct row count and categorisation', async () => {
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([
        {
          student_id: STUDENT_A,
          status: 'absent_excused',
          session: { session_date: new Date('2025-10-01') },
        },
        {
          student_id: STUDENT_A,
          status: 'absent_unexcused',
          session: { session_date: new Date('2025-10-02') },
        },
        {
          student_id: STUDENT_B,
          status: 'absent_excused',
          session: { session_date: new Date('2025-10-03') },
        },
      ]);

      mockPrisma.tuslaAbsenceCodeMapping.findMany.mockResolvedValue([
        { attendance_status: 'absent_excused', tusla_category: 'illness' },
        { attendance_status: 'absent_unexcused', tusla_category: 'unexplained' },
      ]);

      mockPrisma.student.findMany.mockResolvedValue([mockStudentA, mockStudentB]);

      const result = await service.generateSar(TENANT_ID, {
        academic_year: '2025-2026',
        period: 1,
        start_date: '2025-09-01',
        end_date: '2025-12-20',
      });

      expect(result.total_students).toBe(2);
      expect(result.rows).toHaveLength(2);

      const aliceRow = result.rows.find(r => r.student!.id === STUDENT_A);
      expect(aliceRow!.total_absent_days).toBe(2);
      expect(aliceRow!.categories['illness']).toBe(1);
      expect(aliceRow!.categories['unexplained']).toBe(1);
    });

    it('should deduplicate multiple sessions on the same day', async () => {
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([
        {
          student_id: STUDENT_A,
          status: 'absent_excused',
          session: { session_date: new Date('2025-10-01') },
        },
        {
          student_id: STUDENT_A,
          status: 'absent_excused',
          session: { session_date: new Date('2025-10-01') },
        },
      ]);

      mockPrisma.tuslaAbsenceCodeMapping.findMany.mockResolvedValue([
        { attendance_status: 'absent_excused', tusla_category: 'illness' },
      ]);

      mockPrisma.student.findMany.mockResolvedValue([mockStudentA]);

      const result = await service.generateSar(TENANT_ID, {
        academic_year: '2025-2026',
        period: 1,
        start_date: '2025-09-01',
        end_date: '2025-12-20',
      });

      // Two records on same day should count as 1 day
      expect(result.rows[0]!.total_absent_days).toBe(1);
    });

    it('should default to unexplained when no mapping exists', async () => {
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([
        {
          student_id: STUDENT_A,
          status: 'late',
          session: { session_date: new Date('2025-10-01') },
        },
      ]);

      mockPrisma.tuslaAbsenceCodeMapping.findMany.mockResolvedValue([]);
      mockPrisma.student.findMany.mockResolvedValue([mockStudentA]);

      const result = await service.generateSar(TENANT_ID, {
        academic_year: '2025-2026',
        period: 1,
        start_date: '2025-09-01',
        end_date: '2025-12-20',
      });

      expect(result.rows[0]!.categories['unexplained']).toBe(1);
    });
  });

  // ─── AAR Generation ─────────────────────────────────────────────────────────

  describe('generateAar', () => {
    it('should produce correct aggregate counts', async () => {
      mockPrisma.student.count.mockResolvedValue(120);
      mockPrisma.dailyAttendanceSummary.count.mockResolvedValue(450);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([
        { student_id: STUDENT_A, _count: { student_id: 25 } },
        { student_id: STUDENT_B, _count: { student_id: 22 } },
      ]);

      const result = await service.generateAar(TENANT_ID, {
        academic_year: '2025-2026',
      });

      expect(result.academic_year).toBe('2025-2026');
      expect(result.total_students).toBe(120);
      expect(result.total_days_lost).toBe(450);
      expect(result.students_over_20_days).toBe(2);
    });

    it('should filter by academic year date range', async () => {
      mockPrisma.student.count.mockResolvedValue(0);
      mockPrisma.dailyAttendanceSummary.count.mockResolvedValue(0);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);

      await service.generateAar(TENANT_ID, { academic_year: '2025-2026' });

      expect(mockPrisma.dailyAttendanceSummary.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            summary_date: {
              gte: new Date('2025-09-01'),
              lte: new Date('2026-08-31'),
            },
          }),
        }),
      );
    });
  });

  // ─── Suspensions ────────────────────────────────────────────────────────────

  describe('getSuspensions', () => {
    it('should filter by suspension_days >= 6', async () => {
      const mockSuspension = {
        id: SANCTION_ID,
        sanction_number: 'SNC-001',
        type: 'suspension_external',
        status: 'served',
        suspension_start_date: new Date('2025-10-01'),
        suspension_end_date: new Date('2025-10-08'),
        suspension_days: 7,
        notes: null,
        created_at: new Date(),
        student: mockStudentA,
      };
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([mockSuspension]);

      const result = await service.getSuspensions(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.suspension_days).toBe(7);
      expect(mockPrisma.behaviourSanction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: { in: ['suspension_internal', 'suspension_external'] },
            suspension_days: { gte: 6 },
          }),
        }),
      );
    });

    it('should filter by academic year when provided', async () => {
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([]);

      await service.getSuspensions(TENANT_ID, '2025-2026');

      expect(mockPrisma.behaviourSanction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: {
              gte: new Date('2025-09-01'),
              lte: new Date('2026-08-31'),
            },
          }),
        }),
      );
    });
  });

  // ─── Expulsions ─────────────────────────────────────────────────────────────

  describe('getExpulsions', () => {
    it('should return all exclusion cases', async () => {
      const mockExclusion = {
        id: EXCLUSION_ID,
        case_number: 'EXC-001',
        type: 'expulsion',
        status: 'finalised',
        decision: 'exclusion_confirmed',
        decision_date: new Date('2025-11-15'),
        formal_notice_issued_at: new Date('2025-11-01'),
        hearing_date: new Date('2025-11-10'),
        created_at: new Date(),
        student: mockStudentA,
        sanction: { id: SANCTION_ID, sanction_number: 'SNC-001', type: 'expulsion', suspension_days: null },
      };
      mockPrisma.behaviourExclusionCase.findMany.mockResolvedValue([mockExclusion]);

      const result = await service.getExpulsions(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.case_number).toBe('EXC-001');
      expect(mockPrisma.behaviourExclusionCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
        }),
      );
    });

    it('should filter by academic year when provided', async () => {
      mockPrisma.behaviourExclusionCase.findMany.mockResolvedValue([]);

      await service.getExpulsions(TENANT_ID, '2025-2026');

      expect(mockPrisma.behaviourExclusionCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: {
              gte: new Date('2025-09-01'),
              lte: new Date('2026-08-31'),
            },
          }),
        }),
      );
    });
  });
});
