import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { PersonalTimetableService } from './personal-timetable.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const STAFF_ID = 'staff-1';
const CLASS_ID = 'class-1';
const TOKEN_ID = 'token-1';
const TOKEN = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

const mockTx = {
  calendarSubscriptionToken: {
    create: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

function makeSchedule(weekday: number, periodOrder: number) {
  return {
    id: `schedule-${weekday}-${periodOrder}`,
    weekday,
    period_order: periodOrder,
    start_time: new Date('1970-01-01T09:00:00Z'),
    end_time: new Date('1970-01-01T10:00:00Z'),
    rotation_week: null,
    class_entity: { name: '10A', subject: { name: 'Maths' } },
    teacher: { user: { first_name: 'Alice', last_name: 'Brown' } },
    room: { name: 'Room 101' },
  };
}

describe('PersonalTimetableService', () => {
  let service: PersonalTimetableService;
  let mockPrisma: {
    schedule: { findMany: jest.Mock };
    staffProfile: { findFirst: jest.Mock };
    calendarSubscriptionToken: { findFirst: jest.Mock; findMany: jest.Mock; delete: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      schedule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      staffProfile: {
        findFirst: jest.fn(),
      },
      calendarSubscriptionToken: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn(),
      },
    };

    mockTx.calendarSubscriptionToken.create.mockResolvedValue({
      id: TOKEN_ID,
      token: TOKEN,
      created_at: new Date('2026-03-01T00:00:00Z'),
    });

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
        { provide: StaffProfileReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      findByIds: jest.fn().mockResolvedValue([]),
      findByUserId: jest.fn().mockResolvedValue(null),
      findActiveStaff: jest.fn().mockResolvedValue([]),
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      resolveProfileId: jest.fn().mockResolvedValue('staff-1'),
    } },
        PersonalTimetableService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PersonalTimetableService>(PersonalTimetableService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getTeacherTimetable ──────────────────────────────────────────────────

  describe('getTeacherTimetable', () => {
    it('should return formatted timetable entries for a teacher', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        makeSchedule(1, 1),
        makeSchedule(2, 2),
      ]);

      const result = await service.getTeacherTimetable(TENANT_ID, STAFF_ID, {});

      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.weekday).toBe(1);
      expect(result.data[0]!.period_order).toBe(1);
      expect(result.data[0]!.class_name).toBe('10A');
      expect(result.data[0]!.subject_name).toBe('Maths');
      expect(result.data[0]!.room_name).toBe('Room 101');
    });

    it('should format start_time and end_time as HH:MM strings', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([makeSchedule(1, 1)]);

      const result = await service.getTeacherTimetable(TENANT_ID, STAFF_ID, {});

      expect(result.data[0]!.start_time).toMatch(/^\d{2}:\d{2}$/);
      expect(result.data[0]!.end_time).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should return empty array when teacher has no schedules', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      const result = await service.getTeacherTimetable(TENANT_ID, STAFF_ID, {});

      expect(result.data).toHaveLength(0);
    });

    it('should filter by rotation_week when provided', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await service.getTeacherTimetable(TENANT_ID, STAFF_ID, { rotation_week: 2 });

      expect(mockPrisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ rotation_week: 2 }),
        }),
      );
    });
  });

  // ─── getClassTimetable ────────────────────────────────────────────────────

  describe('getClassTimetable', () => {
    it('should return formatted timetable entries for a class', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        makeSchedule(1, 1),
        makeSchedule(3, 2),
      ]);

      const result = await service.getClassTimetable(TENANT_ID, CLASS_ID, {});

      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.weekday).toBe(1);
    });

    it('should include teacher_name in class timetable entries', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([makeSchedule(1, 1)]);

      const result = await service.getClassTimetable(TENANT_ID, CLASS_ID, {});

      expect(result.data[0]).toHaveProperty('teacher_name');
      expect(result.data[0]!.teacher_name).toBe('Alice Brown');
    });

    it('should query by class_id not teacher_staff_id', async () => {
      await service.getClassTimetable(TENANT_ID, CLASS_ID, {});

      expect(mockPrisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ class_id: CLASS_ID }),
        }),
      );
    });
  });

  // ─── generateIcsCalendar ──────────────────────────────────────────────────

  describe('generateIcsCalendar', () => {
    it('should return valid ICS format with required headers', async () => {
      mockPrisma.calendarSubscriptionToken.findFirst.mockResolvedValue({
        entity_type: 'teacher',
        entity_id: STAFF_ID,
        tenant: { name: 'Test School' },
      });
      mockPrisma.schedule.findMany.mockResolvedValue([makeSchedule(1, 1)]);

      const ics = await service.generateIcsCalendar(TENANT_ID, TOKEN);

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('END:VCALENDAR');
      expect(ics).toContain('VERSION:2.0');
      expect(ics).toContain('PRODID:-//EduPod//Timetable//EN');
    });

    it('should include VEVENT blocks for each schedule entry', async () => {
      mockPrisma.calendarSubscriptionToken.findFirst.mockResolvedValue({
        entity_type: 'teacher',
        entity_id: STAFF_ID,
        tenant: { name: 'Test School' },
      });
      mockPrisma.schedule.findMany.mockResolvedValue([
        makeSchedule(1, 1),
        makeSchedule(3, 2),
      ]);

      const ics = await service.generateIcsCalendar(TENANT_ID, TOKEN);

      const eventCount = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
      expect(eventCount).toBe(2);
    });

    it('should include RRULE for weekly recurrence in each event', async () => {
      mockPrisma.calendarSubscriptionToken.findFirst.mockResolvedValue({
        entity_type: 'teacher',
        entity_id: STAFF_ID,
        tenant: { name: 'Test School' },
      });
      mockPrisma.schedule.findMany.mockResolvedValue([makeSchedule(1, 1)]);

      const ics = await service.generateIcsCalendar(TENANT_ID, TOKEN);

      expect(ics).toContain('RRULE:FREQ=WEEKLY');
    });

    it('should throw NotFoundException when token does not exist', async () => {
      mockPrisma.calendarSubscriptionToken.findFirst.mockResolvedValue(null);

      await expect(
        service.generateIcsCalendar(TENANT_ID, 'invalid-token'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle class-type tokens by querying by class_id', async () => {
      mockPrisma.calendarSubscriptionToken.findFirst.mockResolvedValue({
        entity_type: 'class',
        entity_id: CLASS_ID,
        tenant: { name: 'Test School' },
      });
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await service.generateIcsCalendar(TENANT_ID, TOKEN);

      expect(mockPrisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ class_id: CLASS_ID }),
        }),
      );
    });
  });

  // ─── createSubscriptionToken ──────────────────────────────────────────────

  describe('createSubscriptionToken', () => {
    it('should create and return a subscription token', async () => {
      const result = await service.createSubscriptionToken(TENANT_ID, USER_ID, {
        entity_type: 'teacher',
        entity_id: STAFF_ID,
      });

      expect(result.id).toBe(TOKEN_ID);
      expect(result.token).toBe(TOKEN);
      expect(result.entity_type).toBe('teacher');
      expect(result.entity_id).toBe(STAFF_ID);
      expect(mockTx.calendarSubscriptionToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            user_id: USER_ID,
            entity_type: 'teacher',
            entity_id: STAFF_ID,
          }),
        }),
      );
    });

    it('should generate a 64-character hex token', async () => {
      await service.createSubscriptionToken(TENANT_ID, USER_ID, {
        entity_type: 'teacher',
        entity_id: STAFF_ID,
      });

      const createCall = mockTx.calendarSubscriptionToken.create.mock.calls[0][0];
      expect(createCall.data.token).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ─── revokeSubscriptionToken ──────────────────────────────────────────────

  describe('revokeSubscriptionToken', () => {
    it('should revoke a token owned by the user', async () => {
      mockPrisma.calendarSubscriptionToken.findFirst.mockResolvedValue({
        id: TOKEN_ID,
        user_id: USER_ID,
      });

      const result = await service.revokeSubscriptionToken(TENANT_ID, USER_ID, TOKEN_ID);

      expect(result.revoked).toBe(true);
      expect(mockTx.calendarSubscriptionToken.delete).toHaveBeenCalledWith({
        where: { id: TOKEN_ID },
      });
    });

    it('should throw NotFoundException when token does not exist', async () => {
      mockPrisma.calendarSubscriptionToken.findFirst.mockResolvedValue(null);

      await expect(
        service.revokeSubscriptionToken(TENANT_ID, USER_ID, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when token belongs to a different user', async () => {
      mockPrisma.calendarSubscriptionToken.findFirst.mockResolvedValue({
        id: TOKEN_ID,
        user_id: 'another-user',
      });

      await expect(
        service.revokeSubscriptionToken(TENANT_ID, USER_ID, TOKEN_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
