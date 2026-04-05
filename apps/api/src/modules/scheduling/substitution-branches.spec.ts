/**
 * Additional branch coverage for SubstitutionService.
 * Targets: reportAbsence optional fields, findEligibleSubstitutes competency map,
 * getSubstitutionRecords date_from-only / date_to-only, getTodayBoard substitution formatting,
 * assignSubstitute schedule-not-found path.
 */
import { NotFoundException } from '@nestjs/common';
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

const mockTx = {
  teacherAbsence: { create: jest.fn(), delete: jest.fn() },
  substitutionRecord: { create: jest.fn() },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('SubstitutionService — branch coverage', () => {
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
      staffProfile: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      teacherAbsence: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        delete: jest.fn(),
      },
      schedule: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      teacherCompetency: { findMany: jest.fn().mockResolvedValue([]) },
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

  // ─── reportAbsence — optional fields ─────────────────────────────────────

  describe('SubstitutionService — reportAbsence optional fields', () => {
    it('should pass period_from and period_to when provided', async () => {
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue(null);

      const result = await service.reportAbsence(TENANT_ID, USER_ID, {
        staff_id: STAFF_ID,
        date: '2026-03-20',
        full_day: false,
        period_from: 2,
        period_to: 4,
        reason: 'Doctor appointment',
      });

      expect(result.full_day).toBe(false);
      expect(mockTx.teacherAbsence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            full_day: false,
            period_from: 2,
            period_to: 4,
            reason: 'Doctor appointment',
          }),
        }),
      );
    });

    it('edge: should default full_day to true and nullify optional fields when omitted', async () => {
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue(null);

      await service.reportAbsence(TENANT_ID, USER_ID, {
        staff_id: STAFF_ID,
        date: '2026-03-20',
      } as { staff_id: string; date: string; full_day: boolean });

      expect(mockTx.teacherAbsence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            full_day: true,
            period_from: null,
            period_to: null,
            reason: null,
          }),
        }),
      );
    });
  });

  // ─── findEligibleSubstitutes — no class_entity ────────────────────────────

  describe('SubstitutionService — findEligibleSubstitutes null class_entity', () => {
    it('edge: should handle schedule with null class_entity', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue({
        id: SCHEDULE_ID,
        teacher_staff_id: STAFF_ID,
        weekday: 1,
        start_time: new Date('1970-01-01T09:00:00Z'),
        end_time: new Date('1970-01-01T10:00:00Z'),
        academic_year_id: 'ay-1',
        class_entity: null,
      });
      (schedFacade.findBusyTeacherIds as jest.Mock).mockResolvedValue(new Set());
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-2', user: { first_name: 'Jane', last_name: 'Smith' } },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);

      const result = await service.findEligibleSubstitutes(TENANT_ID, SCHEDULE_ID, '2026-03-20');

      // No subject => all teachers competent, no competency query needed
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.is_competent).toBe(true);
    });
  });

  // ─── assignSubstitute — schedule not found ────────────────────────────────

  describe('SubstitutionService — assignSubstitute schedule not found', () => {
    it('should throw NotFoundException when schedule does not exist', async () => {
      mockPrisma.teacherAbsence.findFirst.mockResolvedValue({ id: ABSENCE_ID });
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.existsById as jest.Mock).mockResolvedValue(false);

      await expect(
        service.assignSubstitute(TENANT_ID, USER_ID, {
          absence_id: ABSENCE_ID,
          schedule_id: 'nonexistent-schedule',
          substitute_staff_id: 'staff-2',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getSubstitutionRecords — date_from only ──────────────────────────────

  describe('SubstitutionService — getSubstitutionRecords date_from only', () => {
    it('should filter by date_from without date_to', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);
      mockPrisma.substitutionRecord.count.mockResolvedValue(0);

      await service.getSubstitutionRecords(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_from: '2026-03-01',
      });

      expect(mockPrisma.substitutionRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('should filter by date_to without date_from', async () => {
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);
      mockPrisma.substitutionRecord.count.mockResolvedValue(0);

      await service.getSubstitutionRecords(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_to: '2026-03-31',
      });

      expect(mockPrisma.substitutionRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({ lte: expect.any(Date) }),
          }),
        }),
      );
    });
  });

  // ─── getTodayBoard — substitution records with schedule details ────────────

  describe('SubstitutionService — getTodayBoard with substitution details', () => {
    it('should format substitution records with room and class details', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockPrisma.teacherAbsence.findMany.mockResolvedValue([
        {
          id: 'abs-1',
          absence_date: today,
          full_day: true,
          reason: 'Sick',
          staff_profile: { user: { first_name: 'Alice', last_name: 'Brown' } },
          substitution_records: [
            {
              id: 'sr-1',
              status: 'assigned',
              substitute: { user: { first_name: 'Bob', last_name: 'Smith' } },
              schedule: {
                period_order: 3,
                start_time: new Date('1970-01-01T09:00:00Z'),
                end_time: new Date('1970-01-01T10:00:00Z'),
                room: { name: 'Room 101' },
                class_entity: { name: 'Math 1A', subject: { name: 'Mathematics' } },
              },
            },
          ],
        },
      ]);

      const result = await service.getTodayBoard(TENANT_ID);

      expect(result.today).toHaveLength(1);
      const sub = result.today[0]!.substitutions[0]!;
      expect(sub.substitute_name).toBe('Bob Smith');
      expect(sub.room_name).toBe('Room 101');
      expect(sub.class_name).toBe('Math 1A');
      expect(sub.subject_name).toBe('Mathematics');
      expect(sub.period_order).toBe(3);
    });

    it('edge: should handle null room and class_entity in substitution schedule', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      mockPrisma.teacherAbsence.findMany.mockResolvedValue([
        {
          id: 'abs-1',
          absence_date: today,
          full_day: true,
          reason: null,
          staff_profile: { user: { first_name: 'Alice', last_name: 'Brown' } },
          substitution_records: [
            {
              id: 'sr-1',
              status: 'assigned',
              substitute: { user: { first_name: 'Bob', last_name: 'Smith' } },
              schedule: {
                period_order: 1,
                start_time: new Date('1970-01-01T08:00:00Z'),
                end_time: new Date('1970-01-01T09:00:00Z'),
                room: null,
                class_entity: null,
              },
            },
          ],
        },
      ]);

      const result = await service.getTodayBoard(TENANT_ID);

      const sub = result.today[0]!.substitutions[0]!;
      expect(sub.room_name).toBeNull();
      expect(sub.class_name).toBeNull();
      expect(sub.subject_name).toBeNull();
    });
  });

  // ─── findEligibleSubstitutes — competency map with only non-primary ───────

  describe('SubstitutionService — findEligibleSubstitutes competency map edge', () => {
    it('edge: should not overwrite primary=true with primary=false for same teacher', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findByIdWithSubstitutionContext as jest.Mock).mockResolvedValue({
        id: SCHEDULE_ID,
        teacher_staff_id: STAFF_ID,
        weekday: 1,
        start_time: new Date('1970-01-01T09:00:00Z'),
        end_time: new Date('1970-01-01T10:00:00Z'),
        academic_year_id: 'ay-1',
        class_entity: { year_group_id: 'yg-1', subject_id: 'sub-1', academic_year_id: 'ay-1' },
      });
      (schedFacade.findBusyTeacherIds as jest.Mock).mockResolvedValue(new Set());
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-2', user: { first_name: 'Jane', last_name: 'Smith' } },
      ]);
      // Primary first, then non-primary — primary should NOT be overwritten
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        { staff_profile_id: 'staff-2', is_primary: true },
        { staff_profile_id: 'staff-2', is_primary: false },
      ]);
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);

      const result = await service.findEligibleSubstitutes(TENANT_ID, SCHEDULE_ID, '2026-03-20');

      expect(result.data[0]!.is_primary).toBe(true);
    });
  });
});
