import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { AttendanceReadFacade } from './attendance-read.facade';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'student-1';
const SESSION_ID = 'session-1';

describe('AttendanceReadFacade', () => {
  let facade: AttendanceReadFacade;
  let mockPrisma: {
    dailyAttendanceSummary: {
      findMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
    attendancePatternAlert: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
    attendanceRecord: {
      findMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
    attendanceSession: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      dailyAttendanceSummary: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      attendancePatternAlert: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      attendanceRecord: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      attendanceSession: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AttendanceReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<AttendanceReadFacade>(AttendanceReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getStudentSummary ─────────────────────────────────────────────────

  describe('AttendanceReadFacade — getStudentSummary', () => {
    const dateRange = { from: new Date('2026-01-01'), to: new Date('2026-03-31') };

    it('should return zero counts when no summaries exist', async () => {
      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);

      const result = await facade.getStudentSummary(TENANT_ID, STUDENT_ID, dateRange);

      expect(result).toEqual({
        student_id: STUDENT_ID,
        total_days: 0,
        present: 0,
        absent: 0,
        late: 0,
        excused: 0,
        partially_absent: 0,
      });
    });

    it('should aggregate present and absent counts correctly', async () => {
      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([
        { derived_status: 'present' },
        { derived_status: 'present' },
        { derived_status: 'absent' },
        { derived_status: 'late' },
        { derived_status: 'excused' },
        { derived_status: 'partially_absent' },
      ]);

      const result = await facade.getStudentSummary(TENANT_ID, STUDENT_ID, dateRange);

      expect(result).toEqual({
        student_id: STUDENT_ID,
        total_days: 6,
        present: 2,
        absent: 1,
        late: 1,
        excused: 1,
        partially_absent: 1,
      });
    });

    it('should query with correct tenant, student, and date range', async () => {
      await facade.getStudentSummary(TENANT_ID, STUDENT_ID, dateRange);

      expect(mockPrisma.dailyAttendanceSummary.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          summary_date: { gte: dateRange.from, lte: dateRange.to },
        },
        select: { derived_status: true },
      });
    });
  });

  // ─── getStudentsSummary ────────────────────────────────────────────────

  describe('AttendanceReadFacade — getStudentsSummary', () => {
    const dateRange = { from: new Date('2026-01-01'), to: new Date('2026-03-31') };

    it('should return empty array when no student IDs are provided', async () => {
      const result = await facade.getStudentsSummary(TENANT_ID, [], dateRange);

      expect(result).toEqual([]);
      expect(mockPrisma.dailyAttendanceSummary.findMany).not.toHaveBeenCalled();
    });

    it('should return summaries for multiple students', async () => {
      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([
        { student_id: 'stu-1', derived_status: 'present' },
        { student_id: 'stu-1', derived_status: 'absent' },
        { student_id: 'stu-2', derived_status: 'present' },
      ]);

      const result = await facade.getStudentsSummary(TENANT_ID, ['stu-1', 'stu-2'], dateRange);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        student_id: 'stu-1',
        total_days: 2,
        present: 1,
        absent: 1,
      });
      expect(result[1]).toMatchObject({ student_id: 'stu-2', total_days: 1, present: 1 });
    });

    it('should include zero-count entries for students with no summaries', async () => {
      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);

      const result = await facade.getStudentsSummary(TENANT_ID, ['stu-1', 'stu-2'], dateRange);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ student_id: 'stu-1', total_days: 0 });
      expect(result[1]).toMatchObject({ student_id: 'stu-2', total_days: 0 });
    });
  });

  // ─── getPatternAlerts ──────────────────────────────────────────────────

  describe('AttendanceReadFacade — getPatternAlerts', () => {
    it('should return active and acknowledged alerts for a student', async () => {
      const alerts = [
        {
          id: 'alert-1',
          alert_type: 'excessive_absences',
          status: 'active',
          detected_date: new Date(),
          window_start: new Date(),
          window_end: new Date(),
          details_json: {},
          parent_notified: false,
          created_at: new Date(),
        },
      ];
      mockPrisma.attendancePatternAlert.findMany.mockResolvedValue(alerts);

      const result = await facade.getPatternAlerts(TENANT_ID, STUDENT_ID);

      expect(result).toEqual(alerts);
      expect(mockPrisma.attendancePatternAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
            status: { in: ['active', 'acknowledged'] },
          },
        }),
      );
    });
  });

  // ─── getAttendanceStatusCounts ─────────────────────────────────────────

  describe('AttendanceReadFacade — getAttendanceStatusCounts', () => {
    it('should return empty counts when no records exist', async () => {
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

      const result = await facade.getAttendanceStatusCounts(TENANT_ID, SESSION_ID);

      expect(result).toEqual({});
    });

    it('should aggregate counts by status', async () => {
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([
        { status: 'present' },
        { status: 'present' },
        { status: 'absent_unexcused' },
        { status: 'late' },
      ]);

      const result = await facade.getAttendanceStatusCounts(TENANT_ID, SESSION_ID);

      expect(result).toEqual({
        present: 2,
        absent_unexcused: 1,
        late: 1,
      });
    });
  });

  // ─── getDailyRecords ──────────────────────────────────────────────────

  describe('AttendanceReadFacade — getDailyRecords', () => {
    const dateRange = { from: new Date('2026-01-01'), to: new Date('2026-03-31') };

    it('should return empty array when no records exist', async () => {
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

      const result = await facade.getDailyRecords(TENANT_ID, STUDENT_ID, dateRange);

      expect(result).toEqual([]);
    });

    it('should map records to the DailyRecord shape', async () => {
      const sessionDate = new Date('2026-03-15');
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          status: 'present',
          reason: null,
          session: {
            id: 'sess-1',
            session_date: sessionDate,
            class_id: 'cls-1',
            class_entity: { name: 'Grade 1A' },
          },
        },
      ]);

      const result = await facade.getDailyRecords(TENANT_ID, STUDENT_ID, dateRange);

      expect(result).toEqual([
        {
          id: 'rec-1',
          session_id: 'sess-1',
          session_date: sessionDate,
          status: 'present',
          reason: null,
          class_id: 'cls-1',
          class_name: 'Grade 1A',
        },
      ]);
    });
  });

  // ─── countAttendanceRecords ────────────────────────────────────────────

  describe('AttendanceReadFacade — countAttendanceRecords', () => {
    it('should count all records without date filter', async () => {
      mockPrisma.attendanceRecord.count.mockResolvedValue(42);

      const result = await facade.countAttendanceRecords(TENANT_ID);

      expect(result).toBe(42);
      expect(mockPrisma.attendanceRecord.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
    });

    it('should count records before a given date', async () => {
      const beforeDate = new Date('2026-01-01');
      mockPrisma.attendanceRecord.count.mockResolvedValue(10);

      const result = await facade.countAttendanceRecords(TENANT_ID, { beforeDate });

      expect(result).toBe(10);
      expect(mockPrisma.attendanceRecord.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          created_at: { lt: beforeDate },
        },
      });
    });
  });

  // ─── findAllRecordsForStudent ──────────────────────────────────────────

  describe('AttendanceReadFacade — findAllRecordsForStudent', () => {
    it('should return all attendance records for a student', async () => {
      const records = [
        { id: 'rec-1', student_id: STUDENT_ID, status: 'present', marked_at: new Date() },
      ];
      mockPrisma.attendanceRecord.findMany.mockResolvedValue(records);

      const result = await facade.findAllRecordsForStudent(TENANT_ID, STUDENT_ID);

      expect(result).toEqual(records);
    });
  });

  // ─── findRecordsForStudentBySessionDate ────────────────────────────────

  describe('AttendanceReadFacade — findRecordsForStudentBySessionDate', () => {
    it('should return records filtered by session date range', async () => {
      const dateRange = { from: new Date('2026-01-01'), to: new Date('2026-03-31') };
      const records = [
        { id: 'rec-1', status: 'present', session: { session_date: new Date('2026-02-15') } },
      ];
      mockPrisma.attendanceRecord.findMany.mockResolvedValue(records);

      const result = await facade.findRecordsForStudentBySessionDate(
        TENANT_ID,
        STUDENT_ID,
        dateRange,
      );

      expect(result).toEqual(records);
    });
  });

  // ─── countSessions ────────────────────────────────────────────────────

  describe('AttendanceReadFacade — countSessions', () => {
    it('should count all sessions without filters', async () => {
      mockPrisma.attendanceSession.count.mockResolvedValue(5);

      const result = await facade.countSessions(TENANT_ID);

      expect(result).toBe(5);
    });

    it('should count sessions filtered by scheduleId', async () => {
      mockPrisma.attendanceSession.count.mockResolvedValue(3);

      const result = await facade.countSessions(TENANT_ID, { scheduleId: 'sched-1' });

      expect(result).toBe(3);
      expect(mockPrisma.attendanceSession.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ schedule_id: 'sched-1' }),
      });
    });

    it('should count sessions filtered by dateRange', async () => {
      const dateRange = { from: new Date('2026-01-01'), to: new Date('2026-03-31') };
      mockPrisma.attendanceSession.count.mockResolvedValue(2);

      const result = await facade.countSessions(TENANT_ID, { dateRange });

      expect(result).toBe(2);
      expect(mockPrisma.attendanceSession.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          session_date: { gte: dateRange.from, lte: dateRange.to },
        }),
      });
    });

    it('should count sessions filtered by status', async () => {
      mockPrisma.attendanceSession.count.mockResolvedValue(1);

      const result = await facade.countSessions(TENANT_ID, { status: 'submitted' });

      expect(result).toBe(1);
      expect(mockPrisma.attendanceSession.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ status: 'submitted' }),
      });
    });
  });

  // ─── findDailySummariesForStudent ──────────────────────────────────────

  describe('AttendanceReadFacade — findDailySummariesForStudent', () => {
    it('should return daily summaries for a date range', async () => {
      const dateRange = { from: new Date('2026-01-01'), to: new Date('2026-03-31') };
      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([
        { summary_date: new Date('2026-02-01'), derived_status: 'present' },
      ]);

      const result = await facade.findDailySummariesForStudent(TENANT_ID, STUDENT_ID, dateRange);

      expect(result).toHaveLength(1);
    });
  });

  // ─── countDailySummariesForStudent ─────────────────────────────────────

  describe('AttendanceReadFacade — countDailySummariesForStudent', () => {
    it('should count summaries in date range', async () => {
      const dateRange = { from: new Date('2026-01-01'), to: new Date('2026-03-31') };
      mockPrisma.dailyAttendanceSummary.count.mockResolvedValue(15);

      const result = await facade.countDailySummariesForStudent(TENANT_ID, STUDENT_ID, dateRange);

      expect(result).toBe(15);
    });
  });

  // ─── countAllDailySummariesForStudent ──────────────────────────────────

  describe('AttendanceReadFacade — countAllDailySummariesForStudent', () => {
    it('should count all summaries without date filter', async () => {
      mockPrisma.dailyAttendanceSummary.count.mockResolvedValue(50);

      const result = await facade.countAllDailySummariesForStudent(TENANT_ID, STUDENT_ID);

      expect(result).toBe(50);
    });
  });

  // ─── findAllDailySummariesForStudent ───────────────────────────────────

  describe('AttendanceReadFacade — findAllDailySummariesForStudent', () => {
    it('should return all summaries without date filter', async () => {
      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);

      const result = await facade.findAllDailySummariesForStudent(TENANT_ID, STUDENT_ID);

      expect(result).toEqual([]);
    });
  });

  // ─── findDailySummariesSince ───────────────────────────────────────────

  describe('AttendanceReadFacade — findDailySummariesSince', () => {
    it('should return summaries since a given date', async () => {
      const sinceDate = new Date('2026-03-01');
      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([
        { id: 'sum-1', summary_date: new Date('2026-03-05'), derived_status: 'present' },
      ]);

      const result = await facade.findDailySummariesSince(TENANT_ID, STUDENT_ID, sinceDate);

      expect(result).toHaveLength(1);
      expect(mockPrisma.dailyAttendanceSummary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            summary_date: { gte: sinceDate },
          }),
        }),
      );
    });
  });

  // ─── groupSummariesByStatus ────────────────────────────────────────────

  describe('AttendanceReadFacade — groupSummariesByStatus', () => {
    it('should group summaries by derived_status', async () => {
      const dateRange = { from: new Date('2026-01-01'), to: new Date('2026-03-31') };
      const groups = [
        { derived_status: 'present', _count: { _all: 10 } },
        { derived_status: 'absent', _count: { _all: 3 } },
      ];
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue(groups);

      const result = await facade.groupSummariesByStatus(TENANT_ID, STUDENT_ID, dateRange);

      expect(result).toEqual(groups);
    });
  });

  // ─── findActivePatternAlerts ───────────────────────────────────────────

  describe('AttendanceReadFacade — findActivePatternAlerts', () => {
    it('should return only active pattern alerts', async () => {
      const alerts = [
        {
          id: 'alert-1',
          alert_type: 'excessive_absences',
          status: 'active',
          detected_date: new Date(),
          window_start: new Date(),
          window_end: new Date(),
          details_json: {},
          parent_notified: false,
          created_at: new Date(),
        },
      ];
      mockPrisma.attendancePatternAlert.findMany.mockResolvedValue(alerts);

      const result = await facade.findActivePatternAlerts(TENANT_ID, STUDENT_ID);

      expect(result).toEqual(alerts);
      expect(mockPrisma.attendancePatternAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'active' }),
        }),
      );
    });
  });

  // ─── countActivePatternAlerts ──────────────────────────────────────────

  describe('AttendanceReadFacade — countActivePatternAlerts', () => {
    it('should count active alerts for the tenant', async () => {
      mockPrisma.attendancePatternAlert.count.mockResolvedValue(7);

      const result = await facade.countActivePatternAlerts(TENANT_ID);

      expect(result).toBe(7);
    });
  });

  // ─── findActiveAlertsByType ────────────────────────────────────────────

  describe('AttendanceReadFacade — findActiveAlertsByType', () => {
    it('should return active alerts filtered by type', async () => {
      const alerts = [{ student_id: STUDENT_ID, details_json: { count: 8 } }];
      mockPrisma.attendancePatternAlert.findMany.mockResolvedValue(alerts);

      const result = await facade.findActiveAlertsByType(TENANT_ID, 'excessive_absences');

      expect(result).toEqual(alerts);
    });
  });

  // ─── groupDailySummariesByStudent ──────────────────────────────────────

  describe('AttendanceReadFacade — groupDailySummariesByStudent', () => {
    it('should group by student_id with status filter', async () => {
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([
        { student_id: 'stu-1', _count: { student_id: 5 } },
      ]);

      const result = await facade.groupDailySummariesByStudent(TENANT_ID, {
        derivedStatuses: ['absent', 'partially_absent'],
      });

      expect(result).toHaveLength(1);
    });

    it('should apply date filter when provided', async () => {
      const dateFilter = { gte: new Date('2026-01-01'), lte: new Date('2026-03-31') };
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);

      await facade.groupDailySummariesByStudent(TENANT_ID, {
        derivedStatuses: ['absent'],
        dateFilter,
      });

      expect(mockPrisma.dailyAttendanceSummary.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            summary_date: dateFilter,
          }),
        }),
      );
    });
  });

  // ─── countDailySummaries ───────────────────────────────────────────────

  describe('AttendanceReadFacade — countDailySummaries', () => {
    it('should count summaries with status filter', async () => {
      mockPrisma.dailyAttendanceSummary.count.mockResolvedValue(20);

      const result = await facade.countDailySummaries(TENANT_ID, {
        derivedStatuses: ['absent'],
      });

      expect(result).toBe(20);
    });

    it('should apply date filter when provided', async () => {
      const dateFilter = { gte: new Date('2026-01-01') };
      mockPrisma.dailyAttendanceSummary.count.mockResolvedValue(5);

      await facade.countDailySummaries(TENANT_ID, {
        derivedStatuses: ['absent'],
        dateFilter,
      });

      expect(mockPrisma.dailyAttendanceSummary.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            summary_date: dateFilter,
          }),
        }),
      );
    });
  });

  // ─── findRecordsByStatusWithSession ────────────────────────────────────

  describe('AttendanceReadFacade — findRecordsByStatusWithSession', () => {
    it('should return records filtered by status not equal and session date range', async () => {
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([
        { student_id: 'stu-1', status: 'absent_unexcused', session: { session_date: new Date() } },
      ]);

      const result = await facade.findRecordsByStatusWithSession(TENANT_ID, {
        statusNot: 'present',
        sessionDateRange: { gte: new Date('2026-01-01'), lte: new Date('2026-03-31') },
      });

      expect(result).toHaveLength(1);
    });

    it('should query without statusNot when not provided', async () => {
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

      await facade.findRecordsByStatusWithSession(TENANT_ID, {
        sessionDateRange: { gte: new Date('2026-01-01'), lte: new Date('2026-03-31') },
      });

      // Verify that no status filter is applied
      const callArgs = mockPrisma.attendanceRecord.findMany.mock.calls[0]?.[0] as Record<
        string,
        unknown
      >;
      const where = callArgs.where as Record<string, unknown>;
      expect(where['status']).toBeUndefined();
    });
  });

  // ─── groupRecordsBy ────────────────────────────────────────────────────

  describe('AttendanceReadFacade — groupRecordsBy', () => {
    it('should group records by the given scalar fields', async () => {
      mockPrisma.attendanceRecord.groupBy.mockResolvedValue([{ status: 'present', _count: 5 }]);

      const result = await facade.groupRecordsBy(TENANT_ID, ['status']);

      expect(result).toEqual([{ status: 'present', _count: 5 }]);
    });
  });

  // ─── countRecordsGeneric ───────────────────────────────────────────────

  describe('AttendanceReadFacade — countRecordsGeneric', () => {
    it('should count records with arbitrary filter', async () => {
      mockPrisma.attendanceRecord.count.mockResolvedValue(12);

      const result = await facade.countRecordsGeneric(TENANT_ID, { status: 'present' });

      expect(result).toBe(12);
    });

    it('should count all records when no filter is provided', async () => {
      mockPrisma.attendanceRecord.count.mockResolvedValue(100);

      const result = await facade.countRecordsGeneric(TENANT_ID);

      expect(result).toBe(100);
    });
  });

  // ─── findRecordsGeneric ────────────────────────────────────────────────

  describe('AttendanceReadFacade — findRecordsGeneric', () => {
    it('should find records with where, select, orderBy, and take options', async () => {
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([{ id: 'rec-1' }]);

      const result = await facade.findRecordsGeneric(TENANT_ID, {
        where: { status: 'present' },
        take: 10,
      });

      expect(result).toHaveLength(1);
    });

    it('should work with minimal options', async () => {
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

      const result = await facade.findRecordsGeneric(TENANT_ID, {});

      expect(result).toEqual([]);
    });
  });

  // ─── findSessionsGeneric ───────────────────────────────────────────────

  describe('AttendanceReadFacade — findSessionsGeneric', () => {
    it('should find sessions with arbitrary options', async () => {
      mockPrisma.attendanceSession.findMany.mockResolvedValue([{ id: 'sess-1' }]);

      const result = await facade.findSessionsGeneric(TENANT_ID, {
        where: { status: 'submitted' },
      });

      expect(result).toHaveLength(1);
    });
  });

  // ─── countSessionsGeneric ──────────────────────────────────────────────

  describe('AttendanceReadFacade — countSessionsGeneric', () => {
    it('should count sessions with arbitrary filter', async () => {
      mockPrisma.attendanceSession.count.mockResolvedValue(8);

      const result = await facade.countSessionsGeneric(TENANT_ID, { status: 'open' });

      expect(result).toBe(8);
    });

    it('should count all sessions when no filter is provided', async () => {
      mockPrisma.attendanceSession.count.mockResolvedValue(25);

      const result = await facade.countSessionsGeneric(TENANT_ID);

      expect(result).toBe(25);
    });
  });
});
