/* eslint-disable import/order -- jest.mock must precede mocked imports */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';
import { AttendanceReadFacade } from '../attendance/attendance-read.facade';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';
const SCHEDULE_ID = 'schedule-uuid-1';
const CLASS_ID = 'class-uuid-1';
const AY_ID = 'ay-uuid-1';
const ROOM_ID = 'room-uuid-1';
const TEACHER_ID = 'teacher-uuid-1';

const mockScheduleRecord = {
  id: SCHEDULE_ID,
  tenant_id: TENANT_ID,
  class_id: CLASS_ID,
  academic_year_id: AY_ID,
  room_id: ROOM_ID,
  teacher_staff_id: TEACHER_ID,
  weekday: 1,
  start_time: new Date('1970-01-01T08:00:00.000Z'),
  end_time: new Date('1970-01-01T09:00:00.000Z'),
  effective_start_date: new Date('2025-09-01'),
  effective_end_date: null,
  source: 'manual',
  is_pinned: false,
  class_entity: { id: CLASS_ID, name: 'Y1A', subject: { id: 's1', name: 'Math' } },
  room: { id: ROOM_ID, name: 'Room 101' },
  teacher: { id: TEACHER_ID, user: { first_name: 'John', last_name: 'Doe' } },
  academic_year: { id: AY_ID, name: '2025-2026' },
};

const mockTx = {
  schedule: {
    create: jest.fn().mockResolvedValue(mockScheduleRecord),
    update: jest.fn().mockResolvedValue(mockScheduleRecord),
    delete: jest.fn().mockResolvedValue(undefined),
    findMany: jest.fn().mockResolvedValue([mockScheduleRecord]),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

import { ConflictDetectionService } from './conflict-detection.service';
import { SchedulesService } from './schedules.service';

describe('SchedulesService', () => {
  let service: SchedulesService;
  let mockPrisma: {
    class: { findFirst: jest.Mock };
    room: { findFirst: jest.Mock };
    staffProfile: { findFirst: jest.Mock };
    schedule: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    attendanceSession: { count: jest.Mock };
  };
  let mockConflictDetection: { detectConflicts: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      class: { findFirst: jest.fn() },
      room: { findFirst: jest.fn() },
      staffProfile: { findFirst: jest.fn() },
      schedule: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      attendanceSession: { count: jest.fn() },
    };

    mockConflictDetection = {
      detectConflicts: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: RoomsReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
      findActiveRooms: jest.fn().mockResolvedValue([]),
      findActiveRoomBasics: jest.fn().mockResolvedValue([]),
      countActiveRooms: jest.fn().mockResolvedValue(0),
      findAllClosures: jest.fn().mockResolvedValue([]),
      findClosuresPaginated: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findClosureById: jest.fn().mockResolvedValue(null),
    } },
        { provide: ClassesReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      findEnrolledStudentIds: jest.fn().mockResolvedValue([]),
      countEnrolledStudents: jest.fn().mockResolvedValue(0),
      findOtherClassEnrolmentsForStudents: jest.fn().mockResolvedValue([]),
      findByAcademicYear: jest.fn().mockResolvedValue([]),
      findByYearGroup: jest.fn().mockResolvedValue([]),
      findIdsByAcademicYear: jest.fn().mockResolvedValue([]),
      countByAcademicYear: jest.fn().mockResolvedValue(0),
      findClassesWithoutTeachers: jest.fn().mockResolvedValue([]),
      findClassIdsForStudent: jest.fn().mockResolvedValue([]),
      findEnrolmentPairsForAcademicYear: jest.fn().mockResolvedValue([]),
    } },
        { provide: StaffProfileReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      findByIds: jest.fn().mockResolvedValue([]),
      findByUserId: jest.fn().mockResolvedValue(null),
      findActiveStaff: jest.fn().mockResolvedValue([]),
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      resolveProfileId: jest.fn().mockResolvedValue('staff-1'),
    } },
        { provide: AttendanceReadFacade, useValue: {
      countSessions: jest.fn().mockResolvedValue(0),
    } },
        SchedulesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConflictDetectionService, useValue: mockConflictDetection },
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    const createDto = {
      class_id: CLASS_ID,
      room_id: ROOM_ID,
      teacher_staff_id: TEACHER_ID,
      weekday: 1,
      start_time: '08:00',
      end_time: '09:00',
      effective_start_date: '2025-09-01',
    };

    it('should create a schedule when no conflicts', async () => {
      mockPrisma.class.findFirst.mockResolvedValue({
        id: CLASS_ID,
        academic_year_id: AY_ID,
      });
      mockPrisma.room.findFirst.mockResolvedValue({ id: ROOM_ID });
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: TEACHER_ID });
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });

      const result = await service.create(
        TENANT_ID,
        USER_ID,
        createDto,
        [],
      );

      expect(result.schedule).toBeDefined();
      expect(result.conflicts).toEqual([]);
    });

    it('should throw NotFoundException when class does not exist', async () => {
      mockPrisma.class.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, createDto, []),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when room does not exist', async () => {
      mockPrisma.class.findFirst.mockResolvedValue({
        id: CLASS_ID,
        academic_year_id: AY_ID,
      });
      mockPrisma.room.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, createDto, []),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when teacher does not exist', async () => {
      mockPrisma.class.findFirst.mockResolvedValue({
        id: CLASS_ID,
        academic_year_id: AY_ID,
      });
      mockPrisma.room.findFirst.mockResolvedValue({ id: ROOM_ID });
      mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, createDto, []),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when hard conflicts and no override', async () => {
      mockPrisma.class.findFirst.mockResolvedValue({
        id: CLASS_ID,
        academic_year_id: AY_ID,
      });
      mockPrisma.room.findFirst.mockResolvedValue({ id: ROOM_ID });
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: TEACHER_ID });
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [{ type: 'room_double_book', severity: 'hard', message: 'Room conflict' }],
        soft: [],
      });

      await expect(
        service.create(TENANT_ID, USER_ID, createDto, []),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ForbiddenException when override requested but no permission', async () => {
      mockPrisma.class.findFirst.mockResolvedValue({
        id: CLASS_ID,
        academic_year_id: AY_ID,
      });
      mockPrisma.room.findFirst.mockResolvedValue({ id: ROOM_ID });
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: TEACHER_ID });
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [{ type: 'room_double_book', severity: 'hard', message: 'Room conflict' }],
        soft: [],
      });

      await expect(
        service.create(
          TENANT_ID,
          USER_ID,
          { ...createDto, override_conflicts: true },
          [],
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('should return paginated schedules', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([mockScheduleRecord]);
      mockPrisma.schedule.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      // Verify times are formatted as HH:mm strings
      expect(result.data[0]?.['start_time']).toBe('08:00');
      expect(result.data[0]?.['end_time']).toBe('09:00');
    });
  });

  describe('findOne', () => {
    it('should return a single schedule', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(mockScheduleRecord);

      const result = await service.findOne(TENANT_ID, SCHEDULE_ID);

      expect(result['start_time']).toBe('08:00');
    });

    it('should throw NotFoundException when schedule does not exist', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(TENANT_ID, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should hard delete when no attendance sessions reference the schedule', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue({ id: SCHEDULE_ID });
      mockPrisma.attendanceSession.count.mockResolvedValue(0);

      const result = await service.remove(TENANT_ID, SCHEDULE_ID);

      expect(result.action).toBe('deleted');
    });

    it('should end-date when attendance sessions reference the schedule', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue({ id: SCHEDULE_ID });
      mockPrisma.attendanceSession.count.mockResolvedValue(5);
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      const result = await service.remove(TENANT_ID, SCHEDULE_ID);

      expect(result.action).toBe('end_dated');
    });

    it('should throw NotFoundException when schedule does not exist', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      await expect(
        service.remove(TENANT_ID, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('pin', () => {
    it('should pin a schedule', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(mockScheduleRecord);
      mockTx.schedule.update.mockResolvedValue({
        ...mockScheduleRecord,
        is_pinned: true,
        source: 'pinned',
      });

      const result = await service.pin(TENANT_ID, SCHEDULE_ID, {
        pin_reason: 'Teacher request',
      });

      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when schedule does not exist for pin', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      await expect(
        service.pin(TENANT_ID, 'non-existent', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('unpin', () => {
    it('should unpin a schedule', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(mockScheduleRecord);
      mockTx.schedule.update.mockResolvedValue({
        ...mockScheduleRecord,
        is_pinned: false,
        source: 'manual',
        pin_reason: null,
      });

      const result = await service.unpin(TENANT_ID, SCHEDULE_ID);

      expect(result).toBeDefined();
    });
  });

  describe('bulkPin', () => {
    it('should throw NotFoundException when some schedules are missing', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([{ id: SCHEDULE_ID }]);

      await expect(
        service.bulkPin(TENANT_ID, {
          schedule_ids: [SCHEDULE_ID, 'missing-id'],
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
