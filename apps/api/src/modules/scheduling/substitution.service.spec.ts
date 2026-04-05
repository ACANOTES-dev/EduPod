import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { SubstitutionService } from './substitution.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const STAFF_ID = 'staff-1';
const SCHEDULE_ID = 'schedule-1';
const ABSENCE_ID = 'absence-1';
const SUBSTITUTE_STAFF_ID = 'staff-2';

const mockTx = {
  teacherAbsence: {
    create: jest.fn(),
    delete: jest.fn(),
  },
  substitutionRecord: {
    create: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('SubstitutionService', () => {
  let service: SubstitutionService;
  let module: TestingModule;
  let mockPrisma: {
    staffProfile: { findFirst: jest.Mock; findMany: jest.Mock };
    teacherAbsence: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      delete: jest.Mock;
    };
    schedule: { findFirst: jest.Mock; findMany: jest.Mock };
    teacherCompetency: { findMany: jest.Mock };
    substitutionRecord: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      staffProfile: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      teacherAbsence: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        delete: jest.fn(),
      },
      schedule: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      teacherCompetency: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      substitutionRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
      },
    };

    mockTx.teacherAbsence.create.mockResolvedValue({
      id: ABSENCE_ID,
      created_at: new Date('2026-03-01T10:00:00Z'),
    });
    mockTx.substitutionRecord.create.mockResolvedValue({
      id: 'sub-record-1',
      status: 'assigned',
      created_at: new Date('2026-03-01T10:00:00Z'),
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
        SubstitutionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SubstitutionService>(SubstitutionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── reportAbsence ────────────────────────────────────────────────────────

  describe('reportAbsence', () => {
    it('should create an absence record when staff exists', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_ID });
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue(null);

      const result = await service.reportAbsence(TENANT_ID, USER_ID, {
        staff_id: STAFF_ID,
        date: '2026-03-20',
        full_day: true,
      });

      expect(result.id).toBe(ABSENCE_ID);
      expect(result.staff_id).toBe(STAFF_ID);
      expect(result.date).toBe('2026-03-20');
      expect(result.full_day).toBe(true);
      expect(mockTx.teacherAbsence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            staff_profile_id: STAFF_ID,
            full_day: true,
            reported_by_user_id: USER_ID,
          }),
        }),
      );
    });

    it('should throw NotFoundException when staff does not exist', async () => {
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.existsOrThrow as jest.Mock).mockRejectedValue(
        new NotFoundException('Staff not found'),
      );

      await expect(
        service.reportAbsence(TENANT_ID, USER_ID, {
          staff_id: 'nonexistent',
          date: '2026-03-20',
          full_day: true,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when absence already exists for the date', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_ID });
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue({ id: 'existing-absence' });

      await expect(
        service.reportAbsence(TENANT_ID, USER_ID, {
          staff_id: STAFF_ID,
          date: '2026-03-20',
          full_day: true,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should default full_day to true when not specified', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_ID });
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue(null);

      const result = await service.reportAbsence(TENANT_ID, USER_ID, {
        staff_id: STAFF_ID,
        date: '2026-03-20',
        full_day: true,
      });

      expect(result.full_day).toBe(true);
    });
  });

  // ─── findEligibleSubstitutes ──────────────────────────────────────────────

  describe('findEligibleSubstitutes', () => {
    const mockSchedule = {
      id: SCHEDULE_ID,
      teacher_staff_id: STAFF_ID,
      weekday: 1,
      start_time: new Date('1970-01-01T09:00:00Z'),
      end_time: new Date('1970-01-01T10:00:00Z'),
      academic_year_id: 'ay-1',
      class_entity: { year_group_id: 'yg-1', subject_id: 'sub-1', academic_year_id: 'ay-1' },
    };

    it('should return eligible substitutes excluding the absent teacher', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(mockSchedule);
      (schedFacade.findBusyTeacherIds as jest.Mock).mockResolvedValue(new Set());
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-2', user: { first_name: 'Jane', last_name: 'Smith' } },
        { id: STAFF_ID, user: { first_name: 'John', last_name: 'Doe' } }, // absent teacher
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);

      const result = await service.findEligibleSubstitutes(TENANT_ID, SCHEDULE_ID, '2026-03-20');

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.staff_profile_id).toBe('staff-2');
    });

    it('should filter out busy teachers from candidates', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(mockSchedule);
      (schedFacade.findBusyTeacherIds as jest.Mock).mockResolvedValue(new Set(['staff-2']));
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-2', user: { first_name: 'Jane', last_name: 'Smith' } },
        { id: 'staff-3', user: { first_name: 'Bob', last_name: 'Jones' } },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);

      const result = await service.findEligibleSubstitutes(TENANT_ID, SCHEDULE_ID, '2026-03-20');

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.staff_profile_id).toBe('staff-3');
    });

    it('should assign higher rank_score to competent teachers', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(mockSchedule);
      (schedFacade.findBusyTeacherIds as jest.Mock).mockResolvedValue(new Set());
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-2', user: { first_name: 'Jane', last_name: 'Smith' } },
        { id: 'staff-3', user: { first_name: 'Bob', last_name: 'Jones' } },
      ]);
      // staff-2 is competent, staff-3 is not
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        { staff_profile_id: 'staff-2', is_primary: false },
      ]);
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);

      const result = await service.findEligibleSubstitutes(TENANT_ID, SCHEDULE_ID, '2026-03-20');

      const staff2 = result.data.find((c) => c.staff_profile_id === 'staff-2');
      const staff3 = result.data.find((c) => c.staff_profile_id === 'staff-3');
      expect(staff2?.is_competent).toBe(true);
      expect(staff3?.is_competent).toBe(false);
      expect((staff2?.rank_score ?? 0) > (staff3?.rank_score ?? 0)).toBe(true);
    });

    it('should penalise high cover count teachers to ensure fairness', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(mockSchedule);
      (schedFacade.findBusyTeacherIds as jest.Mock).mockResolvedValue(new Set());
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-2', user: { first_name: 'Jane', last_name: 'Smith' } },
        { id: 'staff-3', user: { first_name: 'Bob', last_name: 'Jones' } },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      // staff-2 has covered 5 times, staff-3 has not covered at all
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        { substitute_staff_id: 'staff-2' },
        { substitute_staff_id: 'staff-2' },
        { substitute_staff_id: 'staff-2' },
        { substitute_staff_id: 'staff-2' },
        { substitute_staff_id: 'staff-2' },
      ]);

      const result = await service.findEligibleSubstitutes(TENANT_ID, SCHEDULE_ID, '2026-03-20');

      const staff2 = result.data.find((c) => c.staff_profile_id === 'staff-2');
      const staff3 = result.data.find((c) => c.staff_profile_id === 'staff-3');
      expect(staff2?.cover_count).toBe(5);
      expect(staff3?.cover_count).toBe(0);
      // staff-3 should rank higher as they haven't covered yet
      expect((staff3?.rank_score ?? 0) > (staff2?.rank_score ?? 0)).toBe(true);
    });

    it('should throw NotFoundException when schedule does not exist', async () => {
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      await expect(
        service.findEligibleSubstitutes(TENANT_ID, 'nonexistent', '2026-03-20'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── assignSubstitute ─────────────────────────────────────────────────────

  describe('assignSubstitute', () => {
    it('should create a substitution record when all entities exist', async () => {
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue({ id: ABSENCE_ID });
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.existsById as jest.Mock).mockResolvedValue(true);
      // staffProfileReadFacade.existsOrThrow resolves by default (doesn't throw)

      const result = await service.assignSubstitute(TENANT_ID, USER_ID, {
        absence_id: ABSENCE_ID,
        schedule_id: SCHEDULE_ID,
        substitute_staff_id: SUBSTITUTE_STAFF_ID,
      });

      expect(result.absence_id).toBe(ABSENCE_ID);
      expect(result.schedule_id).toBe(SCHEDULE_ID);
      expect(result.substitute_staff_id).toBe(SUBSTITUTE_STAFF_ID);
      expect(result.status).toBe('assigned');
    });

    it('should throw NotFoundException when absence does not exist', async () => {
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue(null);

      await expect(
        service.assignSubstitute(TENANT_ID, USER_ID, {
          absence_id: 'nonexistent',
          schedule_id: SCHEDULE_ID,
          substitute_staff_id: SUBSTITUTE_STAFF_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when substitute staff does not exist', async () => {
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue({ id: ABSENCE_ID });
      mockPrisma.schedule.findFirst.mockResolvedValue({ id: SCHEDULE_ID });
      mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.assignSubstitute(TENANT_ID, USER_ID, {
          absence_id: ABSENCE_ID,
          schedule_id: SCHEDULE_ID,
          substitute_staff_id: 'nonexistent',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getTodayBoard ────────────────────────────────────────────────────────

  describe('getTodayBoard', () => {
    it('should return today and upcoming absences split correctly', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      mockPrisma.teacherAbsence.findMany.mockResolvedValue([
        {
          id: 'abs-today',
          absence_date: today,
          full_day: true,
          reason: null,
          staff_profile: { user: { first_name: 'Alice', last_name: 'Brown' } },
          substitution_records: [],
        },
        {
          id: 'abs-tomorrow',
          absence_date: tomorrow,
          full_day: true,
          reason: null,
          staff_profile: { user: { first_name: 'Bob', last_name: 'Smith' } },
          substitution_records: [],
        },
      ]);

      const result = await service.getTodayBoard(TENANT_ID);

      expect(result.today).toHaveLength(1);
      expect(result.today[0]!.id).toBe('abs-today');
      expect(result.upcoming).toHaveLength(1);
      expect(result.upcoming[0]!.id).toBe('abs-tomorrow');
      expect(result.generated_at).toBeDefined();
    });

    it('should return empty arrays when no absences exist', async () => {
      mockPrisma.teacherAbsence.findMany.mockResolvedValue([]);

      const result = await service.getTodayBoard(TENANT_ID);

      expect(result.today).toHaveLength(0);
      expect(result.upcoming).toHaveLength(0);
    });
  });

  // ─── getAbsences ─────────────────────────────────────────────────────────

  describe('getAbsences', () => {
    it('should return paginated absences with staff name and substitutions', async () => {
      mockPrisma.teacherAbsence.findMany.mockResolvedValue([
        {
          id: ABSENCE_ID,
          staff_profile_id: STAFF_ID,
          staff_profile: { user: { first_name: 'Alice', last_name: 'Brown' } },
          absence_date: new Date('2026-03-20'),
          full_day: true,
          period_from: null,
          period_to: null,
          reason: 'Sick',
          reported_at: new Date('2026-03-19T08:00:00Z'),
          substitution_records: [
            {
              id: 'sr-1',
              status: 'assigned',
              substitute_staff_id: 'staff-2',
              substitute: { user: { first_name: 'Bob', last_name: 'Smith' } },
            },
          ],
        },
      ]);
      mockPrisma.teacherAbsence.count.mockResolvedValue(1);

      const result = await service.getAbsences(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.staff_name).toBe('Alice Brown');
      expect(result.data[0]!.absence_date).toBe('2026-03-20');
      expect(result.data[0]!.substitution_count).toBe(1);
      expect(result.data[0]!.substitutions[0]!.substitute_name).toBe('Bob Smith');
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should filter by staff_id', async () => {
      mockPrisma.teacherAbsence.findMany.mockResolvedValue([]);
      mockPrisma.teacherAbsence.count.mockResolvedValue(0);

      await service.getAbsences(TENANT_ID, { page: 1, pageSize: 20, staff_id: STAFF_ID });

      expect(mockPrisma.teacherAbsence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ staff_profile_id: STAFF_ID }),
        }),
      );
    });

    it('should filter by date_from only', async () => {
      mockPrisma.teacherAbsence.findMany.mockResolvedValue([]);
      mockPrisma.teacherAbsence.count.mockResolvedValue(0);

      await service.getAbsences(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_from: '2026-03-01',
      });

      expect(mockPrisma.teacherAbsence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            absence_date: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('should filter by date_to only', async () => {
      mockPrisma.teacherAbsence.findMany.mockResolvedValue([]);
      mockPrisma.teacherAbsence.count.mockResolvedValue(0);

      await service.getAbsences(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_to: '2026-03-31',
      });

      expect(mockPrisma.teacherAbsence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            absence_date: expect.objectContaining({ lte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('should filter by both date_from and date_to', async () => {
      mockPrisma.teacherAbsence.findMany.mockResolvedValue([]);
      mockPrisma.teacherAbsence.count.mockResolvedValue(0);

      await service.getAbsences(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_from: '2026-03-01',
        date_to: '2026-03-31',
      });

      expect(mockPrisma.teacherAbsence.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            absence_date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });
  });

  // ─── getSubstitutionRecords ──────────────────────────────────────────────

  describe('getSubstitutionRecords', () => {
    it('should return paginated substitution records', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        {
          id: 'sr-1',
          absence_id: ABSENCE_ID,
          schedule_id: SCHEDULE_ID,
          substitute_staff_id: 'staff-2',
          status: 'assigned',
          assigned_at: new Date('2026-03-20T08:00:00Z'),
          confirmed_at: null,
          notes: null,
          absence: {
            absence_date: new Date('2026-03-20'),
            staff_profile: { user: { first_name: 'Alice', last_name: 'Brown' } },
          },
          substitute: { user: { first_name: 'Bob', last_name: 'Smith' } },
        },
      ]);
      mockPrisma.substitutionRecord.count.mockResolvedValue(1);

      const result = await service.getSubstitutionRecords(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.substitute_name).toBe('Bob Smith');
      expect(result.data[0]!.absent_staff_name).toBe('Alice Brown');
      expect(result.data[0]!.absence_date).toBe('2026-03-20');
      expect(result.data[0]!.confirmed_at).toBeNull();
    });

    it('should filter by staff_id', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);
      mockPrisma.substitutionRecord.count.mockResolvedValue(0);

      await service.getSubstitutionRecords(TENANT_ID, {
        page: 1,
        pageSize: 20,
        staff_id: 'staff-2',
      });

      expect(mockPrisma.substitutionRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ substitute_staff_id: 'staff-2' }),
        }),
      );
    });

    it('should filter by status', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);
      mockPrisma.substitutionRecord.count.mockResolvedValue(0);

      await service.getSubstitutionRecords(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'assigned',
      });

      expect(mockPrisma.substitutionRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'assigned' }),
        }),
      );
    });

    it('should filter by date range', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);
      mockPrisma.substitutionRecord.count.mockResolvedValue(0);

      await service.getSubstitutionRecords(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_from: '2026-03-01',
        date_to: '2026-03-31',
      });

      expect(mockPrisma.substitutionRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should format confirmed_at when present', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        {
          id: 'sr-1',
          absence_id: ABSENCE_ID,
          schedule_id: SCHEDULE_ID,
          substitute_staff_id: 'staff-2',
          status: 'confirmed',
          assigned_at: new Date('2026-03-20T08:00:00Z'),
          confirmed_at: new Date('2026-03-20T09:00:00Z'),
          notes: 'Confirmed via phone',
          absence: {
            absence_date: new Date('2026-03-20'),
            staff_profile: { user: { first_name: 'A', last_name: 'B' } },
          },
          substitute: { user: { first_name: 'C', last_name: 'D' } },
        },
      ]);
      mockPrisma.substitutionRecord.count.mockResolvedValue(1);

      const result = await service.getSubstitutionRecords(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data[0]!.confirmed_at).toBe('2026-03-20T09:00:00.000Z');
      expect(result.data[0]!.notes).toBe('Confirmed via phone');
    });
  });

  // ─── validateAbsenceExists ───────────────────────────────────────────────

  describe('validateAbsenceExists', () => {
    it('should resolve when absence exists', async () => {
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue({ id: ABSENCE_ID });

      await expect(service.validateAbsenceExists(TENANT_ID, ABSENCE_ID)).resolves.toBeUndefined();
    });

    it('should throw NotFoundException when absence does not exist', async () => {
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue(null);

      await expect(service.validateAbsenceExists(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── deleteAbsence ───────────────────────────────────────────────────────

  describe('deleteAbsence', () => {
    it('should delete an absence without substitution records', async () => {
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue({ id: ABSENCE_ID });
      mockPrisma.substitutionRecord.findFirst.mockResolvedValue(null);

      const result = await service.deleteAbsence(TENANT_ID, ABSENCE_ID);

      expect(result.deleted).toBe(true);
      expect(mockTx.teacherAbsence.delete).toHaveBeenCalledWith({ where: { id: ABSENCE_ID } });
    });

    it('should throw BadRequestException when absence has substitution records', async () => {
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue({ id: ABSENCE_ID });
      mockPrisma.substitutionRecord.findFirst.mockResolvedValue({ id: 'sr-1' });

      await expect(service.deleteAbsence(TENANT_ID, ABSENCE_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when absence does not exist', async () => {
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue(null);

      await expect(service.deleteAbsence(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── findEligibleSubstitutes — edge cases ────────────────────────────────

  describe('findEligibleSubstitutes — edge cases', () => {
    const mockSchedule = {
      id: SCHEDULE_ID,
      teacher_staff_id: STAFF_ID,
      weekday: 1,
      start_time: new Date('1970-01-01T09:00:00Z'),
      end_time: new Date('1970-01-01T10:00:00Z'),
      academic_year_id: 'ay-1',
      class_entity: { year_group_id: 'yg-1', subject_id: null, academic_year_id: 'ay-1' },
    };

    it('edge: should treat all teachers as competent when no subject_id', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(mockSchedule);
      (schedFacade.findBusyTeacherIds as jest.Mock).mockResolvedValue(new Set());
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-2', user: { first_name: 'Jane', last_name: 'Smith' } },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);

      const result = await service.findEligibleSubstitutes(TENANT_ID, SCHEDULE_ID, '2026-03-20');

      expect(result.data[0]!.is_competent).toBe(true);
    });

    it('edge: should assign primary competency correctly when both primary and non-primary exist', async () => {
      const schedWithSubject = {
        ...mockSchedule,
        class_entity: { year_group_id: 'yg-1', subject_id: 'sub-1', academic_year_id: 'ay-1' },
      };
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(
        schedWithSubject,
      );
      (schedFacade.findBusyTeacherIds as jest.Mock).mockResolvedValue(new Set());
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-2', user: { first_name: 'Jane', last_name: 'Smith' } },
      ]);
      // Two competency records for same teacher: non-primary then primary
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        { staff_profile_id: 'staff-2', is_primary: false },
        { staff_profile_id: 'staff-2', is_primary: true },
      ]);
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);

      const result = await service.findEligibleSubstitutes(TENANT_ID, SCHEDULE_ID, '2026-03-20');

      expect(result.data[0]!.is_primary).toBe(true);
    });

    it('edge: should use schedule academic_year_id when class_entity has none', async () => {
      const schedNoClassYear = {
        ...mockSchedule,
        class_entity: { year_group_id: 'yg-1', subject_id: 'sub-1', academic_year_id: undefined },
      };
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue(
        schedNoClassYear,
      );
      (schedFacade.findBusyTeacherIds as jest.Mock).mockResolvedValue(new Set());
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-2', user: { first_name: 'Jane', last_name: 'Smith' } },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);

      const result = await service.findEligibleSubstitutes(TENANT_ID, SCHEDULE_ID, '2026-03-20');

      expect(result.data).toHaveLength(1);
    });
  });
});
