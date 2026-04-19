import { Test, TestingModule } from '@nestjs/testing';

import {
  ClassesReadFacade,
  GradebookReadFacade,
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
    findClassIdsWithSchedulingRequirements: jest.fn().mockResolvedValue([]),
    findCurriculumForCoverageCheck: jest.fn().mockResolvedValue([]),
    findCompetencyPinsAndPool: jest.fn().mockResolvedValue([]),
    findCapacityByYearGroup: jest.fn().mockResolvedValue([]),
  };

  const mockClassesReadFacade = {
    countByAcademicYear: jest.fn().mockResolvedValue(0),
    findClassesWithoutTeachers: jest.fn().mockResolvedValue([]),
    findActiveAcademicClassesWithYearGroup: jest.fn().mockResolvedValue([]),
  };

  const mockSchedulesReadFacade = {
    findPinnedEntries: jest.fn().mockResolvedValue([]),
  };

  const mockStaffAvailabilityReadFacade = {
    findByStaffIds: jest.fn().mockResolvedValue([]),
  };

  const mockGradebookReadFacade = {
    findClassSubjectConfigs: jest.fn().mockResolvedValue([]),
  };

  const mockPrisma = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesReadFacade },
        { provide: GradebookReadFacade, useValue: mockGradebookReadFacade },
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
    mockSchedulingReadFacade.findClassIdsWithSchedulingRequirements.mockResolvedValue([]);
    // Default: one class whose year_group has curriculum → all_classes_configured
    // passes by default so tests focused on other checks don't need to set it up.
    mockSchedulingReadFacade.findCurriculumForCoverageCheck.mockResolvedValue([
      { subject_id: 'sub-default', year_group_id: 'yg-default', subject_name: 'Default' },
    ]);
    mockSchedulingReadFacade.findCompetencyPinsAndPool.mockResolvedValue([
      { subject_id: 'sub-default', year_group_id: 'yg-default', class_id: null },
    ]);
    mockClassesReadFacade.countByAcademicYear.mockResolvedValue(0);
    mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);
    mockClassesReadFacade.findActiveAcademicClassesWithYearGroup.mockResolvedValue([
      { id: 'cls-default', name: 'Default Class', year_group_id: 'yg-default' },
    ]);
    mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([]);
    mockStaffAvailabilityReadFacade.findByStaffIds.mockResolvedValue([]);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── All prerequisites pass ──────────────────────────────────────────────

  describe('check (all pass)', () => {
    it('should return ready:true when all prerequisites are satisfied', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.findActiveAcademicClassesWithYearGroup.mockResolvedValue([
        { id: 'cls-1', name: '1A', year_group_id: 'yg-1' },
        { id: 'cls-2', name: '1B', year_group_id: 'yg-1' },
      ]);
      // Both classes' year_group has curriculum → configured via path (b).
      mockSchedulingReadFacade.findCurriculumForCoverageCheck.mockResolvedValue([
        { subject_id: 'sub-eng', year_group_id: 'yg-1', subject_name: 'English' },
      ]);
      mockSchedulingReadFacade.findCompetencyPinsAndPool.mockResolvedValue([
        { subject_id: 'sub-eng', year_group_id: 'yg-1', class_id: null },
      ]);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);
      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([]);

      const result = await service.check(TENANT_ID, AY_ID);

      expect(result.ready).toBe(true);
      expect(result.checks).toHaveLength(7);
      expect(result.checks.every((c) => c.passed)).toBe(true);
    });

    it('should pass all_classes_configured via explicit class_scheduling_requirements rows', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.findActiveAcademicClassesWithYearGroup.mockResolvedValue([
        { id: 'cls-1', name: 'Math 1A', year_group_id: 'yg-1' },
      ]);
      // No curriculum, but an explicit per-class requirement — path (a).
      mockSchedulingReadFacade.findClassIdsWithSchedulingRequirements.mockResolvedValue(['cls-1']);
      mockSchedulingReadFacade.findCurriculumForCoverageCheck.mockResolvedValue([]);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);
      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([]);

      const result = await service.check(TENANT_ID, AY_ID);

      const configCheck = result.checks.find((c) => c.key === 'all_classes_configured');
      expect(configCheck?.passed).toBe(true);
      expect(configCheck?.message).toContain('All 1 classes');
    });
  });

  // ─── Missing period grid ──────────────────────────────────────────────────

  describe('check (missing period grid)', () => {
    it('should fail when no teaching periods are configured', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(0);
      mockClassesReadFacade.findActiveAcademicClassesWithYearGroup.mockResolvedValue([
        { id: 'cls-1', name: '1A', year_group_id: 'yg-1' },
      ]);
      mockSchedulingReadFacade.findCurriculumForCoverageCheck.mockResolvedValue([
        { subject_id: 'sub-eng', year_group_id: 'yg-1', subject_name: 'English' },
      ]);
      mockSchedulingReadFacade.findCompetencyPinsAndPool.mockResolvedValue([
        { subject_id: 'sub-eng', year_group_id: 'yg-1', class_id: null },
      ]);
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
      mockClassesReadFacade.findActiveAcademicClassesWithYearGroup.mockResolvedValue([
        { id: 'cls-1', name: '1A', year_group_id: 'yg-1' },
      ]);
      mockSchedulingReadFacade.findCurriculumForCoverageCheck.mockResolvedValue([
        { subject_id: 'sub-eng', year_group_id: 'yg-1', subject_name: 'English' },
      ]);
      mockSchedulingReadFacade.findCompetencyPinsAndPool.mockResolvedValue([
        { subject_id: 'sub-eng', year_group_id: 'yg-1', class_id: null },
      ]);
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
    it('should fail when classes are missing both scheduling requirements and curriculum', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.findActiveAcademicClassesWithYearGroup.mockResolvedValue([
        { id: 'cls-1', name: '1A', year_group_id: 'yg-1' },
        { id: 'cls-2', name: '1B', year_group_id: 'yg-1' },
        { id: 'cls-3', name: '2A', year_group_id: 'yg-2' },
        { id: 'cls-4', name: '2B', year_group_id: 'yg-2' },
        { id: 'cls-5', name: '3A', year_group_id: 'yg-3' },
      ]);
      // yg-1 has curriculum → 1A and 1B configured.
      // cls-5 has an explicit requirement → 3A configured.
      // yg-2 has no curriculum, 2A/2B have no explicit requirement → unconfigured.
      mockSchedulingReadFacade.findCurriculumForCoverageCheck.mockResolvedValue([
        { subject_id: 'sub-eng', year_group_id: 'yg-1', subject_name: 'English' },
      ]);
      mockSchedulingReadFacade.findClassIdsWithSchedulingRequirements.mockResolvedValue(['cls-5']);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);
      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([]);

      const result = await service.check(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      const configCheck = result.checks.find((c) => c.key === 'all_classes_configured');
      expect(configCheck?.passed).toBe(false);
      expect(configCheck?.message).toContain('2 of 5');
      expect(configCheck?.details).toEqual({
        unconfigured: [
          { id: 'cls-3', name: '2A' },
          { id: 'cls-4', name: '2B' },
        ],
      });
    });
  });

  // ─── Per-class, per-subject teacher coverage ─────────────────────────────

  describe('check (every_class_subject_has_teacher)', () => {
    it('pool covers Year 2 English → both 2A and 2B pass', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);
      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([]);

      mockSchedulingReadFacade.findCurriculumForCoverageCheck.mockResolvedValue([
        { subject_id: 'sub-eng', year_group_id: 'yg-2', subject_name: 'English' },
      ]);
      mockClassesReadFacade.findActiveAcademicClassesWithYearGroup.mockResolvedValue([
        { id: 'cls-2a', name: '2A', year_group_id: 'yg-2' },
        { id: 'cls-2b', name: '2B', year_group_id: 'yg-2' },
      ]);
      mockSchedulingReadFacade.findCompetencyPinsAndPool.mockResolvedValue([
        { subject_id: 'sub-eng', year_group_id: 'yg-2', class_id: null },
      ]);

      const result = await service.check(TENANT_ID, AY_ID);

      const coverageCheck = result.checks.find((c) => c.key === 'every_class_subject_has_teacher');
      expect(coverageCheck?.passed).toBe(true);
      expect(coverageCheck?.message).toContain('at least one pinned or pool teacher');
    });

    it('class-level competency on 2A but neither pin nor pool on 2B → fails with 2B in details', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);
      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([]);

      mockSchedulingReadFacade.findCurriculumForCoverageCheck.mockResolvedValue([
        { subject_id: 'sub-eng', year_group_id: 'yg-2', subject_name: 'English' },
      ]);
      mockClassesReadFacade.findActiveAcademicClassesWithYearGroup.mockResolvedValue([
        { id: 'cls-2a', name: '2A', year_group_id: 'yg-2' },
        { id: 'cls-2b', name: '2B', year_group_id: 'yg-2' },
      ]);
      // Only 2A has a pin; no pool entry exists — 2B is uncovered.
      mockSchedulingReadFacade.findCompetencyPinsAndPool.mockResolvedValue([
        { subject_id: 'sub-eng', year_group_id: 'yg-2', class_id: 'cls-2a' },
      ]);

      const result = await service.check(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      const coverageCheck = result.checks.find((c) => c.key === 'every_class_subject_has_teacher');
      expect(coverageCheck?.passed).toBe(false);
      expect(coverageCheck?.message).toContain('1 class/subject');
      expect(coverageCheck?.details).toEqual({
        uncovered: [
          {
            class_id: 'cls-2b',
            class_name: '2B',
            subject_id: 'sub-eng',
            subject_name: 'English',
          },
        ],
      });
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
    it('should always return 7 checks', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);
      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([]);

      const result = await service.check(TENANT_ID, AY_ID);

      expect(result.checks).toHaveLength(7);
      const keys = result.checks.map((c) => c.key);
      expect(keys).toContain('period_grid_exists');
      expect(keys).toContain('all_classes_configured');
      expect(keys).toContain('all_classes_have_teachers');
      expect(keys).toContain('every_class_subject_has_teacher');
      expect(keys).toContain('no_pinned_conflicts');
      expect(keys).toContain('no_pinned_availability_violations');
      expect(keys).toContain('curriculum_fits_grid');
    });
  });

  // ─── curriculum_fits_grid — tiered capacity check ──────────────────────────

  describe('check (curriculum_fits_grid)', () => {
    function baselineMocks() {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.findActiveAcademicClassesWithYearGroup.mockResolvedValue([
        { id: 'c1', name: '1A', year_group_id: 'yg-1' },
      ]);
      mockSchedulingReadFacade.findClassIdsWithSchedulingRequirements.mockResolvedValue(['c1']);
      mockSchedulingReadFacade.findCurriculumForCoverageCheck.mockResolvedValue([]);
      mockSchedulingReadFacade.findCompetencyPinsAndPool.mockResolvedValue([]);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);
      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([]);
    }

    it('passes with matched allocation and no under/over capacity details', async () => {
      baselineMocks();
      mockSchedulingReadFacade.findCapacityByYearGroup.mockResolvedValue([
        {
          year_group_id: 'yg-1',
          year_group_name: 'Year 1',
          grid_teaching_slots: 25,
          allocated_min_periods: 25,
        },
      ]);

      const result = await service.check(TENANT_ID, AY_ID);
      const cap = result.checks.find((c) => c.key === 'curriculum_fits_grid')!;
      expect(cap.passed).toBe(true);
      expect(cap.details).toBeUndefined();
    });

    it('passes but surfaces under_capacity details when allocated < grid', async () => {
      baselineMocks();
      mockSchedulingReadFacade.findCapacityByYearGroup.mockResolvedValue([
        {
          year_group_id: 'yg-1',
          year_group_name: 'Year 6',
          grid_teaching_slots: 29,
          allocated_min_periods: 22,
        },
      ]);

      const result = await service.check(TENANT_ID, AY_ID);
      const cap = result.checks.find((c) => c.key === 'curriculum_fits_grid')!;
      expect(cap.passed).toBe(true);
      expect((cap.details as Record<string, unknown>)?.under_capacity).toEqual([
        { year_group_id: 'yg-1', year_group_name: 'Year 6', allocated: 22, grid: 29 },
      ]);
    });

    it('fails with over_capacity details when allocated > grid', async () => {
      baselineMocks();
      mockSchedulingReadFacade.findCapacityByYearGroup.mockResolvedValue([
        {
          year_group_id: 'yg-1',
          year_group_name: 'Year 1',
          grid_teaching_slots: 20,
          allocated_min_periods: 24,
        },
      ]);

      const result = await service.check(TENANT_ID, AY_ID);
      const cap = result.checks.find((c) => c.key === 'curriculum_fits_grid')!;
      expect(cap.passed).toBe(false);
      expect((cap.details as Record<string, unknown>)?.over_capacity).toEqual([
        { year_group_id: 'yg-1', year_group_name: 'Year 1', allocated: 24, grid: 20 },
      ]);
      // Over-capacity → ready === false (hard block).
      expect(result.ready).toBe(false);
    });

    it('ignores year groups with zero allocated periods (not yet configured)', async () => {
      baselineMocks();
      mockSchedulingReadFacade.findCapacityByYearGroup.mockResolvedValue([
        {
          year_group_id: 'yg-1',
          year_group_name: 'Year 1',
          grid_teaching_slots: 25,
          allocated_min_periods: 0,
        },
      ]);

      const result = await service.check(TENANT_ID, AY_ID);
      const cap = result.checks.find((c) => c.key === 'curriculum_fits_grid')!;
      expect(cap.passed).toBe(true);
      expect(cap.details).toBeUndefined();
    });
  });

  // ─── all_classes_configured — zero active classes ────────────────────────

  describe('check (zero active classes)', () => {
    it('should fail all_classes_configured when there are zero active classes', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.findActiveAcademicClassesWithYearGroup.mockResolvedValue([]);
      mockSchedulingReadFacade.findCurriculumForCoverageCheck.mockResolvedValue([]);
      mockSchedulingReadFacade.findCompetencyPinsAndPool.mockResolvedValue([]);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);
      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([]);

      const result = await service.check(TENANT_ID, AY_ID);

      const configCheck = result.checks.find((c) => c.key === 'all_classes_configured');
      expect(configCheck?.passed).toBe(false);
      expect(configCheck?.message).toContain('No active academic classes');
    });
  });

  // ─── Pinned entries — same day non-overlapping times ─────────────────────

  describe('check (pinned entries — non-overlapping same day)', () => {
    it('should pass when same-day entries do not overlap in time', async () => {
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
          start_time: new Date('1970-01-01T08:00:00Z'),
          end_time: new Date('1970-01-01T08:45:00Z'),
        },
        {
          id: 'sched-2',
          teacher_staff_id: 'staff-1',
          room_id: 'room-1',
          weekday: 1,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T09:45:00Z'),
        },
      ]);

      const result = await service.check(TENANT_ID, AY_ID);

      const conflictCheck = result.checks.find((c) => c.key === 'no_pinned_conflicts');
      expect(conflictCheck?.passed).toBe(true);
    });
  });

  // ─── Pinned entries — null teacher and room IDs ─────────────────────────

  describe('check (pinned entries — null teacher/room)', () => {
    it('should not flag conflicts for entries with null teacher_staff_id and room_id', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);

      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([
        {
          id: 'sched-1',
          teacher_staff_id: null,
          room_id: null,
          weekday: 1,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T09:45:00Z'),
        },
        {
          id: 'sched-2',
          teacher_staff_id: null,
          room_id: null,
          weekday: 1,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T09:45:00Z'),
        },
      ]);

      const result = await service.check(TENANT_ID, AY_ID);

      const conflictCheck = result.checks.find((c) => c.key === 'no_pinned_conflicts');
      expect(conflictCheck?.passed).toBe(true);
    });
  });

  // ─── Availability — teacher has constraints but none for entry's day ──────

  describe('check (availability — no constraint for day)', () => {
    it('should flag violation when teacher has constraints but not for the entry weekday', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);

      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([
        {
          id: 'sched-1',
          teacher_staff_id: 'staff-1',
          room_id: null,
          weekday: 3,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T09:45:00Z'),
        },
      ]);

      // Teacher has availability on weekday 1 only — not weekday 3
      mockStaffAvailabilityReadFacade.findByStaffIds.mockResolvedValue([
        {
          staff_profile_id: 'staff-1',
          weekday: 1,
          available_from: new Date('1970-01-01T08:00:00Z'),
          available_to: new Date('1970-01-01T14:00:00Z'),
        },
      ]);

      const result = await service.check(TENANT_ID, AY_ID);

      const availCheck = result.checks.find((c) => c.key === 'no_pinned_availability_violations');
      expect(availCheck?.passed).toBe(false);
      expect(availCheck?.message).toContain('violate teacher availability');
    });
  });

  // ─── Availability — pinned entry without teacher ─────────────────────────

  describe('check (availability — null teacher on pinned entry)', () => {
    it('should not check availability for pinned entries without a teacher', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);

      mockSchedulesReadFacade.findPinnedEntries.mockResolvedValue([
        {
          id: 'sched-1',
          teacher_staff_id: null,
          room_id: 'room-1',
          weekday: 1,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T09:45:00Z'),
        },
      ]);

      const result = await service.check(TENANT_ID, AY_ID);

      const availCheck = result.checks.find((c) => c.key === 'no_pinned_availability_violations');
      expect(availCheck?.passed).toBe(true);
      // findByStaffIds should NOT be called since no teacher IDs
      expect(mockStaffAvailabilityReadFacade.findByStaffIds).not.toHaveBeenCalled();
    });
  });

  // ─── Availability — teacher has no constraints (fully available) ──────────

  describe('check (availability — no constraints)', () => {
    it('should pass when teacher has no availability records (fully available)', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);

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

      // No availability records → fully available
      mockStaffAvailabilityReadFacade.findByStaffIds.mockResolvedValue([]);

      const result = await service.check(TENANT_ID, AY_ID);

      const availCheck = result.checks.find((c) => c.key === 'no_pinned_availability_violations');
      expect(availCheck?.passed).toBe(true);
    });
  });

  // ─── Availability — within window ───────────────────────────────────────

  describe('check (availability — within window)', () => {
    it('should pass when pinned entry is within teacher availability window', async () => {
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(10);
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockClassesReadFacade.findClassesWithoutTeachers.mockResolvedValue([]);

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

      mockStaffAvailabilityReadFacade.findByStaffIds.mockResolvedValue([
        {
          staff_profile_id: 'staff-1',
          weekday: 1,
          available_from: new Date('1970-01-01T08:00:00Z'),
          available_to: new Date('1970-01-01T14:00:00Z'),
        },
      ]);

      const result = await service.check(TENANT_ID, AY_ID);

      const availCheck = result.checks.find((c) => c.key === 'no_pinned_availability_violations');
      expect(availCheck?.passed).toBe(true);
    });
  });
});
