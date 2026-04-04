import { Test, TestingModule } from '@nestjs/testing';

import {
  ClassesReadFacade,
  MOCK_FACADE_PROVIDERS,
  SchedulesReadFacade,
  SchedulingReadFacade,
  StaffAvailabilityReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { SchedulingPrerequisitesService } from './scheduling-prerequisites.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AY_ID = 'ay-uuid-0001';

describe('SchedulingPrerequisitesService', () => {
  let service: SchedulingPrerequisitesService;

  const mockSchedulingReadFacade = {
    countTeachingPeriods: jest.fn().mockResolvedValue(0),
    countClassRequirements: jest.fn().mockResolvedValue(0),
  };

  const mockClassesReadFacade = {
    countByAcademicYear: jest.fn().mockResolvedValue(0),
    findClassesWithoutTeachers: jest.fn().mockResolvedValue([]),
  };

  const mockSchedulesReadFacade = {
    findPinnedEntries: jest.fn().mockResolvedValue([]),
  };

  const mockStaffAvailabilityReadFacade = {
    findByStaffIds: jest.fn().mockResolvedValue([]),
  };

  const mockPrisma = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesReadFacade },
        { provide: SchedulesReadFacade, useValue: mockSchedulesReadFacade },
        { provide: SchedulingReadFacade, useValue: mockSchedulingReadFacade },
        { provide: StaffAvailabilityReadFacade, useValue: mockStaffAvailabilityReadFacade },
        SchedulingPrerequisitesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SchedulingPrerequisitesService>(SchedulingPrerequisitesService);

    jest.clearAllMocks();
    mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(0);
    mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(0);
    mockClassesReadFacade.countByAcademicYear.mockResolvedValue(0);
    mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);
    mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([]);
    mockStaffAvailabilityReadFacade.findByStaffIds.mockResolvedValue([]);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── All prerequisites pass ──────────────────────────────────────────────

  describe('check (all pass)', () => {
    it('should return ready:true when all prerequisites are satisfied', async () => {
      // Period grid exists
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      // All classes have requirements
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      // All classes have teachers
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);
      // No pinned entries (so no conflicts)
      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([]);

      const result = await service.check(TENANT_ID, AY_ID);

      expect(result.ready).toBe(true);
      expect(result.checks).toHaveLength(5);
      expect(result.checks.every((c) => c.passed)).toBe(true);
    });
  });

  // ─── Missing period grid ──────────────────────────────────────────────────

  describe('check (missing period grid)', () => {
    it('should fail when no teaching periods are configured', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(0);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);
      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([]);

      const result = await service.check(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      const gridCheck = result.checks.find((c) => c.key === 'period_grid_exists');
      expect(gridCheck?.passed).toBe(false);
      expect(gridCheck?.message).toContain('No teaching periods');
    });
  });

  // ─── Missing teachers ──────────────────────────────────────────────────────

  describe('check (missing teachers)', () => {
    it('should fail when classes have no assigned teachers', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      // 2 classes without teachers
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([
        { id: 'cls-1', name: 'Math 1A' },
        { id: 'cls-2', name: 'Science 2B' },
      ]);
      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([]);

      const result = await service.check(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      const teacherCheck = result.checks.find((c) => c.key === 'all_classes_have_teachers');
      expect(teacherCheck?.passed).toBe(false);
      expect(teacherCheck?.message).toContain('2 classes have no teacher');
    });
  });

  // ─── Unconfigured classes ──────────────────────────────────────────────────

  describe('check (unconfigured classes)', () => {
    it('should fail when classes are missing scheduling requirements', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(3);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);
      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([]);

      const result = await service.check(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      const configCheck = result.checks.find((c) => c.key === 'all_classes_configured');
      expect(configCheck?.passed).toBe(false);
      expect(configCheck?.message).toContain('2 of 5');
    });
  });

  // ─── Pinned conflicts ──────────────────────────────────────────────────────

  describe('check (pinned conflicts)', () => {
    it('should fail when pinned entries have teacher double-booking', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);

      // Two pinned entries for the same teacher on the same day with overlapping times
      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([
        {
          id: 'sched-1',
          teacher_staff_id: 'staff-1',
          room_id: 'room-1',
          weekday: 1,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T09:45:00Z'),
        },
        {
          id: 'sched-2',
          teacher_staff_id: 'staff-1',
          room_id: 'room-2',
          weekday: 1,
          start_time: new Date('1970-01-01T09:30:00Z'),
          end_time: new Date('1970-01-01T10:15:00Z'),
        },
      ]);

      const result = await service.check(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      const conflictCheck = result.checks.find((c) => c.key === 'no_pinned_conflicts');
      expect(conflictCheck?.passed).toBe(false);
      expect(conflictCheck?.message).toContain('conflict');
    });

    it('should fail when pinned entries have room double-booking', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);

      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([
        {
          id: 'sched-1',
          teacher_staff_id: 'staff-1',
          room_id: 'room-1',
          weekday: 2,
          start_time: new Date('1970-01-01T10:00:00Z'),
          end_time: new Date('1970-01-01T10:45:00Z'),
        },
        {
          id: 'sched-2',
          teacher_staff_id: 'staff-2',
          room_id: 'room-1',
          weekday: 2,
          start_time: new Date('1970-01-01T10:00:00Z'),
          end_time: new Date('1970-01-01T10:45:00Z'),
        },
      ]);

      const result = await service.check(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      const conflictCheck = result.checks.find((c) => c.key === 'no_pinned_conflicts');
      expect(conflictCheck?.passed).toBe(false);
    });

    it('should pass when pinned entries have no conflicts (different days)', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);

      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([
        {
          id: 'sched-1',
          teacher_staff_id: 'staff-1',
          room_id: 'room-1',
          weekday: 1,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T09:45:00Z'),
        },
        {
          id: 'sched-2',
          teacher_staff_id: 'staff-1',
          room_id: 'room-1',
          weekday: 2,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T09:45:00Z'),
        },
      ]);

      const result = await service.check(TENANT_ID, AY_ID);

      const conflictCheck = result.checks.find((c) => c.key === 'no_pinned_conflicts');
      expect(conflictCheck?.passed).toBe(true);
    });
  });

  // ─── Pinned availability violations ────────────────────────────────────────

  describe('check (pinned availability violations)', () => {
    it('should fail when a pinned entry falls outside teacher availability', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);

      // Pinned entry for staff-1 on weekday 1, 09:00-09:45
      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([
        {
          id: 'sched-1',
          teacher_staff_id: 'staff-1',
          room_id: null,
          weekday: 1,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T09:45:00Z'),
        },
      ]);

      // Staff-1 availability is only from 10:00-14:00 on weekday 1
      mockStaffAvailabilityReadFacade.findByStaffIds.mockResolvedValue([
        {
          staff_profile_id: 'staff-1',
          weekday: 1,
          available_from: new Date('1970-01-01T10:00:00Z'),
          available_to: new Date('1970-01-01T14:00:00Z'),
        },
      ]);

      const result = await service.check(TENANT_ID, AY_ID);

      const availCheck = result.checks.find((c) => c.key === 'no_pinned_availability_violations');
      expect(availCheck?.passed).toBe(false);
      expect(availCheck?.message).toContain('violate teacher availability');
    });
  });

  // ─── Result structure ─────────────────────────────────────────────────────

  describe('check (result structure)', () => {
    it('should always return 5 checks', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);
      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([]);

      const result = await service.check(TENANT_ID, AY_ID);

      expect(result.checks).toHaveLength(5);
      const keys = result.checks.map((c) => c.key);
      expect(keys).toContain('period_grid_exists');
      expect(keys).toContain('all_classes_configured');
      expect(keys).toContain('all_classes_have_teachers');
      expect(keys).toContain('no_pinned_conflicts');
      expect(keys).toContain('no_pinned_availability_violations');
    });
  });
});
