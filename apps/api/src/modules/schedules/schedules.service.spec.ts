/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  AttendanceReadFacade,
  ClassesReadFacade,
  MOCK_FACADE_PROVIDERS,
  RoomsReadFacade,
  StaffProfileReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

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
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

import { ConflictDetectionService } from './conflict-detection.service';
import { SchedulesService } from './schedules.service';

describe('SchedulesService', () => {
  let service: SchedulesService;
  let mockPrisma: {
    schedule: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let mockConflictDetection: { detectConflicts: jest.Mock };

  const mockClassesReadFacade = {
    findById: jest.fn().mockResolvedValue(null),
    existsOrThrow: jest.fn().mockResolvedValue(undefined),
  };

  const mockRoomsReadFacade = {
    existsOrThrow: jest.fn().mockResolvedValue(undefined),
  };

  const mockStaffProfileReadFacade = {
    existsOrThrow: jest.fn().mockResolvedValue(undefined),
  };

  const mockAttendanceReadFacade = {
    countSessions: jest.fn().mockResolvedValue(0),
  };

  beforeEach(async () => {
    mockPrisma = {
      schedule: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    mockConflictDetection = {
      detectConflicts: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesReadFacade },
        { provide: RoomsReadFacade, useValue: mockRoomsReadFacade },
        { provide: StaffProfileReadFacade, useValue: mockStaffProfileReadFacade },
        { provide: AttendanceReadFacade, useValue: mockAttendanceReadFacade },
        SchedulesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConflictDetectionService, useValue: mockConflictDetection },
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);

    jest.clearAllMocks();
    // Re-set defaults after clearAllMocks
    mockClassesReadFacade.findById.mockResolvedValue(null);
    mockClassesReadFacade.existsOrThrow.mockResolvedValue(undefined);
    mockRoomsReadFacade.existsOrThrow.mockResolvedValue(undefined);
    mockStaffProfileReadFacade.existsOrThrow.mockResolvedValue(undefined);
    mockAttendanceReadFacade.countSessions.mockResolvedValue(0);
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
      mockClassesReadFacade.findById.mockResolvedValue({
        id: CLASS_ID,
        academic_year_id: AY_ID,
      });
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });

      const result = await service.create(TENANT_ID, USER_ID, createDto, []);

      expect(result.schedule).toBeDefined();
      expect(result.conflicts).toEqual([]);
    });

    it('should throw NotFoundException when class does not exist', async () => {
      mockClassesReadFacade.findById.mockResolvedValue(null);

      await expect(service.create(TENANT_ID, USER_ID, createDto, [])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when room does not exist', async () => {
      mockClassesReadFacade.findById.mockResolvedValue({
        id: CLASS_ID,
        academic_year_id: AY_ID,
      });
      mockRoomsReadFacade.existsOrThrow.mockRejectedValue(
        new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'Room not found' }),
      );

      await expect(service.create(TENANT_ID, USER_ID, createDto, [])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when teacher does not exist', async () => {
      mockClassesReadFacade.findById.mockResolvedValue({
        id: CLASS_ID,
        academic_year_id: AY_ID,
      });
      mockStaffProfileReadFacade.existsOrThrow.mockRejectedValue(
        new NotFoundException({ code: 'STAFF_PROFILE_NOT_FOUND', message: 'Staff not found' }),
      );

      await expect(service.create(TENANT_ID, USER_ID, createDto, [])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException when hard conflicts and no override', async () => {
      mockClassesReadFacade.findById.mockResolvedValue({
        id: CLASS_ID,
        academic_year_id: AY_ID,
      });
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [{ type: 'room_double_book', severity: 'hard', message: 'Room conflict' }],
        soft: [],
      });

      await expect(service.create(TENANT_ID, USER_ID, createDto, [])).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ForbiddenException when override requested but no permission', async () => {
      mockClassesReadFacade.findById.mockResolvedValue({
        id: CLASS_ID,
        academic_year_id: AY_ID,
      });
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [{ type: 'room_double_book', severity: 'hard', message: 'Room conflict' }],
        soft: [],
      });

      await expect(
        service.create(TENANT_ID, USER_ID, { ...createDto, override_conflicts: true }, []),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should create schedule when override requested and user has permission', async () => {
      mockClassesReadFacade.findById.mockResolvedValue({
        id: CLASS_ID,
        academic_year_id: AY_ID,
      });
      const hardConflict = {
        type: 'hard',
        category: 'room_double_booking',
        message: 'Room conflict',
      };
      const softConflict = {
        type: 'soft',
        category: 'room_shared_warning',
        message: 'Shared room',
      };
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [hardConflict],
        soft: [softConflict],
      });

      const result = await service.create(
        TENANT_ID,
        USER_ID,
        { ...createDto, override_conflicts: true },
        ['schedule.override_conflict'],
      );

      expect(result.schedule).toBeDefined();
      expect(result.conflicts).toEqual([hardConflict, softConflict]);
    });

    it('should create schedule without room_id and teacher_staff_id', async () => {
      mockClassesReadFacade.findById.mockResolvedValue({
        id: CLASS_ID,
        academic_year_id: AY_ID,
      });
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });

      const dtoNoOptional = {
        class_id: CLASS_ID,
        weekday: 1,
        start_time: '08:00',
        end_time: '09:00',
        effective_start_date: '2025-09-01',
      };

      const result = await service.create(TENANT_ID, USER_ID, dtoNoOptional, []);

      expect(result.schedule).toBeDefined();
      expect(mockRoomsReadFacade.existsOrThrow).not.toHaveBeenCalled();
      expect(mockStaffProfileReadFacade.existsOrThrow).not.toHaveBeenCalled();
    });

    it('should create schedule with effective_end_date', async () => {
      mockClassesReadFacade.findById.mockResolvedValue({
        id: CLASS_ID,
        academic_year_id: AY_ID,
      });
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });

      const dtoWithEnd = {
        ...createDto,
        effective_end_date: '2025-12-31',
      };

      const result = await service.create(TENANT_ID, USER_ID, dtoWithEnd, []);

      expect(result.schedule).toBeDefined();
    });

    it('should return combined hard and soft conflicts', async () => {
      mockClassesReadFacade.findById.mockResolvedValue({
        id: CLASS_ID,
        academic_year_id: AY_ID,
      });
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [{ type: 'soft', category: 'room_over_capacity', message: 'Over capacity' }],
      });

      const result = await service.create(TENANT_ID, USER_ID, createDto, []);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]?.category).toBe('room_over_capacity');
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

    it('should apply all optional filters', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      mockPrisma.schedule.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        academic_year_id: AY_ID,
        class_id: CLASS_ID,
        teacher_staff_id: TEACHER_ID,
        room_id: ROOM_ID,
        weekday: 3,
      });

      const findManyCall = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(findManyCall.where.academic_year_id).toBe(AY_ID);
      expect(findManyCall.where.class_id).toBe(CLASS_ID);
      expect(findManyCall.where.teacher_staff_id).toBe(TEACHER_ID);
      expect(findManyCall.where.room_id).toBe(ROOM_ID);
      expect(findManyCall.where.weekday).toBe(3);
    });

    it('should override teacher_staff_id filter when userStaffProfileId is provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      mockPrisma.schedule.count.mockResolvedValue(0);

      await service.findAll(
        TENANT_ID,
        {
          page: 1,
          pageSize: 20,
          teacher_staff_id: TEACHER_ID,
        },
        'own-staff-id',
      );

      const findManyCall = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(findManyCall.where.teacher_staff_id).toBe('own-staff-id');
    });

    it('should use teacher_staff_id from params when no userStaffProfileId', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      mockPrisma.schedule.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        teacher_staff_id: TEACHER_ID,
      });

      const findManyCall = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(findManyCall.where.teacher_staff_id).toBe(TEACHER_ID);
    });

    it('should calculate skip correctly for pagination', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      mockPrisma.schedule.count.mockResolvedValue(50);

      await service.findAll(TENANT_ID, {
        page: 3,
        pageSize: 10,
      });

      const findManyCall = mockPrisma.schedule.findMany.mock.calls[0][0];
      expect(findManyCall.skip).toBe(20); // (3 - 1) * 10
    });

    it('should format schedule dates in response', async () => {
      const recordWithDates = {
        ...mockScheduleRecord,
        effective_start_date: new Date('2025-09-01'),
        effective_end_date: new Date('2025-12-31'),
      };
      mockPrisma.schedule.findMany.mockResolvedValue([recordWithDates]);
      mockPrisma.schedule.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data[0]?.['effective_start_date']).toBe('2025-09-01');
      expect(result.data[0]?.['effective_end_date']).toBe('2025-12-31');
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

      await expect(service.findOne(TENANT_ID, 'non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should hard delete when no attendance sessions reference the schedule', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue({ id: SCHEDULE_ID });
      mockAttendanceReadFacade.countSessions.mockResolvedValue(0);

      const result = await service.remove(TENANT_ID, SCHEDULE_ID);

      expect(result.action).toBe('deleted');
    });

    it('should end-date when attendance sessions reference the schedule', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue({ id: SCHEDULE_ID });
      mockAttendanceReadFacade.countSessions.mockResolvedValue(5);
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      const result = await service.remove(TENANT_ID, SCHEDULE_ID);

      expect(result.action).toBe('end_dated');
    });

    it('should throw NotFoundException when schedule does not exist', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      await expect(service.remove(TENANT_ID, 'non-existent')).rejects.toThrow(NotFoundException);
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

      await expect(service.pin(TENANT_ID, 'non-existent', {})).rejects.toThrow(NotFoundException);
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

    it('should successfully bulk pin all schedules when they exist', async () => {
      const ids = ['sched-1', 'sched-2'];
      mockPrisma.schedule.findMany.mockResolvedValue([{ id: 'sched-1' }, { id: 'sched-2' }]);
      mockTx.schedule.updateMany.mockResolvedValue({ count: 2 });
      mockTx.schedule.findMany.mockResolvedValue([
        { ...mockScheduleRecord, id: 'sched-1' },
        { ...mockScheduleRecord, id: 'sched-2' },
      ]);

      const result = await service.bulkPin(TENANT_ID, {
        schedule_ids: ids,
        pin_reason: 'Testing',
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta.pinned).toBe(2);
    });
  });

  describe('update', () => {
    const existingSchedule = {
      id: SCHEDULE_ID,
      class_id: CLASS_ID,
      academic_year_id: AY_ID,
      room_id: ROOM_ID,
      teacher_staff_id: TEACHER_ID,
      weekday: 1,
      start_time: new Date('1970-01-01T08:00:00.000Z'),
      end_time: new Date('1970-01-01T09:00:00.000Z'),
      effective_start_date: new Date('2025-09-01'),
      effective_end_date: null,
    };

    it('should throw NotFoundException when schedule does not exist', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      await expect(service.update(TENANT_ID, 'non-existent', USER_ID, {}, [])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should update schedule when no conflicts', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      const result = await service.update(TENANT_ID, SCHEDULE_ID, USER_ID, { weekday: 2 }, []);

      expect(result.schedule).toBeDefined();
      expect(result.conflicts).toEqual([]);
    });

    it('should throw ConflictException when hard conflicts exist and no override', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [{ type: 'hard', category: 'teacher_double_booking', message: 'Teacher conflict' }],
        soft: [],
      });

      await expect(
        service.update(TENANT_ID, SCHEDULE_ID, USER_ID, { weekday: 2 }, []),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ForbiddenException when override requested but no permission', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [{ type: 'hard', category: 'teacher_double_booking', message: 'Teacher conflict' }],
        soft: [],
      });

      await expect(
        service.update(
          TENANT_ID,
          SCHEDULE_ID,
          USER_ID,
          { weekday: 2, override_conflicts: true },
          [],
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update when override requested and user has permission', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(existingSchedule);
      const hardConflict = {
        type: 'hard',
        category: 'room_double_booking',
        message: 'Room conflict',
      };
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [hardConflict],
        soft: [],
      });
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      const result = await service.update(
        TENANT_ID,
        SCHEDULE_ID,
        USER_ID,
        { weekday: 2, override_conflicts: true },
        ['schedule.override_conflict'],
      );

      expect(result.schedule).toBeDefined();
      expect(result.conflicts).toContain(hardConflict);
    });

    it('should validate room when room_id is being changed', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      await service.update(TENANT_ID, SCHEDULE_ID, USER_ID, { room_id: 'new-room-id' }, []);

      expect(mockRoomsReadFacade.existsOrThrow).toHaveBeenCalledWith(TENANT_ID, 'new-room-id');
    });

    it('should validate teacher when teacher_staff_id is being changed', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      await service.update(
        TENANT_ID,
        SCHEDULE_ID,
        USER_ID,
        { teacher_staff_id: 'new-teacher-id' },
        [],
      );

      expect(mockStaffProfileReadFacade.existsOrThrow).toHaveBeenCalledWith(
        TENANT_ID,
        'new-teacher-id',
      );
    });

    it('should not validate room when room_id is undefined', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      await service.update(TENANT_ID, SCHEDULE_ID, USER_ID, { weekday: 3 }, []);

      expect(mockRoomsReadFacade.existsOrThrow).not.toHaveBeenCalled();
    });

    it('should not validate teacher when teacher_staff_id is undefined', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      await service.update(TENANT_ID, SCHEDULE_ID, USER_ID, { weekday: 3 }, []);

      expect(mockStaffProfileReadFacade.existsOrThrow).not.toHaveBeenCalled();
    });

    it('should disconnect room when room_id is set to null', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      await service.update(TENANT_ID, SCHEDULE_ID, USER_ID, { room_id: null }, []);

      const updateCall = mockTx.schedule.update.mock.calls[0][0];
      expect(updateCall.data.room).toEqual({ disconnect: true });
    });

    it('should connect new room when room_id is set to a value', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      await service.update(TENANT_ID, SCHEDULE_ID, USER_ID, { room_id: 'new-room-id' }, []);

      const updateCall = mockTx.schedule.update.mock.calls[0][0];
      expect(updateCall.data.room).toEqual({ connect: { id: 'new-room-id' } });
    });

    it('should disconnect teacher when teacher_staff_id is set to null', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      await service.update(TENANT_ID, SCHEDULE_ID, USER_ID, { teacher_staff_id: null }, []);

      const updateCall = mockTx.schedule.update.mock.calls[0][0];
      expect(updateCall.data.teacher).toEqual({ disconnect: true });
    });

    it('should connect new teacher when teacher_staff_id is set to a value', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      await service.update(
        TENANT_ID,
        SCHEDULE_ID,
        USER_ID,
        { teacher_staff_id: 'new-teacher-id' },
        [],
      );

      const updateCall = mockTx.schedule.update.mock.calls[0][0];
      expect(updateCall.data.teacher).toEqual({ connect: { id: 'new-teacher-id' } });
    });

    it('should update time, date, pin, and pin_reason fields', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      await service.update(
        TENANT_ID,
        SCHEDULE_ID,
        USER_ID,
        {
          weekday: 2,
          start_time: '10:00',
          end_time: '11:00',
          effective_start_date: '2025-10-01',
          effective_end_date: '2026-06-30',
          is_pinned: true,
          pin_reason: 'Test pin',
        },
        [],
      );

      const updateCall = mockTx.schedule.update.mock.calls[0][0];
      expect(updateCall.data.weekday).toBe(2);
      expect(updateCall.data.start_time).toEqual(new Date('1970-01-01T10:00:00.000Z'));
      expect(updateCall.data.end_time).toEqual(new Date('1970-01-01T11:00:00.000Z'));
      expect(updateCall.data.effective_start_date).toEqual(new Date('2025-10-01'));
      expect(updateCall.data.effective_end_date).toEqual(new Date('2026-06-30'));
      expect(updateCall.data.is_pinned).toBe(true);
      expect(updateCall.data.pin_reason).toBe('Test pin');
    });

    it('should set effective_end_date to null when cleared', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue({
        ...existingSchedule,
        effective_end_date: new Date('2026-06-30'),
      });
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      await service.update(TENANT_ID, SCHEDULE_ID, USER_ID, { effective_end_date: null }, []);

      const updateCall = mockTx.schedule.update.mock.calls[0][0];
      expect(updateCall.data.effective_end_date).toBeNull();
    });

    it('should merge existing values with dto for conflict detection', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      await service.update(TENANT_ID, SCHEDULE_ID, USER_ID, { weekday: 5 }, []);

      // Conflict detection should be called with merged entry
      const detectCall = mockConflictDetection.detectConflicts.mock.calls[0];
      expect(detectCall[0]).toBe(TENANT_ID);
      expect(detectCall[1].weekday).toBe(5); // updated
      expect(detectCall[1].class_id).toBe(CLASS_ID); // from existing
      expect(detectCall[2]).toBe(SCHEDULE_ID); // exclude self
    });

    it('should use existing effective_end_date for conflict detection when dto does not provide one', async () => {
      const scheduleWithEndDate = {
        ...existingSchedule,
        effective_end_date: new Date('2026-06-30'),
      };
      mockPrisma.schedule.findFirst.mockResolvedValue(scheduleWithEndDate);
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      await service.update(TENANT_ID, SCHEDULE_ID, USER_ID, { weekday: 2 }, []);

      const detectCall = mockConflictDetection.detectConflicts.mock.calls[0];
      expect(detectCall[1].effective_end_date).toBe('2026-06-30');
    });

    it('should use null for effective_end_date in merge when existing is null and dto is undefined', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(existingSchedule);
      mockConflictDetection.detectConflicts.mockResolvedValue({
        hard: [],
        soft: [],
      });
      mockTx.schedule.update.mockResolvedValue(mockScheduleRecord);

      await service.update(TENANT_ID, SCHEDULE_ID, USER_ID, { weekday: 2 }, []);

      const detectCall = mockConflictDetection.detectConflicts.mock.calls[0];
      expect(detectCall[1].effective_end_date).toBeNull();
    });
  });

  describe('endDateForClass', () => {
    it('should end-date active schedules for a class', async () => {
      const scheduleIds = [{ id: 'sched-1' }, { id: 'sched-2' }];
      mockTx.schedule.findMany.mockResolvedValue(scheduleIds);
      mockTx.schedule.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.endDateForClass(TENANT_ID, CLASS_ID);

      expect(result).toBe(2);
    });

    it('should return 0 when no active schedules exist for the class', async () => {
      mockTx.schedule.findMany.mockResolvedValue([]);

      const result = await service.endDateForClass(TENANT_ID, CLASS_ID);

      expect(result).toBe(0);
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
      expect(result['is_pinned']).toBe(false);
    });

    it('should throw NotFoundException when schedule does not exist for unpin', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      await expect(service.unpin(TENANT_ID, 'non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('formatSchedule (via findOne)', () => {
    it('edge: should return non-Date values unchanged', async () => {
      const recordWithStrings = {
        ...mockScheduleRecord,
        start_time: '08:00',
        end_time: '09:00',
        effective_start_date: '2025-09-01',
        effective_end_date: null,
      };
      mockPrisma.schedule.findFirst.mockResolvedValue(recordWithStrings);

      const result = await service.findOne(TENANT_ID, SCHEDULE_ID);

      expect(result['start_time']).toBe('08:00');
      expect(result['end_time']).toBe('09:00');
      expect(result['effective_start_date']).toBe('2025-09-01');
      expect(result['effective_end_date']).toBeNull();
    });
  });
});
