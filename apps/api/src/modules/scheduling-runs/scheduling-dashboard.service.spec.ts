import { Test, TestingModule } from '@nestjs/testing';

import {
  ClassesReadFacade,
  MOCK_FACADE_PROVIDERS,
  RoomsReadFacade,
  SchedulesReadFacade,
  SchedulingReadFacade,
  SchedulingRunsReadFacade,
  StaffAvailabilityReadFacade,
  StaffProfileReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { SchedulingDashboardService } from './scheduling-dashboard.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AY_ID = 'ay-uuid-0001';
const NOW = new Date('2026-03-01T12:00:00Z');

describe('SchedulingDashboardService', () => {
  let service: SchedulingDashboardService;

  const mockClassesReadFacade = {
    countByAcademicYear: jest.fn().mockResolvedValue(0),
  };

  const mockRoomsReadFacade = {
    countActiveRooms: jest.fn().mockResolvedValue(0),
    findActiveRooms: jest.fn().mockResolvedValue([]),
  };

  const mockSchedulesReadFacade = {
    findScheduledClassIds: jest.fn().mockResolvedValue([]),
    countPinnedEntries: jest.fn().mockResolvedValue(0),
    countRoomAssignedEntries: jest.fn().mockResolvedValue(0),
    findTeacherScheduleEntries: jest.fn().mockResolvedValue([]),
    findTeacherWorkloadEntries: jest.fn().mockResolvedValue([]),
    countEntriesPerClass: jest.fn().mockResolvedValue(new Map()),
    findRoomScheduleEntries: jest.fn().mockResolvedValue([]),
  };

  const mockSchedulingReadFacade = {
    countClassRequirements: jest.fn().mockResolvedValue(0),
    countTeachingPeriods: jest.fn().mockResolvedValue(0),
    findClassRequirementsWithDetails: jest.fn().mockResolvedValue([]),
  };

  const mockSchedulingRunsReadFacade = {
    findLatestCompletedRun: jest.fn().mockResolvedValue(null),
    countActiveRuns: jest.fn().mockResolvedValue(0),
    findLatestRunWithResult: jest.fn().mockResolvedValue(null),
    findHistoricalRuns: jest.fn().mockResolvedValue([]),
  };

  const mockStaffAvailabilityReadFacade = {
    findByStaffIds: jest.fn().mockResolvedValue([]),
  };

  const mockStaffProfileReadFacade = {
    findByUserId: jest.fn().mockResolvedValue(null),
    findByIds: jest.fn().mockResolvedValue([]),
  };

  const mockPrisma = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesReadFacade },
        { provide: RoomsReadFacade, useValue: mockRoomsReadFacade },
        { provide: SchedulesReadFacade, useValue: mockSchedulesReadFacade },
        { provide: SchedulingReadFacade, useValue: mockSchedulingReadFacade },
        { provide: SchedulingRunsReadFacade, useValue: mockSchedulingRunsReadFacade },
        { provide: StaffAvailabilityReadFacade, useValue: mockStaffAvailabilityReadFacade },
        { provide: StaffProfileReadFacade, useValue: mockStaffProfileReadFacade },
        SchedulingDashboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SchedulingDashboardService>(SchedulingDashboardService);

    jest.clearAllMocks();
    // Reset defaults
    mockClassesReadFacade.countByAcademicYear.mockResolvedValue(0);
    mockRoomsReadFacade.countActiveRooms.mockResolvedValue(0);
    mockRoomsReadFacade.findActiveRooms.mockResolvedValue([]);
    mockSchedulesReadFacade.findScheduledClassIds.mockResolvedValue([]);
    mockSchedulesReadFacade.countPinnedEntries.mockResolvedValue(0);
    mockSchedulesReadFacade.countRoomAssignedEntries.mockResolvedValue(0);
    mockSchedulesReadFacade.findTeacherScheduleEntries.mockResolvedValue([]);
    mockSchedulesReadFacade.findTeacherWorkloadEntries.mockResolvedValue([]);
    mockSchedulesReadFacade.countEntriesPerClass.mockResolvedValue(new Map());
    mockSchedulesReadFacade.findRoomScheduleEntries.mockResolvedValue([]);
    mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(0);
    mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(0);
    mockSchedulingReadFacade.findClassRequirementsWithDetails.mockResolvedValue([]);
    mockSchedulingRunsReadFacade.findLatestCompletedRun.mockResolvedValue(null);
    mockSchedulingRunsReadFacade.countActiveRuns.mockResolvedValue(0);
    mockSchedulingRunsReadFacade.findLatestRunWithResult.mockResolvedValue(null);
    mockSchedulingRunsReadFacade.findHistoricalRuns.mockResolvedValue([]);
    mockStaffAvailabilityReadFacade.findByStaffIds.mockResolvedValue([]);
    mockStaffProfileReadFacade.findByUserId.mockResolvedValue(null);
    mockStaffProfileReadFacade.findByIds.mockResolvedValue([]);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── overview ──────────────────────────────────────────────────────────────

  describe('overview', () => {
    it('should return summary stats with no latest run', async () => {
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(10);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(8);
      mockSchedulesReadFacade.findScheduledClassIds.mockResolvedValue(['c1', 'c2']);
      mockSchedulingRunsReadFacade.findLatestCompletedRun.mockResolvedValue(null);
      mockSchedulingRunsReadFacade.countActiveRuns.mockResolvedValue(0);
      mockSchedulesReadFacade.countPinnedEntries.mockResolvedValue(3);
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(0);
      mockRoomsReadFacade.countActiveRooms.mockResolvedValue(0);
      mockSchedulesReadFacade.countRoomAssignedEntries.mockResolvedValue(0);
      mockSchedulesReadFacade.findTeacherScheduleEntries.mockResolvedValue([]);

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
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockSchedulesReadFacade.findScheduledClassIds.mockResolvedValue([]);
      mockSchedulingRunsReadFacade.findLatestCompletedRun.mockResolvedValue({
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
      mockSchedulingRunsReadFacade.countActiveRuns.mockResolvedValue(0);
      mockSchedulesReadFacade.countPinnedEntries.mockResolvedValue(0);
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(25);
      mockRoomsReadFacade.countActiveRooms.mockResolvedValue(5);
      mockSchedulesReadFacade.countRoomAssignedEntries.mockResolvedValue(0);
      mockSchedulesReadFacade.findTeacherScheduleEntries.mockResolvedValue([]);

      const result = await service.overview(TENANT_ID, AY_ID);

      expect(result.latest_run).not.toBeNull();
      expect(result.latest_run?.id).toBe('run-1');
      expect(result.latest_run?.soft_preference_score).toBe(85);
      expect(result.latest_run?.created_at).toBe(NOW.toISOString());
      expect(result.preference_score).toBe(85);
    });

    it('should set active_run to true when queued/running runs exist', async () => {
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockSchedulesReadFacade.findScheduledClassIds.mockResolvedValue([]);
      mockSchedulingRunsReadFacade.findLatestCompletedRun.mockResolvedValue(null);
      mockSchedulingRunsReadFacade.countActiveRuns.mockResolvedValue(1);
      mockSchedulesReadFacade.countPinnedEntries.mockResolvedValue(0);
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(0);
      mockRoomsReadFacade.countActiveRooms.mockResolvedValue(0);
      mockSchedulesReadFacade.countRoomAssignedEntries.mockResolvedValue(0);
      mockSchedulesReadFacade.findTeacherScheduleEntries.mockResolvedValue([]);

      const result = await service.overview(TENANT_ID, AY_ID);

      expect(result.active_run).toBe(true);
    });

    it('should compute room and teacher utilisation from schedule data', async () => {
      mockClassesReadFacade.countByAcademicYear.mockResolvedValue(5);
      mockSchedulingReadFacade.countClassRequirements.mockResolvedValue(5);
      mockSchedulesReadFacade.findScheduledClassIds.mockResolvedValue([]);
      mockSchedulingRunsReadFacade.findLatestCompletedRun.mockResolvedValue(null);
      mockSchedulingRunsReadFacade.countActiveRuns.mockResolvedValue(0);
      // 3 pinned
      mockSchedulesReadFacade.countPinnedEntries.mockResolvedValue(3);
      mockSchedulesReadFacade.countRoomAssignedEntries.mockResolvedValue(10);
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(25);
      mockRoomsReadFacade.countActiveRooms.mockResolvedValue(5); // 5 rooms
      // 6 teacher schedule entries for 3 unique teachers
      mockSchedulesReadFacade.findTeacherScheduleEntries.mockResolvedValue([
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
      mockSchedulesReadFacade.findTeacherWorkloadEntries.mockResolvedValue([
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
      mockStaffAvailabilityReadFacade.findByStaffIds.mockResolvedValue([]);
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(25);

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
      mockSchedulesReadFacade.findTeacherWorkloadEntries.mockResolvedValue([
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
      mockStaffAvailabilityReadFacade.findByStaffIds.mockResolvedValue([]);
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(25);

      const result = await service.workload(TENANT_ID, AY_ID);

      expect(result.data[0]?.staff_id).toBe('staff-2');
      expect(result.data[1]?.staff_id).toBe('staff-1');
    });

    it('should return empty data when no schedules exist', async () => {
      mockSchedulesReadFacade.findTeacherWorkloadEntries.mockResolvedValue([]);
      mockStaffAvailabilityReadFacade.findByStaffIds.mockResolvedValue([]);
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(25);

      const result = await service.workload(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(0);
    });
  });

  // ─── unassigned ────────────────────────────────────────────────────────────

  describe('unassigned', () => {
    it('should return classes with fewer scheduled periods than required', async () => {
      mockSchedulingReadFacade.findClassRequirementsWithDetails.mockResolvedValue([
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

      mockSchedulesReadFacade.countEntriesPerClass.mockResolvedValue(
        new Map([['cls-1', 3]]),
      );

      mockSchedulingRunsReadFacade.findLatestRunWithResult.mockResolvedValue(null);

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
      mockSchedulingReadFacade.findClassRequirementsWithDetails.mockResolvedValue([
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
      mockSchedulesReadFacade.countEntriesPerClass.mockResolvedValue(
        new Map([['cls-1', 3]]),
      );
      mockSchedulingRunsReadFacade.findLatestRunWithResult.mockResolvedValue(null);

      const result = await service.unassigned(TENANT_ID, AY_ID);

      expect(result.count).toBe(0);
      expect(result.data).toHaveLength(0);
    });
  });

  // ─── getStaffProfileId ────────────────────────────────────────────────────

  describe('getStaffProfileId', () => {
    it('should return staff profile id when found', async () => {
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue({ id: 'staff-1' });

      const result = await service.getStaffProfileId(TENANT_ID, 'user-1');

      expect(result).toBe('staff-1');
    });

    it('should return null when staff profile not found', async () => {
      mockStaffProfileReadFacade.findByUserId.mockResolvedValue(null);

      const result = await service.getStaffProfileId(TENANT_ID, 'user-1');

      expect(result).toBeNull();
    });
  });

  // ─── preferences ──────────────────────────────────────────────────────────

  describe('preferences', () => {
    it('should return empty result when no completed run exists', async () => {
      mockSchedulingRunsReadFacade.findLatestRunWithResult.mockResolvedValue(null);

      const result = await service.preferences(TENANT_ID, AY_ID);

      expect(result.run_id).toBeNull();
      expect(result.staff_satisfaction).toHaveLength(0);
    });

    it('should aggregate preference satisfaction from result_json', async () => {
      mockSchedulingRunsReadFacade.findLatestRunWithResult.mockResolvedValue({
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
      mockStaffProfileReadFacade.findByIds.mockResolvedValue([
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
      mockSchedulingRunsReadFacade.findLatestRunWithResult.mockResolvedValue({
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
      mockStaffProfileReadFacade.findByIds.mockResolvedValue([
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
      mockRoomsReadFacade.findActiveRooms.mockResolvedValue([
        { id: 'room-1', name: 'Lab A', room_type: 'laboratory', capacity: 30 },
        { id: 'room-2', name: 'Room 101', room_type: 'classroom', capacity: 25 },
      ]);
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(25);
      mockSchedulesReadFacade.findRoomScheduleEntries.mockResolvedValue([
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
      mockRoomsReadFacade.findActiveRooms.mockResolvedValue([]);
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(25);
      mockSchedulesReadFacade.findRoomScheduleEntries.mockResolvedValue([]);

      const result = await service.roomUtilisation(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(0);
    });
  });

  // ─── trends ───────────────────────────────────────────────────────────────

  describe('trends', () => {
    it('should return trend data from past runs', async () => {
      mockSchedulingRunsReadFacade.findHistoricalRuns.mockResolvedValue([
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
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(25);
      mockRoomsReadFacade.countActiveRooms.mockResolvedValue(5);

      const result = await service.trends(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.preference_score).toBe(80);
    });

    it('should return empty data when no completed runs exist', async () => {
      mockSchedulingRunsReadFacade.findHistoricalRuns.mockResolvedValue([]);
      mockSchedulingReadFacade.countTeachingPeriods.mockResolvedValue(25);
      mockRoomsReadFacade.countActiveRooms.mockResolvedValue(0);

      const result = await service.trends(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(0);
    });
  });
});
