import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  ConfigurationReadFacade,
  ParentReadFacade,
  StudentReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { AttendanceReportingService } from './attendance-reporting.service';
import { DailySummaryService } from './daily-summary.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = 'uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu';
const PARENT_ID = 'pppppppp-pppp-pppp-pppp-pppppppppppp';
const SESSION_ID = 'ssssssss-ssss-ssss-ssss-ssssssssssss';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AttendanceReportingService', () => {
  let service: AttendanceReportingService;
  let mockPrisma: {
    attendanceSession: { findMany: jest.Mock };
    dailyAttendanceSummary: { groupBy: jest.Mock };
    student: { findMany: jest.Mock; findFirst: jest.Mock };
    attendanceRecord: { findMany: jest.Mock };
    tenantSetting: { findFirst: jest.Mock };
    parent: { findFirst: jest.Mock };
    studentParent: { findUnique: jest.Mock };
  };
  let mockDailySummary: { findForStudent: jest.Mock };
  let mockStudentFacade: { findByIds: jest.Mock; findById: jest.Mock; isParentLinked: jest.Mock };
  let mockConfigFacade: { findSettingsJson: jest.Mock };
  let mockParentFacade: { resolveIdByUserId: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      attendanceSession: { findMany: jest.fn() },
      dailyAttendanceSummary: { groupBy: jest.fn() },
      student: { findMany: jest.fn(), findFirst: jest.fn() },
      attendanceRecord: { findMany: jest.fn() },
      tenantSetting: { findFirst: jest.fn() },
      parent: { findFirst: jest.fn() },
      studentParent: { findUnique: jest.fn() },
    };

    mockDailySummary = {
      findForStudent: jest.fn().mockResolvedValue({ data: [] }),
    };

    mockStudentFacade = {
      findByIds: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      isParentLinked: jest.fn().mockResolvedValue(false),
    };
    mockConfigFacade = { findSettingsJson: jest.fn().mockResolvedValue(null) };
    mockParentFacade = { resolveIdByUserId: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceReportingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DailySummaryService, useValue: mockDailySummary },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
        { provide: ParentReadFacade, useValue: mockParentFacade },
      ],
    }).compile();

    service = module.get<AttendanceReportingService>(AttendanceReportingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getExceptions ────────────────────────────────────────────────────────

  describe('AttendanceReportingService — getExceptions', () => {
    it('should return pending sessions and excessive absences', async () => {
      const pendingSessions = [
        {
          id: SESSION_ID,
          status: 'open',
          session_date: new Date('2026-03-15'),
          class_entity: {
            id: 'class-1',
            name: 'Class 8A',
            class_staff: [],
          },
        },
      ];
      mockPrisma.attendanceSession.findMany.mockResolvedValue(pendingSessions);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);
      mockStudentFacade.findByIds.mockResolvedValue([]);

      const result = await service.getExceptions(TENANT_ID, {});

      expect(result.pending_sessions).toEqual(pendingSessions);
      expect(result.excessive_absences).toEqual([]);
    });

    it('should enrich excessive absences with student details', async () => {
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([
        { student_id: STUDENT_ID, _count: { id: 8 } },
      ]);
      mockStudentFacade.findByIds.mockResolvedValue([
        {
          id: STUDENT_ID,
          first_name: 'Aisha',
          last_name: 'Al-Mansour',
          student_number: 'STU-001',
        },
      ]);

      const result = await service.getExceptions(TENANT_ID, {});

      expect(result.excessive_absences).toHaveLength(1);
      expect(result.excessive_absences[0]).toEqual({
        student: {
          id: STUDENT_ID,
          first_name: 'Aisha',
          last_name: 'Al-Mansour',
          student_number: 'STU-001',
        },
        absent_days: 8,
        period_days: 30,
      });
    });

    it('should apply date filter when a single date is provided', async () => {
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);
      mockStudentFacade.findByIds.mockResolvedValue([]);

      await service.getExceptions(TENANT_ID, { date: '2026-03-15' });

      expect(mockPrisma.attendanceSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            session_date: new Date('2026-03-15'),
          }),
        }),
      );
    });

    it('should apply date range filter when start_date and end_date are provided', async () => {
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([]);
      mockStudentFacade.findByIds.mockResolvedValue([]);

      await service.getExceptions(TENANT_ID, {
        start_date: '2026-03-01',
        end_date: '2026-03-31',
      });

      expect(mockPrisma.attendanceSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            session_date: {
              gte: new Date('2026-03-01'),
              lte: new Date('2026-03-31'),
            },
          }),
        }),
      );
    });

    it('should use a fallback student object when student details are missing', async () => {
      mockPrisma.attendanceSession.findMany.mockResolvedValue([]);
      mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([
        { student_id: 'unknown-student', _count: { id: 6 } },
      ]);
      mockStudentFacade.findByIds.mockResolvedValue([]);

      const result = await service.getExceptions(TENANT_ID, {});

      expect(result.excessive_absences[0]?.student).toEqual({ id: 'unknown-student' });
    });
  });

  // ─── getStudentAttendance ─────────────────────────────────────────────────

  describe('AttendanceReportingService — getStudentAttendance', () => {
    it('should throw NotFoundException when student does not exist', async () => {
      mockStudentFacade.findById.mockResolvedValue(null);

      await expect(service.getStudentAttendance(TENANT_ID, STUDENT_ID, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return student and formatted attendance records', async () => {
      const student = { id: STUDENT_ID, first_name: 'Aisha', last_name: 'Al-Mansour' };
      mockStudentFacade.findById.mockResolvedValue(student);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          status: 'present',
          session: {
            id: SESSION_ID,
            session_date: new Date('2026-03-15'),
            class_entity: { id: 'class-1', name: 'Class 8A' },
            schedule: {
              id: 'sched-1',
              start_time: new Date('2026-03-15T08:00:00.000Z'),
              end_time: new Date('2026-03-15T08:45:00.000Z'),
            },
          },
        },
      ]);

      const result = await service.getStudentAttendance(TENANT_ID, STUDENT_ID, {});

      expect(result.student).toEqual(student);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.session.schedule).toEqual({
        id: 'sched-1',
        start_time: '08:00',
        end_time: '08:45',
      });
    });

    it('should handle records with null schedule', async () => {
      const student = { id: STUDENT_ID, first_name: 'Aisha', last_name: 'Al-Mansour' };
      mockStudentFacade.findById.mockResolvedValue(student);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          status: 'absent',
          session: {
            id: SESSION_ID,
            session_date: new Date('2026-03-15'),
            class_entity: { id: 'class-1', name: 'Class 8A' },
            schedule: null,
          },
        },
      ]);

      const result = await service.getStudentAttendance(TENANT_ID, STUDENT_ID, {});

      expect(result.data[0]?.session.schedule).toBeNull();
    });

    it('should apply date range filter on session query', async () => {
      const student = { id: STUDENT_ID, first_name: 'Aisha', last_name: 'Al-Mansour' };
      mockStudentFacade.findById.mockResolvedValue(student);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

      await service.getStudentAttendance(TENANT_ID, STUDENT_ID, {
        start_date: '2026-03-01',
        end_date: '2026-03-31',
      });

      expect(mockPrisma.attendanceRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
            session: expect.objectContaining({
              session_date: {
                gte: new Date('2026-03-01'),
                lte: new Date('2026-03-31'),
              },
            }),
          }),
        }),
      );
    });
  });

  // ─── getParentStudentAttendance ───────────────────────────────────────────

  describe('AttendanceReportingService — getParentStudentAttendance', () => {
    it('should throw ForbiddenException when attendance is not visible to parents', async () => {
      mockConfigFacade.findSettingsJson.mockResolvedValue({ general: { attendanceVisibleToParents: false } });

      await expect(
        service.getParentStudentAttendance(TENANT_ID, USER_ID, STUDENT_ID, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when parent profile does not exist', async () => {
      mockConfigFacade.findSettingsJson.mockResolvedValue({ general: { attendanceVisibleToParents: true } });
      mockParentFacade.resolveIdByUserId.mockResolvedValue(null);

      await expect(
        service.getParentStudentAttendance(TENANT_ID, USER_ID, STUDENT_ID, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when parent is not linked to the student', async () => {
      mockConfigFacade.findSettingsJson.mockResolvedValue({ general: { attendanceVisibleToParents: true } });
      mockParentFacade.resolveIdByUserId.mockResolvedValue(PARENT_ID);
      mockStudentFacade.isParentLinked.mockResolvedValue(false);

      await expect(
        service.getParentStudentAttendance(TENANT_ID, USER_ID, STUDENT_ID, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException when studentParent link is from a different tenant', async () => {
      mockConfigFacade.findSettingsJson.mockResolvedValue({ general: { attendanceVisibleToParents: true } });
      mockParentFacade.resolveIdByUserId.mockResolvedValue(PARENT_ID);
      // isParentLinked returns false because different tenant
      mockStudentFacade.isParentLinked.mockResolvedValue(false);

      await expect(
        service.getParentStudentAttendance(TENANT_ID, USER_ID, STUDENT_ID, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return summaries and records when all checks pass', async () => {
      mockConfigFacade.findSettingsJson.mockResolvedValue({ general: { attendanceVisibleToParents: true } });
      mockParentFacade.resolveIdByUserId.mockResolvedValue(PARENT_ID);
      mockStudentFacade.isParentLinked.mockResolvedValue(true);
      mockDailySummary.findForStudent.mockResolvedValue({
        data: [{ summary_date: '2026-03-15', derived_status: 'present' }],
      });

      // Mock the student lookup for getStudentAttendance which is called internally
      const student = { id: STUDENT_ID, first_name: 'Aisha', last_name: 'Al-Mansour' };
      mockStudentFacade.findById.mockResolvedValue(student);
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

      const result = await service.getParentStudentAttendance(TENANT_ID, USER_ID, STUDENT_ID, {});

      expect(result.summaries).toHaveLength(1);
      expect(result.records).toEqual([]);
    });

    it('should default attendanceVisibleToParents to true when setting is not configured', async () => {
      mockConfigFacade.findSettingsJson.mockResolvedValue(null);
      mockParentFacade.resolveIdByUserId.mockResolvedValue(PARENT_ID);
      mockStudentFacade.isParentLinked.mockResolvedValue(true);
      mockDailySummary.findForStudent.mockResolvedValue({ data: [] });
      mockStudentFacade.findById.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Aisha',
        last_name: 'Al-Mansour',
      });
      mockPrisma.attendanceRecord.findMany.mockResolvedValue([]);

      // Should NOT throw since default is true
      const result = await service.getParentStudentAttendance(TENANT_ID, USER_ID, STUDENT_ID, {});

      expect(result).toBeDefined();
    });
  });
});
