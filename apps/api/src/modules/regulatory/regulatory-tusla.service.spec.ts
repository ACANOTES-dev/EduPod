import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { AttendanceReadFacade } from '../attendance/attendance-read.facade';
import { BehaviourReadFacade } from '../behaviour/behaviour-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

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
  last_name: "O'Brien",
  student_number: 'STU-002',
  date_of_birth: new Date('2010-06-22'),
  year_group: { id: 'yg-1', name: '1st Year' },
};

describe('RegulatoryTuslaService', () => {
  let service: RegulatoryTuslaService;
  let mockPrisma: {
    tuslaAbsenceCodeMapping: {
      findMany: jest.Mock;
    };
  };
  let mockStudentReadFacade: {
    findManyGeneric: jest.Mock;
    count: jest.Mock;
  };
  let mockBehaviourReadFacade: {
    findSanctionsForTusla: jest.Mock;
    findExclusionCasesForTusla: jest.Mock;
  };
  let mockAttendanceReadFacade: {
    groupDailySummariesByStudent: jest.Mock;
    countDailySummaries: jest.Mock;
    findRecordsByStatusWithSession: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      tuslaAbsenceCodeMapping: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    mockStudentReadFacade = {
      findManyGeneric: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    };
    mockBehaviourReadFacade = {
      findSanctionsForTusla: jest.fn().mockResolvedValue([]),
      findExclusionCasesForTusla: jest.fn().mockResolvedValue([]),
    };
    mockAttendanceReadFacade = {
      groupDailySummariesByStudent: jest.fn().mockResolvedValue([]),
      countDailySummaries: jest.fn().mockResolvedValue(0),
      findRecordsByStatusWithSession: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        RegulatoryTuslaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StudentReadFacade, useValue: mockStudentReadFacade },
        { provide: BehaviourReadFacade, useValue: mockBehaviourReadFacade },
        { provide: AttendanceReadFacade, useValue: mockAttendanceReadFacade },
      ],
    }).compile();

    service = module.get<RegulatoryTuslaService>(RegulatoryTuslaService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Threshold Monitor ──────────────────────────────────────────────────────

  describe('getThresholdMonitor', () => {
    it('should return students with absent days >= 80% of threshold', async () => {
      mockAttendanceReadFacade.groupDailySummariesByStudent.mockResolvedValue([
        { student_id: STUDENT_A, _count: { student_id: 22 } },
        { student_id: STUDENT_B, _count: { student_id: 18 } },
      ]);
      mockStudentReadFacade.findManyGeneric.mockResolvedValue([mockStudentA, mockStudentB]);

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
      mockAttendanceReadFacade.groupDailySummariesByStudent.mockResolvedValue([]);

      const result = await service.getThresholdMonitor(TENANT_ID, {});

      expect(result.threshold).toBe(20);
      expect(result.data).toHaveLength(0);
    });

    it('should exclude students below approaching threshold', async () => {
      mockAttendanceReadFacade.groupDailySummariesByStudent.mockResolvedValue([
        { student_id: STUDENT_A, _count: { student_id: 10 } },
      ]);

      const result = await service.getThresholdMonitor(TENANT_ID, { threshold_days: 20 });

      // 10 < 16 (80% of 20), so not included
      expect(result.data).toHaveLength(0);
    });

    it('should apply date range filters', async () => {
      mockAttendanceReadFacade.groupDailySummariesByStudent.mockResolvedValue([]);

      await service.getThresholdMonitor(TENANT_ID, {
        start_date: '2025-09-01',
        end_date: '2025-12-20',
      });

      expect(mockAttendanceReadFacade.groupDailySummariesByStudent).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          dateFilter: {
            gte: new Date('2025-09-01'),
            lte: new Date('2025-12-20'),
          },
        }),
      );
    });
  });

  // ─── SAR Generation ─────────────────────────────────────────────────────────

  describe('generateSar', () => {
    it('should produce correct row count and categorisation', async () => {
      mockAttendanceReadFacade.findRecordsByStatusWithSession.mockResolvedValue([
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

      mockStudentReadFacade.findManyGeneric.mockResolvedValue([mockStudentA, mockStudentB]);

      const result = await service.generateSar(TENANT_ID, {
        academic_year: '2025-2026',
        period: 1,
        start_date: '2025-09-01',
        end_date: '2025-12-20',
      });

      expect(result.total_students).toBe(2);
      expect(result.rows).toHaveLength(2);

      const aliceRow = result.rows.find((r) => r.student!.id === STUDENT_A);
      expect(aliceRow!.total_absent_days).toBe(2);
      expect(aliceRow!.categories['illness']).toBe(1);
      expect(aliceRow!.categories['unexplained']).toBe(1);
    });

    it('should deduplicate multiple sessions on the same day', async () => {
      mockAttendanceReadFacade.findRecordsByStatusWithSession.mockResolvedValue([
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

      mockStudentReadFacade.findManyGeneric.mockResolvedValue([mockStudentA]);

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
      mockAttendanceReadFacade.findRecordsByStatusWithSession.mockResolvedValue([
        {
          student_id: STUDENT_A,
          status: 'late',
          session: { session_date: new Date('2025-10-01') },
        },
      ]);

      mockPrisma.tuslaAbsenceCodeMapping.findMany.mockResolvedValue([]);
      mockStudentReadFacade.findManyGeneric.mockResolvedValue([mockStudentA]);

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
      mockStudentReadFacade.count.mockResolvedValue(120);
      mockAttendanceReadFacade.countDailySummaries.mockResolvedValue(450);
      mockAttendanceReadFacade.groupDailySummariesByStudent.mockResolvedValue([
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
      mockStudentReadFacade.count.mockResolvedValue(0);
      mockAttendanceReadFacade.countDailySummaries.mockResolvedValue(0);
      mockAttendanceReadFacade.groupDailySummariesByStudent.mockResolvedValue([]);

      await service.generateAar(TENANT_ID, { academic_year: '2025-2026' });

      expect(mockAttendanceReadFacade.countDailySummaries).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          dateFilter: {
            gte: new Date('2025-09-01'),
            lte: new Date('2026-08-31'),
          },
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
      mockBehaviourReadFacade.findSanctionsForTusla.mockResolvedValue([mockSuspension]);

      const result = await service.getSuspensions(TENANT_ID);

      expect(result).toHaveLength(1);
      expect((result[0] as Record<string, unknown>).suspension_days).toBe(7);
      expect(mockBehaviourReadFacade.findSanctionsForTusla).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          types: ['suspension_internal', 'suspension_external'],
          minSuspensionDays: 6,
        }),
      );
    });

    it('should filter by academic year when provided', async () => {
      mockBehaviourReadFacade.findSanctionsForTusla.mockResolvedValue([]);

      await service.getSuspensions(TENANT_ID, '2025-2026');

      expect(mockBehaviourReadFacade.findSanctionsForTusla).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          dateFilter: {
            gte: new Date('2025-09-01'),
            lte: new Date('2026-08-31'),
          },
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
        sanction: {
          id: SANCTION_ID,
          sanction_number: 'SNC-001',
          type: 'expulsion',
          suspension_days: null,
        },
      };
      mockBehaviourReadFacade.findExclusionCasesForTusla.mockResolvedValue([mockExclusion]);

      const result = await service.getExpulsions(TENANT_ID);

      expect(result).toHaveLength(1);
      expect((result[0] as Record<string, unknown>).case_number).toBe('EXC-001');
      expect(mockBehaviourReadFacade.findExclusionCasesForTusla).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({}),
      );
    });

    it('should filter by academic year when provided', async () => {
      mockBehaviourReadFacade.findExclusionCasesForTusla.mockResolvedValue([]);

      await service.getExpulsions(TENANT_ID, '2025-2026');

      expect(mockBehaviourReadFacade.findExclusionCasesForTusla).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          dateFilter: {
            gte: new Date('2025-09-01'),
            lte: new Date('2026-08-31'),
          },
        }),
      );
    });

    it('should pass undefined dateFilter when academic year not provided', async () => {
      mockBehaviourReadFacade.findExclusionCasesForTusla.mockResolvedValue([]);

      await service.getExpulsions(TENANT_ID);

      expect(mockBehaviourReadFacade.findExclusionCasesForTusla).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          dateFilter: undefined,
        }),
      );
    });
  });

  // ─── Threshold Monitor — additional branches ────────────────────────────────

  describe('RegulatoryTuslaService — getThresholdMonitor additional branches', () => {
    it('should filter out students that no longer exist in studentMap', async () => {
      mockAttendanceReadFacade.groupDailySummariesByStudent.mockResolvedValue([
        { student_id: STUDENT_A, _count: { student_id: 22 } },
        { student_id: 'non-existent-id', _count: { student_id: 25 } },
      ]);
      // Only return student A; the non-existent student is not in the results
      mockStudentReadFacade.findManyGeneric.mockResolvedValue([mockStudentA]);

      const result = await service.getThresholdMonitor(TENANT_ID, { threshold_days: 20 });

      // Should only include the student that exists in studentMap
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.student!.id).toBe(STUDENT_A);
    });

    it('should sort results by absent_days descending', async () => {
      mockAttendanceReadFacade.groupDailySummariesByStudent.mockResolvedValue([
        { student_id: STUDENT_B, _count: { student_id: 18 } },
        { student_id: STUDENT_A, _count: { student_id: 25 } },
      ]);
      mockStudentReadFacade.findManyGeneric.mockResolvedValue([mockStudentA, mockStudentB]);

      const result = await service.getThresholdMonitor(TENANT_ID, { threshold_days: 20 });

      expect(result.data[0]!.absent_days).toBe(25);
      expect(result.data[1]!.absent_days).toBe(18);
    });

    it('should pass no dateFilter when neither start_date nor end_date is provided', async () => {
      mockAttendanceReadFacade.groupDailySummariesByStudent.mockResolvedValue([]);

      await service.getThresholdMonitor(TENANT_ID, { threshold_days: 20 });

      expect(mockAttendanceReadFacade.groupDailySummariesByStudent).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          dateFilter: undefined,
        }),
      );
    });

    it('should pass partial dateFilter when only start_date is provided', async () => {
      mockAttendanceReadFacade.groupDailySummariesByStudent.mockResolvedValue([]);

      await service.getThresholdMonitor(TENANT_ID, {
        threshold_days: 20,
        start_date: '2025-09-01',
      });

      expect(mockAttendanceReadFacade.groupDailySummariesByStudent).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          dateFilter: { gte: new Date('2025-09-01') },
        }),
      );
    });

    it('should pass partial dateFilter when only end_date is provided', async () => {
      mockAttendanceReadFacade.groupDailySummariesByStudent.mockResolvedValue([]);

      await service.getThresholdMonitor(TENANT_ID, {
        threshold_days: 20,
        end_date: '2025-12-20',
      });

      expect(mockAttendanceReadFacade.groupDailySummariesByStudent).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          dateFilter: { lte: new Date('2025-12-20') },
        }),
      );
    });
  });

  // ─── SAR Generation — additional branches ──────────────────────────────────

  describe('RegulatoryTuslaService — generateSar additional branches', () => {
    it('should return empty rows when no attendance records exist', async () => {
      mockAttendanceReadFacade.findRecordsByStatusWithSession.mockResolvedValue([]);
      mockPrisma.tuslaAbsenceCodeMapping.findMany.mockResolvedValue([]);

      const result = await service.generateSar(TENANT_ID, {
        academic_year: '2025-2026',
        period: 1,
        start_date: '2025-09-01',
        end_date: '2025-12-20',
      });

      expect(result.total_students).toBe(0);
      expect(result.rows).toHaveLength(0);
      // Students should not have been fetched since studentIds is empty
      expect(mockStudentReadFacade.findManyGeneric).not.toHaveBeenCalled();
    });

    it('should filter out rows where student not found in studentMap', async () => {
      mockAttendanceReadFacade.findRecordsByStatusWithSession.mockResolvedValue([
        {
          student_id: 'non-existent-student',
          status: 'absent_excused',
          session: { session_date: new Date('2025-10-01') },
        },
      ]);
      mockPrisma.tuslaAbsenceCodeMapping.findMany.mockResolvedValue([
        { attendance_status: 'absent_excused', tusla_category: 'illness' },
      ]);
      // Return empty students list — no match
      mockStudentReadFacade.findManyGeneric.mockResolvedValue([]);

      const result = await service.generateSar(TENANT_ID, {
        academic_year: '2025-2026',
        period: 1,
        start_date: '2025-09-01',
        end_date: '2025-12-20',
      });

      // Row for non-existent student should be filtered out
      expect(result.total_students).toBe(0);
      expect(result.rows).toHaveLength(0);
    });

    it('should use tusla_category mapping from Prisma enum to API string', async () => {
      mockAttendanceReadFacade.findRecordsByStatusWithSession.mockResolvedValue([
        {
          student_id: STUDENT_A,
          status: 'absent_excused',
          session: { session_date: new Date('2025-10-01') },
        },
      ]);
      mockPrisma.tuslaAbsenceCodeMapping.findMany.mockResolvedValue([
        { attendance_status: 'absent_excused', tusla_category: 'urgent_family_reason' },
      ]);
      mockStudentReadFacade.findManyGeneric.mockResolvedValue([mockStudentA]);

      const result = await service.generateSar(TENANT_ID, {
        academic_year: '2025-2026',
        period: 1,
        start_date: '2025-09-01',
        end_date: '2025-12-20',
      });

      expect(result.rows[0]!.categories['urgent_family_reason']).toBe(1);
    });

    it('should sort SAR rows by total_absent_days descending', async () => {
      mockAttendanceReadFacade.findRecordsByStatusWithSession.mockResolvedValue([
        {
          student_id: STUDENT_A,
          status: 'absent_excused',
          session: { session_date: new Date('2025-10-01') },
        },
        {
          student_id: STUDENT_B,
          status: 'absent_excused',
          session: { session_date: new Date('2025-10-01') },
        },
        {
          student_id: STUDENT_B,
          status: 'absent_excused',
          session: { session_date: new Date('2025-10-02') },
        },
      ]);
      mockPrisma.tuslaAbsenceCodeMapping.findMany.mockResolvedValue([
        { attendance_status: 'absent_excused', tusla_category: 'illness' },
      ]);
      mockStudentReadFacade.findManyGeneric.mockResolvedValue([mockStudentA, mockStudentB]);

      const result = await service.generateSar(TENANT_ID, {
        academic_year: '2025-2026',
        period: 1,
        start_date: '2025-09-01',
        end_date: '2025-12-20',
      });

      // Student B has 2 days, Student A has 1 day → B should be first
      expect(result.rows[0]!.total_absent_days).toBe(2);
      expect(result.rows[1]!.total_absent_days).toBe(1);
    });
  });

  // ─── Suspensions — additional branches ──────────────────────────────────────

  describe('RegulatoryTuslaService — getSuspensions additional branches', () => {
    it('should pass undefined dateFilter when academic year not provided', async () => {
      mockBehaviourReadFacade.findSanctionsForTusla.mockResolvedValue([]);

      await service.getSuspensions(TENANT_ID);

      expect(mockBehaviourReadFacade.findSanctionsForTusla).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          dateFilter: undefined,
        }),
      );
    });
  });

  // ─── AAR — additional branches ──────────────────────────────────────────────

  describe('RegulatoryTuslaService — generateAar additional branches', () => {
    it('should count only students with 20+ absent days', async () => {
      mockStudentReadFacade.count.mockResolvedValue(50);
      mockAttendanceReadFacade.countDailySummaries.mockResolvedValue(100);
      mockAttendanceReadFacade.groupDailySummariesByStudent.mockResolvedValue([
        { student_id: STUDENT_A, _count: { student_id: 25 } }, // >= 20 → counted
        { student_id: STUDENT_B, _count: { student_id: 15 } }, // < 20 → not counted
      ]);

      const result = await service.generateAar(TENANT_ID, { academic_year: '2025-2026' });

      expect(result.students_over_20_days).toBe(1); // only Student A
    });
  });
});
