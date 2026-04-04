import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';

import { ScheduleSwapService } from './schedule-swap.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const SCHEDULE_A_ID = 'schedule-a';
const SCHEDULE_B_ID = 'schedule-b';

const mockTx = {
  schedule: {
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

const makeSchedule = (
  id: string,
  teacherId: string,
  weekday: number,
  roomId: string | null = 'room-1',
  periodOrder: number = 1,
) => ({
  id,
  teacher_staff_id: teacherId,
  room_id: roomId,
  weekday,
  period_order: periodOrder,
  start_time: new Date('1970-01-01T09:00:00Z'),
  end_time: new Date('1970-01-01T10:00:00Z'),
  rotation_week: null,
  class_entity: { name: `Class-${id}`, year_group_id: 'yg-1', subject_id: 'sub-1' },
  teacher: { id: teacherId, user: { first_name: 'Teacher', last_name: teacherId } },
  room: { id: roomId ?? '', name: `Room-${roomId}` },
});

describe('ScheduleSwapService', () => {
  let service: ScheduleSwapService;
  let mockPrisma: {
    schedule: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      schedule: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
    };

    mockTx.schedule.update.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: SchedulesReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      findCoreById: jest.fn().mockResolvedValue(null),
      existsById: jest.fn().mockResolvedValue(null),
      findBusyTeacherIds: jest.fn().mockResolvedValue(new Set()),
      countWeeklyPeriodsPerTeacher: jest.fn().mockResolvedValue(new Map()),
      findTeacherTimetable: jest.fn().mockResolvedValue([]),
      findClassTimetable: jest.fn().mockResolvedValue([]),
      findPinnedEntries: jest.fn().mockResolvedValue([]),
      countPinnedEntries: jest.fn().mockResolvedValue(0),
      findByAcademicYear: jest.fn().mockResolvedValue([]),
      findScheduledClassIds: jest.fn().mockResolvedValue([]),
      countEntriesPerClass: jest.fn().mockResolvedValue(new Map()),
      count: jest.fn().mockResolvedValue(0),
      hasRotationEntries: jest.fn().mockResolvedValue(false),
      countByRoom: jest.fn().mockResolvedValue(0),
      findTeacherScheduleEntries: jest.fn().mockResolvedValue([]),
      findTeacherWorkloadEntries: jest.fn().mockResolvedValue([]),
      countRoomAssignedEntries: jest.fn().mockResolvedValue(0),
      findByIdWithSwapContext: jest.fn().mockResolvedValue(null),
      hasConflict: jest.fn().mockResolvedValue(false),
      findByIdWithSubstitutionContext: jest.fn().mockResolvedValue(null),
      findRoomScheduleEntries: jest.fn().mockResolvedValue([]),
    } },
        ScheduleSwapService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ScheduleSwapService>(ScheduleSwapService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── validateSwap ─────────────────────────────────────────────────────────

  describe('validateSwap', () => {
    it('should return valid=true when no constraint violations exist', async () => {
      mockPrisma.schedule.findFirst
        .mockResolvedValueOnce(makeSchedule(SCHEDULE_A_ID, 'teacher-1', 1))
        .mockResolvedValueOnce(makeSchedule(SCHEDULE_B_ID, 'teacher-2', 3))
        // No conflict checks return null
        .mockResolvedValue(null);

      const result = await service.validateSwap(TENANT_ID, {
        schedule_id_a: SCHEDULE_A_ID,
        schedule_id_b: SCHEDULE_B_ID,
      });

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should detect teacher conflict and return violation', async () => {
      mockPrisma.schedule.findFirst
        .mockResolvedValueOnce(makeSchedule(SCHEDULE_A_ID, 'teacher-1', 1))
        .mockResolvedValueOnce(makeSchedule(SCHEDULE_B_ID, 'teacher-2', 3))
        // teacher-1 has a conflict at schedule B's time slot
        .mockResolvedValueOnce({ id: 'conflict-schedule' })
        .mockResolvedValue(null);

      const result = await service.validateSwap(TENANT_ID, {
        schedule_id_a: SCHEDULE_A_ID,
        schedule_id_b: SCHEDULE_B_ID,
      });

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('conflict');
    });

    it('should throw NotFoundException when schedule A does not exist', async () => {
      mockPrisma.schedule.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeSchedule(SCHEDULE_B_ID, 'teacher-2', 3));

      await expect(
        service.validateSwap(TENANT_ID, {
          schedule_id_a: 'nonexistent',
          schedule_id_b: SCHEDULE_B_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when schedule B does not exist', async () => {
      mockPrisma.schedule.findFirst
        .mockResolvedValueOnce(makeSchedule(SCHEDULE_A_ID, 'teacher-1', 1))
        .mockResolvedValueOnce(null);

      await expect(
        service.validateSwap(TENANT_ID, {
          schedule_id_a: SCHEDULE_A_ID,
          schedule_id_b: 'nonexistent',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should include room change flag in impact when rooms differ', async () => {
      const schedA = makeSchedule(SCHEDULE_A_ID, 'teacher-1', 1, 'room-1');
      const schedB = makeSchedule(SCHEDULE_B_ID, 'teacher-2', 3, 'room-2');

      mockPrisma.schedule.findFirst
        .mockResolvedValueOnce(schedA)
        .mockResolvedValueOnce(schedB)
        .mockResolvedValue(null);

      const result = await service.validateSwap(TENANT_ID, {
        schedule_id_a: SCHEDULE_A_ID,
        schedule_id_b: SCHEDULE_B_ID,
      });

      expect(result.impact.rooms_changed).toBe(true);
    });

    it('should list affected teachers in impact', async () => {
      mockPrisma.schedule.findFirst
        .mockResolvedValueOnce(makeSchedule(SCHEDULE_A_ID, 'teacher-1', 1))
        .mockResolvedValueOnce(makeSchedule(SCHEDULE_B_ID, 'teacher-2', 3))
        .mockResolvedValue(null);

      const result = await service.validateSwap(TENANT_ID, {
        schedule_id_a: SCHEDULE_A_ID,
        schedule_id_b: SCHEDULE_B_ID,
      });

      expect(result.impact.teachers_affected).toHaveLength(2);
    });
  });

  // ─── executeSwap ──────────────────────────────────────────────────────────

  describe('executeSwap', () => {
    it('should perform atomic swap of teachers and rooms', async () => {
      const schedA = makeSchedule(SCHEDULE_A_ID, 'teacher-1', 1, 'room-1');
      const schedB = makeSchedule(SCHEDULE_B_ID, 'teacher-2', 3, 'room-2');

      // validateSwap: findFirst x2 (schedA, schedB) then conflict checks (x4 → null)
      // executeSwap: findFirst x2 again (schedA, schedB) for the actual swap data
      mockPrisma.schedule.findFirst
        .mockResolvedValueOnce(schedA)   // validateSwap — schedule A
        .mockResolvedValueOnce(schedB)   // validateSwap — schedule B
        .mockResolvedValueOnce(null)     // conflict check: teacher-1 at B's slot
        .mockResolvedValueOnce(null)     // conflict check: teacher-2 at A's slot
        .mockResolvedValueOnce(null)     // conflict check: room-1 at B's slot
        .mockResolvedValueOnce(null)     // conflict check: room-2 at A's slot
        .mockResolvedValueOnce(schedA)   // executeSwap — fetch schedA data
        .mockResolvedValueOnce(schedB);  // executeSwap — fetch schedB data

      const result = await service.executeSwap(TENANT_ID, USER_ID, {
        schedule_id_a: SCHEDULE_A_ID,
        schedule_id_b: SCHEDULE_B_ID,
      });

      expect(result.swapped).toBe(true);
      expect(result.schedule_id_a).toBe(SCHEDULE_A_ID);
      expect(result.schedule_id_b).toBe(SCHEDULE_B_ID);
      expect(result.swapped_by).toBe(USER_ID);
      expect(mockTx.schedule.update).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException when swap has constraint violations', async () => {
      const schedA = makeSchedule(SCHEDULE_A_ID, 'teacher-1', 1);
      const schedB = makeSchedule(SCHEDULE_B_ID, 'teacher-2', 3);

      mockPrisma.schedule.findFirst
        .mockResolvedValueOnce(schedA)
        .mockResolvedValueOnce(schedB)
        // Return a conflict for teacher-1 at schedule B's slot
        .mockResolvedValueOnce({ id: 'conflict' })
        .mockResolvedValue(null);

      await expect(
        service.executeSwap(TENANT_ID, USER_ID, {
          schedule_id_a: SCHEDULE_A_ID,
          schedule_id_b: SCHEDULE_B_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── emergencyChange ──────────────────────────────────────────────────────

  describe('emergencyChange', () => {
    it('should update teacher when new_teacher_staff_id is provided', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(
        makeSchedule(SCHEDULE_A_ID, 'teacher-1', 1),
      );
      mockTx.schedule.update.mockResolvedValue({
        id: SCHEDULE_A_ID,
        updated_at: new Date(),
      });

      const result = await service.emergencyChange(TENANT_ID, USER_ID, {
        schedule_id: SCHEDULE_A_ID,
        new_teacher_staff_id: 'teacher-3',
        reason: 'Emergency',
      });

      expect(result.id).toBe(SCHEDULE_A_ID);
      expect(result.changed_by).toBe(USER_ID);
      expect(result.cancelled).toBe(false);
    });

    it('should cancel period when cancel_period is true', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(
        makeSchedule(SCHEDULE_A_ID, 'teacher-1', 1),
      );
      mockTx.schedule.update.mockResolvedValue({
        id: SCHEDULE_A_ID,
        updated_at: new Date(),
      });

      const result = await service.emergencyChange(TENANT_ID, USER_ID, {
        schedule_id: SCHEDULE_A_ID,
        cancel_period: true,
        reason: 'No replacement available',
      });

      expect(result.cancelled).toBe(true);
      expect(mockTx.schedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ effective_end_date: expect.any(Date) }),
        }),
      );
    });

    it('should throw BadRequestException when no change is specified', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(
        makeSchedule(SCHEDULE_A_ID, 'teacher-1', 1),
      );

      await expect(
        service.emergencyChange(TENANT_ID, USER_ID, {
          schedule_id: SCHEDULE_A_ID,
          reason: 'Nothing changed',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when schedule does not exist', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      await expect(
        service.emergencyChange(TENANT_ID, USER_ID, {
          schedule_id: 'nonexistent',
          new_room_id: 'room-2',
          reason: 'Room change',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
