import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { AttendanceReportingService } from './attendance-reporting.service';
import { DailySummaryService } from './daily-summary.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'student-1';
const USER_ID = 'user-1';
const PARENT_ID = 'parent-1';
const SESSION_ID = 'session-1';
const CLASS_ID = 'class-1';

describe('AttendanceReportingService', () => {
  let service: AttendanceReportingService;
  let mockPrisma: {
    attendanceSession: { findMany: jest.Mock };
    dailyAttendanceSummary: { groupBy: jest.Mock };
    student: { findMany: jest.Mock; findFirst: jest.Mock };
    tenantSetting: { findFirst: jest.Mock };
    attendanceRecord: { findMany: jest.Mock };
    parent: { findFirst: jest.Mock };
    studentParent: { findUnique: jest.Mock };
  };
  let mockDailySummary: { findForStudent: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      attendanceSession: { findMany: jest.fn() },
      dailyAttendanceSummary: { groupBy: jest.fn() },
      student: { findMany: jest.fn(), findFirst: jest.fn() },
      tenantSetting: { findFirst: jest.fn() },
      attendanceRecord: { findMany: jest.fn() },
      parent: { findFirst: jest.fn() },
      studentParent: { findUnique: jest.fn() },
    };

    mockDailySummary = { findForStudent: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceReportingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DailySummaryService, useValue: mockDailySummary },
      ],
    }).compile();

    service = module.get<AttendanceReportingService>(AttendanceReportingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getExceptions Tests ───────────────────────────────────────────────────

  describe('getExceptions', () => {
    it('should return empty results when no pending sessions or excessive absences', async () => {
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);
      mockPrisma.student.findMany.mockResolvedValue([]);

      const result = await service.getExceptions(TENANT_ID, {});

      expect(result.pending_sessions).toEqual([]);
      expect(result.excessive_absences).toEqual([]);
    });

    it('should return pending sessions with class and staff details', async () => {
      const pendingSessions = [
        {
          id: SESSION_ID,
          session_date: new Date('2026-03-10'),
          class_id: CLASS_ID,
          status: 'open',
          class_entity: {
            id: CLASS_ID,
            name: 'Class A',
            class_staff: [
              {
                staff_profile: {
                  id: 'staff-1',
                  user: { first_name: 'John', last_name: 'Doe' },
                },
              },
            ],
          },
        },
      ];

      mockPrisma.attendanceSession.findMany.mockResolvedValue(pendingSessions);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);
      mockPrisma.student.findMany.mockResolvedValue([]);

      const result = await service.getExceptions(TENANT_ID, {});

      expect(result.pending_sessions).toHaveLength(1);
      expect(result.pending_sessions[0].id).toBe(SESSION_ID);
      expect(result.pending_sessions[0].class_entity.name).toBe('Class A');
      expect(result.pending_sessions[0].class_entity.class_staff).toHaveLength(1);
    });

    it('should filter pending sessions by specific date', async () => {
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);
      mockPrisma.student.findMany.mockResolvedValue([]);

      await service.getExceptions(TENANT_ID, { date: '2026-03-10' });

      expect(mockPrisma.attendanceSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            session_date: new Date('2026-03-10'),
            status: 'open',
          }),
        }),
      );
    });

    it('should filter pending sessions by date range', async () => {
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);
      mockPrisma.student.findMany.mockResolvedValue([]);

      await service.getExceptions(TENANT_ID, { start_date: '2026-03-01', end_date: '2026-03-31' });

      expect(mockPrisma.attendanceSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            session_date: expect.objectContaining({
              gte: new Date('2026-03-01'),
              lte: new Date('2026-03-31'),
            }),
            status: 'open',
          }),
        }),
      );
    });

    it('should filter by start_date only', async () => {
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);
      mockPrisma.student.findMany.mockResolvedValue([]);

      await service.getExceptions(TENANT_ID, { start_date: '2026-03-01' });

      expect(mockPrisma.attendanceSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            session_date: expect.objectContaining({
              gte: new Date('2026-03-01'),
            }),
            status: 'open',
          }),
        }),
      );
    });

    it('should filter by end_date only', async () => {
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);
      mockPrisma.student.findMany.mockResolvedValue([]);

      await service.getExceptions(TENANT_ID, { end_date: '2026-03-31' });

      expect(mockPrisma.attendanceSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            session_date: expect.objectContaining({
              lte: new Date('2026-03-31'),
            }),
            status: 'open',
          }),
        }),
      );
    });

    it('should identify students with excessive absences (>5 in 30 days)', async () => {
      const excessiveAbsences = [
        { student_id: STUDENT_ID, _count: { id: 7 } },
        { student_id: 'student-2', _count: { id: 6 } },
      ];

      const students = [
        { id: STUDENT_ID, first_name: 'Alice', last_name: 'Smith', student_number: 'S001' },
        { id: 'student-2', first_name: 'Bob', last_name: 'Jones', student_number: 'S002' },
      ];

      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue(excessiveAbsences);
      mockPrisma.student.findMany.mockResolvedValue(students);

      const result = await service.getExceptions(TENANT_ID, {});

      expect(result.excessive_absences).toHaveLength(2);
      expect(result.excessive_absences[0].student.id).toBe(STUDENT_ID);
      expect(result.excessive_absences[0].absent_days).toBe(7);
      expect(result.excessive_absences[0].period_days).toBe(30);
    });

    it('should handle students not found for excessive absences', async () => {
      const excessiveAbsences = [{ student_id: 'deleted-student', _count: { id: 8 } }];

      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue(excessiveAbsences);
      mockPrisma.student.findMany.mockResolvedValue([]);

      const result = await service.getExceptions(TENANT_ID, {});

      expect(result.excessive_absences).toHaveLength(1);
      expect(result.excessive_absences[0].student).toEqual({ id: 'deleted-student' });
    });

    it('should query excessive absences with correct Tusla-like threshold', async () => {
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);
      mockPrisma.student.findMany.mockResolvedValue([]);

      await service.getExceptions(TENANT_ID, {});

      expect(mockPrisma.dailyAttendanceSummary.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['student_id'],
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            summary_date: expect.objectContaining({ gte: expect.any(Date) }),
            derived_status: { in: ['absent', 'partially_absent'] },
          }),
          _count: { id: true },
          having: { id: { _count: { gt: 5 } } },
        }),
      );
    });

    it('should handle empty excessive absences gracefully', async () => {
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);

      const result = await service.getExceptions(TENANT_ID, {});

      expect(result.excessive_absences).toEqual([]);
      expect(mockPrisma.student.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── getStudentAttendance Tests ───────────────────────────────────────────

  describe('getStudentAttendance', () => {
    it('should throw NotFoundException when student does not exist', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(null);

      await expect(service.getStudentAttendance(TENANT_ID, STUDENT_ID, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return student with empty records when no attendance data', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

      const result = await service.getStudentAttendance(TENANT_ID, STUDENT_ID, {});

      expect(result.student.id).toBe(STUDENT_ID);
      expect(result.data).toEqual([]);
    });

    it('should return formatted attendance records with session details', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });

      const records = [
        {
          id: 'record-1',
          student_id: STUDENT_ID,
          status: 'present',
          reason: null,
          session: {
            id: SESSION_ID,
            session_date: new Date('2026-03-10'),
            class_entity: { id: CLASS_ID, name: 'Class A' },
            schedule: {
              id: 'schedule-1',
              start_time: new Date('2026-03-10T09:00:00Z'),
              end_time: new Date('2026-03-10T10:30:00Z'),
            },
          },
        },
      ];

      mockPrisma.attendanceRecord.findMany.mockResolvedValue(records);

      const result = await service.getStudentAttendance(TENANT_ID, STUDENT_ID, {});

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('present');
      expect(result.data[0].session.class_entity.name).toBe('Class A');
      expect(result.data[0].session.schedule.start_time).toBe('09:00');
      expect(result.data[0].session.schedule.end_time).toBe('10:30');
    });

    it('should handle records without schedule', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });

      const records = [
        {
          id: 'record-1',
          student_id: STUDENT_ID,
          status: 'absent_unexcused',
          reason: 'Sick',
          session: {
            id: SESSION_ID,
            session_date: new Date('2026-03-10'),
            class_entity: { id: CLASS_ID, name: 'Class A' },
            schedule: null,
          },
        },
      ];

      mockPrisma.attendanceRecord.findMany.mockResolvedValue(records);

      const result = await service.getStudentAttendance(TENANT_ID, STUDENT_ID, {});

      expect(result.data[0].session.schedule).toBeNull();
    });

    it('should filter by date range', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

      await service.getStudentAttendance(TENANT_ID, STUDENT_ID, {
        start_date: '2026-03-01',
        end_date: '2026-03-31',
      });

      expect(mockPrisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            session: expect.objectContaining({
              session_date: expect.objectContaining({
                gte: new Date('2026-03-01'),
                lte: new Date('2026-03-31'),
              }),
            }),
          }),
        }),
      );
    });

    it('should order records by session date descending', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

      await service.getStudentAttendance(TENANT_ID, STUDENT_ID, {});

      expect(mockPrisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { session: { session_date: 'desc' } },
        }),
      );
    });

    it('should filter by submitted or locked session status', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

      await service.getStudentAttendance(TENANT_ID, STUDENT_ID, {});

      expect(mockPrisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            session: expect.objectContaining({
              status: { in: ['submitted', 'locked'] },
            }),
          }),
        }),
      );
    });

    it('should return multiple records for the same student', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });

      const records = [
        {
          id: 'record-1',
          student_id: STUDENT_ID,
          status: 'present',
          reason: null,
          session: {
            id: 'session-1',
            session_date: new Date('2026-03-10'),
            class_entity: { id: CLASS_ID, name: 'Class A' },
            schedule: null,
          },
        },
        {
          id: 'record-2',
          student_id: STUDENT_ID,
          status: 'late',
          reason: 'Traffic',
          session: {
            id: 'session-2',
            session_date: new Date('2026-03-11'),
            class_entity: { id: CLASS_ID, name: 'Class A' },
            schedule: null,
          },
        },
        {
          id: 'record-3',
          student_id: STUDENT_ID,
          status: 'absent_excused',
          reason: 'Doctor',
          session: {
            id: 'session-3',
            session_date: new Date('2026-03-12'),
            class_entity: { id: CLASS_ID, name: 'Class A' },
            schedule: null,
          },
        },
      ];

      mockPrisma.attendanceRecord.findMany.mockResolvedValue(records);

      const result = await service.getStudentAttendance(TENANT_ID, STUDENT_ID, {});

      expect(result.data).toHaveLength(3);
      expect(result.data[0].status).toBe('present');
      expect(result.data[1].status).toBe('late');
      expect(result.data[2].status).toBe('absent_excused');
    });
  });

  // ─── getParentStudentAttendance Tests ───────────────────────────────────────

  describe('getParentStudentAttendance', () => {
    it('should throw ForbiddenException when attendance is not visible to parents', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: { general: { attendanceVisibleToParents: false } },
      });

      await expect(
        service.getParentStudentAttendance(TENANT_ID, USER_ID, STUDENT_ID, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when parent profile does not exist', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: { general: { attendanceVisibleToParents: true } },
      });
      mockPrisma.parent.findFirst.mockResolvedValue(null);

      await expect(
        service.getParentStudentAttendance(TENANT_ID, USER_ID, STUDENT_ID, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when parent is not linked to student', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: { general: { attendanceVisibleToParents: true } },
      });
      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
      mockPrisma.studentParent.findUnique.mockResolvedValue(null);

      await expect(
        service.getParentStudentAttendance(TENANT_ID, USER_ID, STUDENT_ID, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when student-parent link belongs to different tenant', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: { general: { attendanceVisibleToParents: true } },
      });
      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
      mockPrisma.studentParent.findUnique.mockResolvedValue({
        student_id: STUDENT_ID,
        parent_id: PARENT_ID,
        tenant_id: 'different-tenant-id',
      });

      await expect(
        service.getParentStudentAttendance(TENANT_ID, USER_ID, STUDENT_ID, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return attendance data when parent has valid access', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: { general: { attendanceVisibleToParents: true } },
      });
      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
      mockPrisma.studentParent.findUnique.mockResolvedValue({
        student_id: STUDENT_ID,
        parent_id: PARENT_ID,
        tenant_id: TENANT_ID,
      });

      mockPrisma.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([
        {
          id: 'record-1',
          student_id: STUDENT_ID,
          status: 'present',
          reason: null,
          session: {
            id: SESSION_ID,
            session_date: new Date('2026-03-10'),
            class_entity: { id: CLASS_ID, name: 'Class A' },
            schedule: null,
          },
        },
      ]);

      mockDailySummary.findForStudent.mockResolvedValue({
        data: [
          {
            id: 'summary-1',
            student_id: STUDENT_ID,
            summary_date: new Date('2026-03-10'),
            derived_status: 'present',
          },
        ],
      });

      const result = await service.getParentStudentAttendance(TENANT_ID, USER_ID, STUDENT_ID, {});

      expect(result.summaries).toHaveLength(1);
      expect(result.records).toHaveLength(1);
      expect(result.summaries[0].derived_status).toBe('present');
    });

    it('should default to visible when settings are null', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({ settings: null });
      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
      mockPrisma.studentParent.findUnique.mockResolvedValue({
        student_id: STUDENT_ID,
        parent_id: PARENT_ID,
        tenant_id: TENANT_ID,
      });

      mockPrisma.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
      mockDailySummary.findForStudent.mockResolvedValue({ data: [] });

      const result = await service.getParentStudentAttendance(TENANT_ID, USER_ID, STUDENT_ID, {});

      expect(result).toEqual({ summaries: [], records: [] });
    });

    it('should default to visible when general settings are missing', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({ settings: {} });
      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
      mockPrisma.studentParent.findUnique.mockResolvedValue({
        student_id: STUDENT_ID,
        parent_id: PARENT_ID,
        tenant_id: TENANT_ID,
      });

      mockPrisma.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
      mockDailySummary.findForStudent.mockResolvedValue({ data: [] });

      const result = await service.getParentStudentAttendance(TENANT_ID, USER_ID, STUDENT_ID, {});

      expect(result).toEqual({ summaries: [], records: [] });
    });

    it('should pass date range filters to daily summary service', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: { general: { attendanceVisibleToParents: true } },
      });
      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });
      mockPrisma.studentParent.findUnique.mockResolvedValue({
        student_id: STUDENT_ID,
        parent_id: PARENT_ID,
        tenant_id: TENANT_ID,
      });

      mockPrisma.student.findFirst.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);
      mockDailySummary.findForStudent.mockResolvedValue({ data: [] });

      await service.getParentStudentAttendance(TENANT_ID, USER_ID, STUDENT_ID, {
        start_date: '2026-03-01',
        end_date: '2026-03-31',
      });

      expect(mockDailySummary.findForStudent).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID, {
        start_date: '2026-03-01',
        end_date: '2026-03-31',
      });
    });
  });
});
