import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
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
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
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
  let module: TestingModule;
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

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        {
          provide: SchedulesReadFacade,
          useValue: {
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
          },
        },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue(null),
            findByIds: jest.fn().mockResolvedValue([]),
            findByUserId: jest.fn().mockResolvedValue(null),
            findActiveStaff: jest.fn().mockResolvedValue([]),
            existsOrThrow: jest.fn().mockResolvedValue(undefined),
            resolveProfileId: jest.fn().mockResolvedValue('staff-1'),
          },
        },
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
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findTeacherTimetable as jest.Mock).mockResolvedValue([
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
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findTeacherTimetable as jest.Mock).mockResolvedValue([makeSchedule(1, 1)]);

      const result = await service.getTeacherTimetable(TENANT_ID, STAFF_ID, {});

      expect(result.data[0]!.start_time).toMatch(/^\d{2}:\d{2}$/);
      expect(result.data[0]!.end_time).toMatch(/^\d{2}:\d{2}$/);
    });

    it('should return empty array when teacher has no schedules', async () => {
      // findTeacherTimetable returns [] by default

      const result = await service.getTeacherTimetable(TENANT_ID, STAFF_ID, {});

      expect(result.data).toHaveLength(0);
    });

    it('should filter by rotation_week when provided', async () => {
      // findTeacherTimetable returns [] by default

      await service.getTeacherTimetable(TENANT_ID, STAFF_ID, { rotation_week: 2 });

      const schedFacade = module.get(SchedulesReadFacade);
      expect(schedFacade.findTeacherTimetable).toHaveBeenCalledWith(
        TENANT_ID,
        STAFF_ID,
        expect.objectContaining({ rotationWeek: 2 }),
      );
    });
  });

  // ─── getClassTimetable ────────────────────────────────────────────────────

  describe('getClassTimetable', () => {
    it('should return formatted timetable entries for a class', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findClassTimetable as jest.Mock).mockResolvedValue([
        makeSchedule(1, 1),
        makeSchedule(3, 2),
      ]);

      const result = await service.getClassTimetable(TENANT_ID, CLASS_ID, {});

      expect(result.data).toHaveLength(2);
      expect(result.data[0]!.weekday).toBe(1);
    });

    it('should include teacher_name in class timetable entries', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findClassTimetable as jest.Mock).mockResolvedValue([makeSchedule(1, 1)]);

      const result = await service.getClassTimetable(TENANT_ID, CLASS_ID, {});

      expect(result.data[0]).toHaveProperty('teacher_name');
      expect(result.data[0]!.teacher_name).toBe('Alice Brown');
    });

    it('should query by class_id not teacher_staff_id', async () => {
      await service.getClassTimetable(TENANT_ID, CLASS_ID, {});

      const schedFacade = module.get(SchedulesReadFacade);
      expect(schedFacade.findClassTimetable).toHaveBeenCalledWith(
        TENANT_ID,
        CLASS_ID,
        expect.any(Object),
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
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findTeacherTimetable as jest.Mock).mockResolvedValue([makeSchedule(1, 1)]);

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
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findTeacherTimetable as jest.Mock).mockResolvedValue([
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
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findTeacherTimetable as jest.Mock).mockResolvedValue([makeSchedule(1, 1)]);

      const ics = await service.generateIcsCalendar(TENANT_ID, TOKEN);

      expect(ics).toContain('RRULE:FREQ=WEEKLY');
    });

    it('should throw NotFoundException when token does not exist', async () => {
      mockPrisma.calendarSubscriptionToken.findFirst.mockResolvedValue(null);

      await expect(service.generateIcsCalendar(TENANT_ID, 'invalid-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle class-type tokens by querying by class_id', async () => {
      mockPrisma.calendarSubscriptionToken.findFirst.mockResolvedValue({
        entity_type: 'class',
        entity_id: CLASS_ID,
        tenant: { name: 'Test School' },
      });

      await service.generateIcsCalendar(TENANT_ID, TOKEN);

      const schedFacade = module.get(SchedulesReadFacade);
      expect(schedFacade.findClassTimetable).toHaveBeenCalledWith(
        TENANT_ID,
        CLASS_ID,
        expect.any(Object),
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

      await expect(service.revokeSubscriptionToken(TENANT_ID, USER_ID, TOKEN_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── getTeacherTimetableByUserId ─────────────────────────────────────────

  describe('getTeacherTimetableByUserId', () => {
    it('should resolve staff profile from user ID and return timetable', async () => {
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findByUserId as jest.Mock).mockResolvedValue({ id: STAFF_ID });
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findTeacherTimetable as jest.Mock).mockResolvedValue([makeSchedule(1, 1)]);

      const result = await service.getTeacherTimetableByUserId(TENANT_ID, USER_ID, {});

      expect(result.data).toHaveLength(1);
      expect(schedFacade.findTeacherTimetable).toHaveBeenCalledWith(
        TENANT_ID,
        STAFF_ID,
        expect.any(Object),
      );
    });

    it('should throw NotFoundException when no staff profile found for user', async () => {
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findByUserId as jest.Mock).mockResolvedValue(null);

      await expect(
        service.getTeacherTimetableByUserId(TENANT_ID, 'unknown-user', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── listSubscriptionTokens ──────────────────────────────────────────────

  describe('listSubscriptionTokens', () => {
    it('should return all tokens for the user', async () => {
      mockPrisma.calendarSubscriptionToken.findMany.mockResolvedValue([
        {
          id: TOKEN_ID,
          token: TOKEN,
          entity_type: 'teacher',
          entity_id: STAFF_ID,
          created_at: new Date('2026-03-01T00:00:00Z'),
        },
      ]);

      const result = await service.listSubscriptionTokens(TENANT_ID, USER_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.id).toBe(TOKEN_ID);
      expect(result.data[0]!.entity_type).toBe('teacher');
      expect(result.data[0]!.created_at).toBe('2026-03-01T00:00:00.000Z');
    });

    it('should return empty array when user has no tokens', async () => {
      mockPrisma.calendarSubscriptionToken.findMany.mockResolvedValue([]);

      const result = await service.listSubscriptionTokens(TENANT_ID, USER_ID);

      expect(result.data).toHaveLength(0);
    });
  });

  // ─── getTeacherTimetable — edge cases ────────────────────────────────────

  describe('getTeacherTimetable — edge cases', () => {
    it('should use week_date when provided', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findTeacherTimetable as jest.Mock).mockResolvedValue([]);

      await service.getTeacherTimetable(TENANT_ID, STAFF_ID, { week_date: '2026-05-01' });

      expect(schedFacade.findTeacherTimetable).toHaveBeenCalledWith(
        TENANT_ID,
        STAFF_ID,
        expect.objectContaining({ asOfDate: new Date('2026-05-01') }),
      );
    });

    it('should handle schedule with null class_entity', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findTeacherTimetable as jest.Mock).mockResolvedValue([
        {
          id: 'sch-1',
          weekday: 1,
          period_order: 1,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T10:00:00Z'),
          rotation_week: null,
          class_entity: null,
          room: null,
        },
      ]);

      const result = await service.getTeacherTimetable(TENANT_ID, STAFF_ID, {});

      expect(result.data[0]!.class_name).toBe('');
      expect(result.data[0]!.subject_name).toBeNull();
      expect(result.data[0]!.room_name).toBeNull();
    });
  });

  // ─── getClassTimetable — edge cases ──────────────────────────────────────

  describe('getClassTimetable — edge cases', () => {
    it('should handle null teacher in class timetable entries', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findClassTimetable as jest.Mock).mockResolvedValue([
        {
          id: 'sch-1',
          weekday: 1,
          period_order: 1,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T10:00:00Z'),
          rotation_week: null,
          class_entity: { name: '10A', subject: { name: 'Maths' } },
          teacher: null,
          room: { name: 'Room 101' },
        },
      ]);

      const result = await service.getClassTimetable(TENANT_ID, CLASS_ID, {});

      expect(result.data[0]!.teacher_name).toBeNull();
    });

    it('should use week_date and rotation_week from query', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findClassTimetable as jest.Mock).mockResolvedValue([]);

      await service.getClassTimetable(TENANT_ID, CLASS_ID, {
        week_date: '2026-05-01',
        rotation_week: 1,
      });

      expect(schedFacade.findClassTimetable).toHaveBeenCalledWith(
        TENANT_ID,
        CLASS_ID,
        expect.objectContaining({
          asOfDate: new Date('2026-05-01'),
          rotationWeek: 1,
        }),
      );
    });
  });

  // ─── generateIcsCalendar — edge cases ────────────────────────────────────

  describe('generateIcsCalendar — edge cases', () => {
    it('should produce valid ICS even when no schedules exist', async () => {
      mockPrisma.calendarSubscriptionToken.findFirst.mockResolvedValue({
        entity_type: 'teacher',
        entity_id: STAFF_ID,
        tenant: { name: 'Test School' },
      });
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findTeacherTimetable as jest.Mock).mockResolvedValue([]);

      const ics = await service.generateIcsCalendar(TENANT_ID, TOKEN);

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('END:VCALENDAR');
      expect(ics).not.toContain('BEGIN:VEVENT');
    });

    it('should escape special characters in ICS fields', async () => {
      mockPrisma.calendarSubscriptionToken.findFirst.mockResolvedValue({
        entity_type: 'teacher',
        entity_id: STAFF_ID,
        tenant: { name: 'Test, School; Special' },
      });
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findTeacherTimetable as jest.Mock).mockResolvedValue([
        {
          ...makeSchedule(1, 1),
          class_entity: { name: 'Class,With;Special', subject: { name: 'Maths\\101' } },
        },
      ]);

      const ics = await service.generateIcsCalendar(TENANT_ID, TOKEN);

      // ICS special characters should be escaped
      expect(ics).toContain('\\,');
    });
  });
});
