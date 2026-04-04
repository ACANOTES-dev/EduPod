import { Test, TestingModule } from '@nestjs/testing';

import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { SchedulingReadFacade } from '../scheduling/scheduling-read.facade';
import { SchedulingRunsReadFacade } from '../scheduling-runs/scheduling-runs-read.facade';
import { StaffAvailabilityReadFacade } from '../staff-availability/staff-availability-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { SchedulingDashboardService } from './scheduling-dashboard.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AY_ID = 'ay-uuid-0001';
const NOW = new Date('2026-03-01T12:00:00Z');

describe('SchedulingDashboardService', () => {
  let service: SchedulingDashboardService;
  let mockPrisma: {
    class: { count: jest.Mock };
    classSchedulingRequirement: { count: jest.Mock; findMany: jest.Mock };
    schedule: { groupBy: jest.Mock; count: jest.Mock; findMany: jest.Mock };
    schedulingRun: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    staffAvailability: { findMany: jest.Mock };
    schedulePeriodTemplate: { count: jest.Mock };
    staffProfile: { findFirst: jest.Mock; findMany: jest.Mock };
    room: { count: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      class: { count: jest.fn().mockResolvedValue(0) },
      classSchedulingRequirement: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      schedule: {
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      schedulingRun: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      staffAvailability: { findMany: jest.fn().mockResolvedValue([]) },
      schedulePeriodTemplate: { count: jest.fn().mockResolvedValue(0) },
      staffProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      room: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: ClassesReadFacade,
          useValue: {
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
          },
        },
        {
          provide: RoomsReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue(null),
            existsOrThrow: jest.fn().mockResolvedValue(undefined),
            exists: jest.fn().mockResolvedValue(false),
            findActiveRooms: jest.fn().mockResolvedValue([]),
            findActiveRoomBasics: jest.fn().mockResolvedValue([]),
            countActiveRooms: jest.fn().mockResolvedValue(0),
            findAllClosures: jest.fn().mockResolvedValue([]),
            findClosuresPaginated: jest.fn().mockResolvedValue({ data: [], total: 0 }),
            findClosureById: jest.fn().mockResolvedValue(null),
          },
        },
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
          provide: SchedulingReadFacade,
          useValue: {
            findPeriodTemplate: jest.fn().mockResolvedValue(null),
            countTeachingPeriods: jest.fn().mockResolvedValue(0),
            findPeriodTemplates: jest.fn().mockResolvedValue([]),
            countClassRequirements: jest.fn().mockResolvedValue(0),
            findClassRequirementsWithDetails: jest.fn().mockResolvedValue([]),
            findTeacherCompetencies: jest.fn().mockResolvedValue([]),
            findTeacherConfigs: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: SchedulingRunsReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue(null),
            findStatusById: jest.fn().mockResolvedValue(null),
            findActiveRun: jest.fn().mockResolvedValue(null),
            countActiveRuns: jest.fn().mockResolvedValue(0),
            findLatestCompletedRun: jest.fn().mockResolvedValue(null),
            findLatestRunWithResult: jest.fn().mockResolvedValue(null),
            findLatestAppliedRun: jest.fn().mockResolvedValue(null),
            listRuns: jest.fn().mockResolvedValue({ data: [], total: 0 }),
            findHistoricalRuns: jest.fn().mockResolvedValue([]),
            findScenarioById: jest.fn().mockResolvedValue(null),
            findScenarioStatusById: jest.fn().mockResolvedValue(null),
            listScenarios: jest.fn().mockResolvedValue({ data: [], total: 0 }),
            findScenariosForComparison: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: StaffAvailabilityReadFacade,
          useValue: {
            findByAcademicYear: jest.fn().mockResolvedValue([]),
            findByStaffIds: jest.fn().mockResolvedValue([]),
            findByWeekday: jest.fn().mockResolvedValue([]),
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
        SchedulingDashboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SchedulingDashboardService>(SchedulingDashboardService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── overview ──────────────────────────────────────────────────────────────

  describe('overview', () => {
    it('should return summary stats with no latest run', async () => {
      mockPrisma.class.count.mockResolvedValue(10);
      mockPrisma.classSchedulingRequirement.count.mockResolvedValue(8);
      mockPrisma.schedule.groupBy.mockResolvedValue([{ class_id: 'c1' }, { class_id: 'c2' }]);
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);
      mockPrisma.schedulingRun.count.mockResolvedValue(0);
      mockPrisma.schedule.count.mockResolvedValue(3);
      mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(0);
      mockPrisma.room.count.mockResolvedValue(0);
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      const result = await service.overview(TENANT_ID, AY_ID);

      expect(result.total_classes).toBe(10);
      expect(result.configured_classes).toBe(8);
      expect(result.scheduled_classes).toBe(2);
      expect(result.pinned_entries).toBe(3);
      expect(result.active_run).toBe(false);
      expect(result.latest_run).toBeNull();
      expect(result.room_utilisation_pct).toBeNull();
      expect(result.teacher_utilisation_pct).toBeNull();
      expect(result.avg_gaps).toBeNull();
      expect(result.preference_score).toBeNull();
    });

    it('should include latest_run and preference_score when a completed run exists', async () => {
      mockPrisma.class.count.mockResolvedValue(5);
      mockPrisma.classSchedulingRequirement.count.mockResolvedValue(5);
      mockPrisma.schedule.groupBy.mockResolvedValue([]);
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'completed',
        mode: 'auto',
        entries_generated: 50,
        entries_pinned: 0,
        entries_unassigned: 2,
        hard_constraint_violations: 0,
        soft_preference_score: 85,
        soft_preference_max: 100,
        solver_duration_ms: 5000,
        created_at: NOW,
        applied_at: null,
      });
      mockPrisma.schedulingRun.count.mockResolvedValue(0);
      mockPrisma.schedule.count.mockResolvedValue(0);
      mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(25);
      mockPrisma.room.count.mockResolvedValue(5);
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      const result = await service.overview(TENANT_ID, AY_ID);

      expect(result.latest_run).not.toBeNull();
      expect(result.latest_run?.id).toBe('run-1');
      expect(result.latest_run?.soft_preference_score).toBe(85);
      expect(result.latest_run?.created_at).toBe(NOW.toISOString());
      expect(result.preference_score).toBe(85);
    });

    it('should set active_run to true when queued/running runs exist', async () => {
      mockPrisma.class.count.mockResolvedValue(5);
      mockPrisma.classSchedulingRequirement.count.mockResolvedValue(5);
      mockPrisma.schedule.groupBy.mockResolvedValue([]);
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);
      mockPrisma.schedulingRun.count.mockResolvedValue(1);
      mockPrisma.schedule.count.mockResolvedValue(0);
      mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(0);
      mockPrisma.room.count.mockResolvedValue(0);
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      const result = await service.overview(TENANT_ID, AY_ID);

      expect(result.active_run).toBe(true);
    });

    it('should compute room and teacher utilisation from schedule data', async () => {
      mockPrisma.class.count.mockResolvedValue(5);
      mockPrisma.classSchedulingRequirement.count.mockResolvedValue(5);
      mockPrisma.schedule.groupBy.mockResolvedValue([]);
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);
      mockPrisma.schedulingRun.count.mockResolvedValue(0);
      // 3 pinned
      mockPrisma.schedule.count
        .mockResolvedValueOnce(3) // pinned
        .mockResolvedValueOnce(10); // usedRoomSlots
      mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(25);
      mockPrisma.room.count.mockResolvedValue(5); // 5 rooms
      // 15 teacher schedule entries for 3 unique teachers
      mockPrisma.schedule.findMany.mockResolvedValue([
        { teacher_staff_id: 't1', weekday: 0, period_order: 1 },
        { teacher_staff_id: 't1', weekday: 0, period_order: 2 },
        { teacher_staff_id: 't1', weekday: 0, period_order: 4 },
        { teacher_staff_id: 't2', weekday: 0, period_order: 1 },
        { teacher_staff_id: 't2', weekday: 0, period_order: 2 },
        { teacher_staff_id: 't3', weekday: 1, period_order: 1 },
      ]);

      const result = await service.overview(TENANT_ID, AY_ID);

      // room: 10 / (5 * 25) = 8%
      expect(result.room_utilisation_pct).toBe(8);
      // teacher: 6 entries / (3 teachers * 25 slots) = 8%
      expect(result.teacher_utilisation_pct).toBe(8);
      // avg_gaps: t1-day0 has [1,2,4] -> 1 gap, t2-day0 has [1,2] -> 0, t3-day1 has [1] -> 0
      // total=1, groups=3 -> 0.3
      expect(result.avg_gaps).toBe(0.3);
    });
  });

  // ─── workload ──────────────────────────────────────────────────────────────

  describe('workload', () => {
    it('should aggregate per-teacher period counts', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        {
          teacher_staff_id: 'staff-1',
          teacher: { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Smith' } },
        },
        {
          teacher_staff_id: 'staff-1',
          teacher: { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Smith' } },
        },
        {
          teacher_staff_id: 'staff-2',
          teacher: { id: 'staff-2', user: { first_name: 'Bob', last_name: 'Jones' } },
        },
      ]);
      mockPrisma.staffAvailability.findMany.mockResolvedValue([]);
      mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(25);

      const result = await service.workload(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(2);
      expect(result.total_periods_per_week).toBe(25);

      const alice = result.data.find((d) => d.staff_id === 'staff-1');
      expect(alice?.total_periods).toBe(2);
      expect(alice?.name).toBe('Alice Smith');

      const bob = result.data.find((d) => d.staff_id === 'staff-2');
      expect(bob?.total_periods).toBe(1);
    });

    it('should sort by total_periods descending', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        {
          teacher_staff_id: 'staff-2',
          teacher: { id: 'staff-2', user: { first_name: 'Bob', last_name: 'Jones' } },
        },
        {
          teacher_staff_id: 'staff-2',
          teacher: { id: 'staff-2', user: { first_name: 'Bob', last_name: 'Jones' } },
        },
        {
          teacher_staff_id: 'staff-2',
          teacher: { id: 'staff-2', user: { first_name: 'Bob', last_name: 'Jones' } },
        },
        {
          teacher_staff_id: 'staff-1',
          teacher: { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Smith' } },
        },
      ]);
      mockPrisma.staffAvailability.findMany.mockResolvedValue([]);
      mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(25);

      const result = await service.workload(TENANT_ID, AY_ID);

      expect(result.data[0]?.staff_id).toBe('staff-2');
      expect(result.data[1]?.staff_id).toBe('staff-1');
    });

    it('should return empty data when no schedules exist', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      mockPrisma.staffAvailability.findMany.mockResolvedValue([]);
      mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(25);

      const result = await service.workload(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(0);
    });
  });

  // ─── unassigned ────────────────────────────────────────────────────────────

  describe('unassigned', () => {
    it('should return classes with fewer scheduled periods than required', async () => {
      mockPrisma.classSchedulingRequirement.findMany.mockResolvedValue([
        {
          class_id: 'cls-1',
          periods_per_week: 5,
          class_entity: {
            id: 'cls-1',
            name: 'Math 1A',
            subject: { name: 'Mathematics' },
            year_group: { name: 'Year 1' },
          },
        },
        {
          class_id: 'cls-2',
          periods_per_week: 3,
          class_entity: {
            id: 'cls-2',
            name: 'English 2B',
            subject: { name: 'English' },
            year_group: { name: 'Year 2' },
          },
        },
      ]);

      mockPrisma.schedule.groupBy.mockResolvedValue([
        { class_id: 'cls-1', _count: { class_id: 3 } },
        // cls-2 not in groupBy at all -> 0 scheduled
      ]);

      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      const result = await service.unassigned(TENANT_ID, AY_ID);

      expect(result.count).toBe(2);
      expect(result.total_classes).toBe(2);

      const math = result.data.find((d) => d.class_id === 'cls-1');
      expect(math?.periods_required).toBe(5);
      expect(math?.periods_scheduled).toBe(3);
      expect(math?.periods_missing).toBe(2);

      const english = result.data.find((d) => d.class_id === 'cls-2');
      expect(english?.periods_missing).toBe(3);
    });

    it('should not include fully scheduled classes', async () => {
      mockPrisma.classSchedulingRequirement.findMany.mockResolvedValue([
        {
          class_id: 'cls-1',
          periods_per_week: 3,
          class_entity: {
            id: 'cls-1',
            name: 'Math 1A',
            subject: { name: 'Math' },
            year_group: { name: 'Y1' },
          },
        },
      ]);
      mockPrisma.schedule.groupBy.mockResolvedValue([
        { class_id: 'cls-1', _count: { class_id: 3 } },
      ]);
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      const result = await service.unassigned(TENANT_ID, AY_ID);

      expect(result.count).toBe(0);
      expect(result.data).toHaveLength(0);
    });
  });

  // ─── getStaffProfileId ────────────────────────────────────────────────────

  describe('getStaffProfileId', () => {
    it('should return staff profile id when found', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: 'staff-1' });

      const result = await service.getStaffProfileId(TENANT_ID, 'user-1');

      expect(result).toBe('staff-1');
    });

    it('should return null when staff profile not found', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

      const result = await service.getStaffProfileId(TENANT_ID, 'user-1');

      expect(result).toBeNull();
    });
  });

  // ─── preferences ──────────────────────────────────────────────────────────

  describe('preferences', () => {
    it('should return empty result when no completed run exists', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      const result = await service.preferences(TENANT_ID, AY_ID);

      expect(result.run_id).toBeNull();
      expect(result.staff_satisfaction).toHaveLength(0);
    });

    it('should aggregate preference satisfaction from result_json', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'completed',
        soft_preference_score: 80,
        soft_preference_max: 100,
        created_at: NOW,
        result_json: {
          entries: [
            {
              teacher_staff_id: 'staff-1',
              preference_satisfaction: [
                { type: 'time', weight: 1, satisfied: true },
                { type: 'room', weight: 2, satisfied: false },
              ],
            },
            {
              teacher_staff_id: 'staff-1',
              preference_satisfaction: [{ type: 'time', weight: 1, satisfied: true }],
            },
          ],
          unassigned: [],
        },
      });
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Smith' } },
      ]);

      const result = await service.preferences(TENANT_ID, AY_ID);

      expect(result.run_id).toBe('run-1');
      expect(result.overall_satisfaction_pct).toBe(80);
      expect(result.staff_satisfaction).toHaveLength(1);
      const staff = result.staff_satisfaction[0];
      expect(staff?.preferences_total).toBe(3);
      expect(staff?.preferences_satisfied).toBe(2);
      expect(staff?.name).toBe('Alice Smith');
    });

    it('should filter by staffProfileId when provided', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'applied',
        soft_preference_score: 70,
        soft_preference_max: 100,
        created_at: NOW,
        result_json: {
          entries: [
            {
              teacher_staff_id: 'staff-1',
              preference_satisfaction: [{ type: 'time', weight: 1, satisfied: true }],
            },
            {
              teacher_staff_id: 'staff-2',
              preference_satisfaction: [{ type: 'time', weight: 1, satisfied: false }],
            },
          ],
          unassigned: [],
        },
      });
      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Smith' } },
      ]);

      const result = await service.preferences(TENANT_ID, AY_ID, 'staff-1');

      expect(result.staff_satisfaction).toHaveLength(1);
      expect(result.staff_satisfaction[0]?.staff_id).toBe('staff-1');
    });
  });

  // ─── roomUtilisation ──────────────────────────────────────────────────────

  describe('roomUtilisation', () => {
    it('should return per-room utilisation data', async () => {
      mockPrisma.room.findMany.mockResolvedValue([
        { id: 'room-1', name: 'Lab A', room_type: 'laboratory', capacity: 30 },
        { id: 'room-2', name: 'Room 101', room_type: 'classroom', capacity: 25 },
      ]);
      mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(25);
      mockPrisma.schedule.findMany.mockResolvedValue([
        {
          room_id: 'room-1',
          weekday: 0,
          period_order: 1,
          schedule_period_template: { period_name: 'P1' },
        },
        {
          room_id: 'room-1',
          weekday: 0,
          period_order: 2,
          schedule_period_template: { period_name: 'P2' },
        },
        {
          room_id: 'room-1',
          weekday: 1,
          period_order: 1,
          schedule_period_template: { period_name: 'P1' },
        },
      ]);

      const result = await service.roomUtilisation(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(2);
      const lab = result.data.find((r) => r.room_id === 'room-1');
      expect(lab?.utilisation_pct).toBe(12); // 3/25 = 12%
      expect(lab?.peak_period).toBe('P1'); // P1 appears twice
      const room101 = result.data.find((r) => r.room_id === 'room-2');
      expect(room101?.utilisation_pct).toBe(0);
    });

    it('should return empty data when no rooms exist', async () => {
      mockPrisma.room.findMany.mockResolvedValue([]);
      mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(25);
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      const result = await service.roomUtilisation(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(0);
    });
  });

  // ─── trends ───────────────────────────────────────────────────────────────

  describe('trends', () => {
    it('should return trend data from past runs', async () => {
      mockPrisma.schedulingRun.findMany.mockResolvedValue([
        {
          id: 'run-1',
          entries_generated: 50,
          entries_unassigned: 2,
          soft_preference_score: 80,
          soft_preference_max: 100,
          created_at: NOW,
          result_json: {
            entries: [
              { room_id: 'r1', teacher_staff_id: 't1', weekday: 0, period_order: 1 },
              { room_id: 'r1', teacher_staff_id: 't1', weekday: 0, period_order: 2 },
            ],
            unassigned: [],
          },
        },
      ]);
      mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(25);
      mockPrisma.room.count.mockResolvedValue(5);

      const result = await service.trends(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.preference_score).toBe(80);
    });

    it('should return empty data when no completed runs exist', async () => {
      mockPrisma.schedulingRun.findMany.mockResolvedValue([]);
      mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(25);
      mockPrisma.room.count.mockResolvedValue(0);

      const result = await service.trends(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(0);
    });
  });
});
