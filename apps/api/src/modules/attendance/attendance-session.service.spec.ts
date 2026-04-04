/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import {
  MOCK_FACADE_PROVIDERS,
  ClassesReadFacade,
  SchedulesReadFacade,
} from '../../common/tests/mock-facades';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { SchoolClosuresService } from '../school-closures/school-closures.service';

import { AttendanceSessionService } from './attendance-session.service';

jest.mock('../../common/middleware/rls.middleware');

describe('AttendanceSessionService', () => {
  let service: AttendanceSessionService;
  let mockPrisma: any;
  let mockTx: any;
  let mockSettings: any;
  let mockClosures: any;
  let mockClassesFacade: any;
  let mockSchedulesFacade: any;

  const TENANT_ID = 'tenant-1';
  const USER_ID = 'user-1';
  const STAFF_PROFILE_ID = 'staff-1';
  const CLASS_ID = 'class-1';

  beforeEach(async () => {
    mockTx = {
      attendanceSession: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      attendanceRecord: {
        createMany: jest.fn(),
      },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (cb) => {
        return cb(mockTx);
      }),
      class: { findFirst: jest.fn() },
      classStaff: { findFirst: jest.fn(), findMany: jest.fn() },
      attendanceSession: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      classEnrolment: { findMany: jest.fn() },
      schedule: { findMany: jest.fn() },
      staffProfile: { findFirst: jest.fn() },
    };

    (createRlsClient as jest.Mock).mockReturnValue(mockPrisma);

    mockSettings = {
      getSettings: jest.fn().mockResolvedValue({
        attendance: {
          workDays: [1, 2, 3, 4, 5], // Mon-Fri
          defaultPresentEnabled: false,
        },
      }),
    };

    mockClosures = {
      isClosureDate: jest.fn().mockResolvedValue(false),
    };

    mockClassesFacade = {
      findByIdWithAcademicYear: jest.fn().mockResolvedValue(null),
      isStaffAssignedToClass: jest.fn().mockResolvedValue(false),
      findEnrolledStudentIds: jest.fn().mockResolvedValue([]),
      findEnrolledStudentsWithNumber: jest.fn().mockResolvedValue([]),
      findClassIdsByStaff: jest.fn().mockResolvedValue(null),
    };

    mockSchedulesFacade = {
      findByWeekdayWithClassYearGroup: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AttendanceSessionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettings },
        { provide: SchoolClosuresService, useValue: mockClosures },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: SchedulesReadFacade, useValue: mockSchedulesFacade },
      ],
    }).compile();

    service = module.get<AttendanceSessionService>(AttendanceSessionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSession', () => {
    const defaultDto = {
      class_id: CLASS_ID,
      session_date: '2025-05-14T00:00:00.000Z', // Wednesday
    };

    beforeEach(() => {
      mockClassesFacade.findByIdWithAcademicYear.mockResolvedValue({
        id: CLASS_ID,
        academic_year: {
          start_date: new Date('2024-09-01'),
          end_date: new Date('2025-06-30'),
        },
      });
      mockClassesFacade.isStaffAssignedToClass.mockResolvedValue(true);
    });

    it('should throw NotFoundException if class does not exist', async () => {
      mockClassesFacade.findByIdWithAcademicYear.mockResolvedValue(null);
      await expect(
        service.createSession(TENANT_ID, USER_ID, defaultDto, ['attendance.take']),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user lacks manage perm and is not assigned', async () => {
      mockClassesFacade.isStaffAssignedToClass.mockResolvedValue(false);
      await expect(
        service.createSession(
          TENANT_ID,
          USER_ID,
          defaultDto,
          ['attendance.take'],
          STAFF_PROFILE_ID,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if date is not a work day', async () => {
      // 2025-05-18 is Sunday (0)
      const dto = { ...defaultDto, session_date: '2025-05-18T00:00:00.000Z' };
      await expect(
        service.createSession(TENANT_ID, USER_ID, dto, ['attendance.manage']),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if date is outside academic year bounds', async () => {
      const dto = { ...defaultDto, session_date: '2025-08-14T00:00:00.000Z' }; // After end_date
      await expect(
        service.createSession(TENANT_ID, USER_ID, dto, ['attendance.manage']),
      ).rejects.toThrow(/outside the academic year date range/);
    });

    it('should handle school closures context properly', async () => {
      mockClosures.isClosureDate.mockResolvedValue(true);

      // Should fail without override flag
      await expect(
        service.createSession(TENANT_ID, USER_ID, defaultDto, ['attendance.manage']),
      ).rejects.toThrow(ConflictException);

      const overrideDto = { ...defaultDto, override_closure: true };

      // Should fail if lacks override permission
      await expect(
        service.createSession(TENANT_ID, USER_ID, overrideDto, ['attendance.manage']),
      ).rejects.toThrow(ForbiddenException);

      // Should fail if missing reason
      await expect(
        service.createSession(TENANT_ID, USER_ID, overrideDto, [
          'attendance.manage',
          'attendance.override_closure',
        ]),
      ).rejects.toThrow(BadRequestException);

      const validOverrideDto = { ...overrideDto, override_reason: 'Emergency session' };
      mockTx.attendanceSession.create.mockResolvedValue({ id: 'sess-1' });

      const result = await service.createSession(TENANT_ID, USER_ID, validOverrideDto, [
        'attendance.manage',
        'attendance.override_closure',
      ]);
      expect(result.id).toBe('sess-1');
      expect(mockTx.attendanceSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ override_reason: 'Emergency session' }),
        }),
      );
    });

    it('should create default present records (bulk mark) if enabled', async () => {
      mockSettings.getSettings.mockResolvedValue({
        attendance: { workDays: [1, 2, 3, 4, 5], defaultPresentEnabled: true },
      });
      mockTx.attendanceSession.findFirst.mockResolvedValue(null);
      mockTx.attendanceSession.create.mockResolvedValue({ id: 'sess-bulk' });
      mockClassesFacade.findEnrolledStudentIds.mockResolvedValue(['stu-1', 'stu-2']);
      mockTx.attendanceRecord.createMany.mockResolvedValue({ count: 2 });

      const result = await service.createSession(TENANT_ID, USER_ID, defaultDto, [
        'attendance.manage',
      ]);

      expect(result.id).toBe('sess-bulk');
      expect(mockTx.attendanceRecord.createMany).toHaveBeenCalledTimes(1);
      expect(mockTx.attendanceRecord.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({ student_id: 'stu-1', status: 'present' }),
            expect.objectContaining({ student_id: 'stu-2', status: 'present' }),
          ],
        }),
      );
    });

    it('should ignore conflict and retry properly when Prisma P2002 error is thrown', async () => {
      mockTx.attendanceSession.findFirst.mockResolvedValue(null);

      // First try to create throws P2002
      mockTx.attendanceSession.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Race condition', {
          code: 'P2002',
          clientVersion: '5',
        }),
      );

      // Catch mechanism checks for existing
      mockPrisma.attendanceSession.findFirst.mockResolvedValue({ id: 'sess-existing' });

      const result = await service.createSession(TENANT_ID, USER_ID, defaultDto, [
        'attendance.manage',
      ]);
      expect(result.id).toBe('sess-existing');
    });
  });

  describe('cancelSession', () => {
    it('should throw NotFoundException if session does not exist', async () => {
      mockPrisma.attendanceSession.findFirst.mockResolvedValue(null);
      await expect(service.cancelSession(TENANT_ID, 'sess-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if session is not open', async () => {
      mockPrisma.attendanceSession.findFirst.mockResolvedValue({ id: 'sess-1', status: 'closed' });
      await expect(service.cancelSession(TENANT_ID, 'sess-1')).rejects.toThrow(ConflictException);
    });

    it('should cancel the session successfully', async () => {
      mockPrisma.attendanceSession.findFirst.mockResolvedValue({ id: 'sess-1', status: 'open' });
      mockTx.attendanceSession.update.mockResolvedValue({ id: 'sess-1', status: 'cancelled' });

      await service.cancelSession(TENANT_ID, 'sess-1');
      expect(mockTx.attendanceSession.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'cancelled' } }),
      );
    });
  });

  describe('Queries', () => {
    it('findAllSessions should filter by teacher assignment', async () => {
      mockClassesFacade.findClassIdsByStaff.mockResolvedValue(['class-1']);
      mockPrisma.attendanceSession.findMany.mockResolvedValue([{ id: 'sess-1' }]);
      mockPrisma.attendanceSession.count.mockResolvedValue(1);

      const result = await service.findAllSessions(
        TENANT_ID,
        { page: 1, pageSize: 10 },
        STAFF_PROFILE_ID,
      );
      expect(result.data).toHaveLength(1);
      expect(mockPrisma.attendanceSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ class_id: { in: ['class-1'] } }),
        }),
      );
    });

    it('findOneSession should return session with joined enrolled students', async () => {
      mockPrisma.attendanceSession.findFirst.mockResolvedValue({
        class_id: 'class-1',
        schedule: null,
      });
      mockClassesFacade.findEnrolledStudentsWithNumber.mockResolvedValue([
        { student: { id: 'stu-1' } },
      ]);

      const result = await service.findOneSession(TENANT_ID, 'sess-1');
      expect(result.enrolled_students).toEqual([{ id: 'stu-1' }]);
    });
  });

  describe('batchGenerateSessions', () => {
    it('should create sessions for active schedules that are not closures', async () => {
      mockSchedulesFacade.findByWeekdayWithClassYearGroup.mockResolvedValue([
        { id: 'sched-1', class_id: 'class-1', class_entity: { year_group_id: 'yg-1' } },
      ]);
      mockClosures.isClosureDate.mockResolvedValue(false);
      mockPrisma.attendanceSession.findFirst.mockResolvedValue(null);
      mockTx.attendanceSession.create.mockResolvedValue({ id: 'sess-new' });

      const res = await service.batchGenerateSessions(TENANT_ID, new Date('2025-05-14T10:00:00Z'));
      expect(res.created).toBe(1);
      expect(res.skipped).toBe(0);
      expect(mockTx.attendanceSession.create).toHaveBeenCalled();
    });
  });
});
