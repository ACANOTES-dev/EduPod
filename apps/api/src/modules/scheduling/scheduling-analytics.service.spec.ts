import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  RoomsReadFacade,
  SchedulesReadFacade,
  SchedulingRunsReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { SchedulingAnalyticsService } from './scheduling-analytics.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACADEMIC_YEAR_ID = 'ay-1';

const DEFAULT_QUERY = { academic_year_id: ACADEMIC_YEAR_ID };

describe('SchedulingAnalyticsService', () => {
  let service: SchedulingAnalyticsService;

  const mockSchedulesReadFacade = {
    findByAcademicYear: jest.fn().mockResolvedValue([]),
    findTeacherWorkloadEntries: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };

  const mockRoomsReadFacade = {
    findActiveRooms: jest.fn().mockResolvedValue([]),
    findActiveRoomBasics: jest.fn().mockResolvedValue([]),
  };

  const mockSchedulingRunsReadFacade = {
    findLatestAppliedRun: jest.fn().mockResolvedValue(null),
  };

  const mockPrisma = {
    teacherSchedulingConfig: { findMany: jest.fn().mockResolvedValue([]) },
    schedulePeriodTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    substitutionRecord: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: RoomsReadFacade, useValue: mockRoomsReadFacade },
        { provide: SchedulesReadFacade, useValue: mockSchedulesReadFacade },
        { provide: SchedulingRunsReadFacade, useValue: mockSchedulingRunsReadFacade },
        SchedulingAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SchedulingAnalyticsService>(SchedulingAnalyticsService);

    jest.clearAllMocks();
    mockSchedulesReadFacade.findByAcademicYear.mockResolvedValue([]);
    mockSchedulesReadFacade.findTeacherWorkloadEntries.mockResolvedValue([]);
    mockSchedulesReadFacade.count.mockResolvedValue(0);
    mockRoomsReadFacade.findActiveRooms.mockResolvedValue([]);
    mockRoomsReadFacade.findActiveRoomBasics.mockResolvedValue([]);
    mockSchedulingRunsReadFacade.findLatestAppliedRun.mockResolvedValue(null);
    mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue([]);
    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([]);
    mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);
    mockPrisma.substitutionRecord.count.mockResolvedValue(0);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getEfficiencyDashboard ───────────────────────────────────────────────

  describe('getEfficiencyDashboard', () => {
    it('should return 0 utilization when no schedules exist', async () => {
      const result = await service.getEfficiencyDashboard(TENANT_ID, DEFAULT_QUERY);

      expect(result.teacher_utilization_avg_percent).toBe(0);
      expect(result.room_utilization_rate_percent).toBe(0);
      expect(result.total_active_schedules).toBe(0);
    });

    it('should calculate correct teacher utilization percentage', async () => {
      // Teacher has 10 scheduled periods, max is 20 → 50%
      mockSchedulesReadFacade.findByAcademicYear.mockResolvedValue(
        Array(10).fill({ teacher_staff_id: 'staff-1', room_id: null, period_order: 1, weekday: 1 }),
      );
      mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue([
        { staff_profile_id: 'staff-1', max_periods_per_week: 20 },
      ]);

      const result = await service.getEfficiencyDashboard(TENANT_ID, DEFAULT_QUERY);

      expect(result.teacher_utilization_avg_percent).toBe(50);
    });

    it('should calculate room utilization as filled slots / total available slots', async () => {
      mockRoomsReadFacade.findActiveRooms.mockResolvedValue([{ id: 'room-1', capacity: 30 }]);
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue(
        Array(10).fill({ weekday: 1, period_order: 1 }),
      );
      // room-1 is used in 5 of 10 available slots
      mockSchedulesReadFacade.findByAcademicYear.mockResolvedValue(
        Array(5).fill({ teacher_staff_id: null, room_id: 'room-1', period_order: 1, weekday: 1 }),
      );

      const result = await service.getEfficiencyDashboard(TENANT_ID, DEFAULT_QUERY);

      expect(result.room_utilization_rate_percent).toBe(50);
    });

    it('should include preference satisfaction when a scheduling run exists', async () => {
      mockSchedulingRunsReadFacade.findLatestAppliedRun.mockResolvedValue({
        soft_preference_score: '75',
        soft_preference_max: '100',
        entries_unassigned: 3,
        entries_generated: 200,
      });

      const result = await service.getEfficiencyDashboard(TENANT_ID, DEFAULT_QUERY);

      expect(result.preference_satisfaction_percent).toBe(75);
      expect(result.unassigned_slot_count).toBe(3);
    });

    it('should return null preference satisfaction when no scheduling run exists', async () => {
      mockSchedulingRunsReadFacade.findLatestAppliedRun.mockResolvedValue(null);

      const result = await service.getEfficiencyDashboard(TENANT_ID, DEFAULT_QUERY);

      expect(result.preference_satisfaction_percent).toBeNull();
    });

    it('should report total substitution count', async () => {
      mockPrisma.substitutionRecord.count.mockResolvedValue(42);

      const result = await service.getEfficiencyDashboard(TENANT_ID, DEFAULT_QUERY);

      expect(result.substitution_total_count).toBe(42);
    });

    it('should return null preference satisfaction when prefMax is 0', async () => {
      mockSchedulingRunsReadFacade.findLatestAppliedRun.mockResolvedValue({
        soft_preference_score: '0',
        soft_preference_max: '0',
        entries_unassigned: 0,
        entries_generated: 10,
      });

      const result = await service.getEfficiencyDashboard(TENANT_ID, DEFAULT_QUERY);

      expect(result.preference_satisfaction_percent).toBeNull();
    });

    it('should return null preference when score is null but max is set', async () => {
      mockSchedulingRunsReadFacade.findLatestAppliedRun.mockResolvedValue({
        soft_preference_score: null,
        soft_preference_max: '100',
        entries_unassigned: 0,
        entries_generated: 10,
      });

      const result = await service.getEfficiencyDashboard(TENANT_ID, DEFAULT_QUERY);

      expect(result.preference_satisfaction_percent).toBeNull();
    });

    it('should skip teachers without max config for utilization', async () => {
      mockSchedulesReadFacade.findByAcademicYear.mockResolvedValue([
        { teacher_staff_id: 'staff-1', room_id: null },
        { teacher_staff_id: 'staff-2', room_id: null },
      ]);
      // Only staff-1 has a config, staff-2 does not
      mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue([
        { staff_profile_id: 'staff-1', max_periods_per_week: 10 },
      ]);

      const result = await service.getEfficiencyDashboard(TENANT_ID, DEFAULT_QUERY);

      // Only staff-1 contributes (1/10 = 10%)
      expect(result.teacher_utilization_avg_percent).toBe(10);
    });

    it('should handle schedules without teacher_staff_id or room_id', async () => {
      mockSchedulesReadFacade.findByAcademicYear.mockResolvedValue([
        { teacher_staff_id: null, room_id: null },
      ]);

      const result = await service.getEfficiencyDashboard(TENANT_ID, DEFAULT_QUERY);

      expect(result.teacher_utilization_avg_percent).toBe(0);
      expect(result.room_utilization_rate_percent).toBe(0);
      expect(result.total_active_schedules).toBe(1);
    });

    it('should average utilization across multiple teachers', async () => {
      // staff-1: 5/10=50%, staff-2: 8/20=40% => avg=45%
      mockSchedulesReadFacade.findByAcademicYear.mockResolvedValue([
        ...Array(5).fill({ teacher_staff_id: 'staff-1', room_id: null }),
        ...Array(8).fill({ teacher_staff_id: 'staff-2', room_id: null }),
      ]);
      mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue([
        { staff_profile_id: 'staff-1', max_periods_per_week: 10 },
        { staff_profile_id: 'staff-2', max_periods_per_week: 20 },
      ]);

      const result = await service.getEfficiencyDashboard(TENANT_ID, DEFAULT_QUERY);

      expect(result.teacher_utilization_avg_percent).toBe(45);
    });
  });

  // ─── getWorkloadHeatmap ───────────────────────────────────────────────────

  describe('getWorkloadHeatmap', () => {
    it('should return per-teacher workload with periods_per_weekday map', async () => {
      mockSchedulesReadFacade.findTeacherWorkloadEntries.mockResolvedValue([
        {
          teacher_staff_id: 'staff-1',
          teacher: { user: { first_name: 'Alice', last_name: 'Brown' } },
        },
        {
          teacher_staff_id: 'staff-1',
          teacher: { user: { first_name: 'Alice', last_name: 'Brown' } },
        },
        {
          teacher_staff_id: 'staff-1',
          teacher: { user: { first_name: 'Alice', last_name: 'Brown' } },
        },
      ]);

      const result = await service.getWorkloadHeatmap(TENANT_ID, DEFAULT_QUERY);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.total_periods).toBe(3);
      // All entries mapped to weekday 0 by the facade-based service
      expect(result.data[0]!.periods_per_weekday[0]).toBe(3);
    });

    it('should sort by total_periods descending', async () => {
      mockSchedulesReadFacade.findTeacherWorkloadEntries.mockResolvedValue([
        {
          teacher_staff_id: 'staff-2',
          weekday: 1,
          period_order: 1,
          teacher: { user: { first_name: 'Bob', last_name: 'Smith' } },
        },
        {
          teacher_staff_id: 'staff-1',
          weekday: 1,
          period_order: 1,
          teacher: { user: { first_name: 'Alice', last_name: 'Brown' } },
        },
        {
          teacher_staff_id: 'staff-1',
          weekday: 2,
          period_order: 1,
          teacher: { user: { first_name: 'Alice', last_name: 'Brown' } },
        },
        {
          teacher_staff_id: 'staff-1',
          weekday: 3,
          period_order: 1,
          teacher: { user: { first_name: 'Alice', last_name: 'Brown' } },
        },
      ]);

      const result = await service.getWorkloadHeatmap(TENANT_ID, DEFAULT_QUERY);

      expect(result.data[0]!.staff_profile_id).toBe('staff-1');
      expect(result.data[0]!.total_periods).toBe(3);
    });

    it('should include cover_count from recent substitution records', async () => {
      mockSchedulesReadFacade.findTeacherWorkloadEntries.mockResolvedValue([
        {
          teacher_staff_id: 'staff-1',
          weekday: 1,
          period_order: 1,
          teacher: { user: { first_name: 'Alice', last_name: 'Brown' } },
        },
      ]);
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([
        { substitute_staff_id: 'staff-1' },
        { substitute_staff_id: 'staff-1' },
        { substitute_staff_id: 'staff-1' },
      ]);

      const result = await service.getWorkloadHeatmap(TENANT_ID, DEFAULT_QUERY);

      expect(result.data[0]!.cover_count).toBe(3);
    });

    it('should return empty array when no schedules exist', async () => {
      const result = await service.getWorkloadHeatmap(TENANT_ID, DEFAULT_QUERY);

      expect(result.data).toHaveLength(0);
    });

    it('should skip entries without teacher_staff_id', async () => {
      mockSchedulesReadFacade.findTeacherWorkloadEntries.mockResolvedValue([
        { teacher_staff_id: null, teacher: null },
        { teacher_staff_id: 'staff-1', teacher: { user: { first_name: 'A', last_name: 'B' } } },
      ]);

      const result = await service.getWorkloadHeatmap(TENANT_ID, DEFAULT_QUERY);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.staff_profile_id).toBe('staff-1');
    });

    it('should use staff_profile_id as name when teacher relation is null', async () => {
      mockSchedulesReadFacade.findTeacherWorkloadEntries.mockResolvedValue([
        { teacher_staff_id: 'staff-1', teacher: null },
      ]);

      const result = await service.getWorkloadHeatmap(TENANT_ID, DEFAULT_QUERY);

      expect(result.data[0]!.name).toBe('staff-1');
    });

    it('should return 0 cover_count when no substitution records exist for teacher', async () => {
      mockSchedulesReadFacade.findTeacherWorkloadEntries.mockResolvedValue([
        { teacher_staff_id: 'staff-1', teacher: { user: { first_name: 'A', last_name: 'B' } } },
      ]);
      mockPrisma.substitutionRecord.findMany.mockResolvedValue([]);

      const result = await service.getWorkloadHeatmap(TENANT_ID, DEFAULT_QUERY);

      expect(result.data[0]!.cover_count).toBe(0);
    });
  });

  // ─── getRoomUtilization ───────────────────────────────────────────────────

  describe('getRoomUtilization', () => {
    it('should calculate utilization_rate for each room', async () => {
      mockRoomsReadFacade.findActiveRoomBasics.mockResolvedValue([
        { id: 'room-1', name: 'Lab A', capacity: 25 },
        { id: 'room-2', name: 'Hall B', capacity: 100 },
      ]);
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue(Array(20).fill({ weekday: 1 }));
      // room-1 used 10 times out of 20 possible → 50%
      // room-2 used 0 times → 0%
      mockSchedulesReadFacade.findByAcademicYear.mockResolvedValue(
        Array(10).fill({ room_id: 'room-1' }),
      );

      const result = await service.getRoomUtilization(TENANT_ID, DEFAULT_QUERY);

      const room1 = result.data.find((r) => r.room_id === 'room-1');
      const room2 = result.data.find((r) => r.room_id === 'room-2');
      expect(room1?.utilization_rate).toBe(50);
      expect(room1?.slots_filled).toBe(10);
      expect(room2?.utilization_rate).toBe(0);
      expect(room2?.slots_filled).toBe(0);
    });

    it('should sort rooms by utilization_rate descending', async () => {
      mockRoomsReadFacade.findActiveRoomBasics.mockResolvedValue([
        { id: 'room-1', name: 'Lab A', capacity: 25 },
        { id: 'room-2', name: 'Hall B', capacity: 100 },
      ]);
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue(Array(10).fill({ weekday: 1 }));
      // room-2 has higher utilization
      mockSchedulesReadFacade.findByAcademicYear.mockResolvedValue([
        ...Array(8).fill({ room_id: 'room-2' }),
        ...Array(2).fill({ room_id: 'room-1' }),
      ]);

      const result = await service.getRoomUtilization(TENANT_ID, DEFAULT_QUERY);

      expect(result.data[0]!.room_id).toBe('room-2');
    });

    it('should return 0 utilization when no period templates exist', async () => {
      mockRoomsReadFacade.findActiveRoomBasics.mockResolvedValue([
        { id: 'room-1', name: 'Lab A', capacity: 25 },
      ]);
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockSchedulesReadFacade.findByAcademicYear.mockResolvedValue([{ room_id: 'room-1' }]);

      const result = await service.getRoomUtilization(TENANT_ID, DEFAULT_QUERY);

      expect(result.data[0]!.utilization_rate).toBe(0);
    });

    it('should return empty data when no rooms are active', async () => {
      mockRoomsReadFacade.findActiveRoomBasics.mockResolvedValue([]);

      const result = await service.getRoomUtilization(TENANT_ID, DEFAULT_QUERY);

      expect(result.data).toHaveLength(0);
    });

    it('should skip schedules without room_id', async () => {
      mockRoomsReadFacade.findActiveRoomBasics.mockResolvedValue([
        { id: 'room-1', name: 'Lab A', capacity: 25 },
      ]);
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue(Array(10).fill({ weekday: 1 }));
      mockSchedulesReadFacade.findByAcademicYear.mockResolvedValue([
        { room_id: null },
        { room_id: 'room-1' },
      ]);

      const result = await service.getRoomUtilization(TENANT_ID, DEFAULT_QUERY);

      expect(result.data[0]!.slots_filled).toBe(1);
    });
  });

  // ─── getHistoricalComparison ──────────────────────────────────────────────

  describe('getHistoricalComparison', () => {
    it('should return comparison between two academic years', async () => {
      mockSchedulesReadFacade.count
        .mockResolvedValueOnce(100) // year A schedule count
        .mockResolvedValueOnce(120); // year B schedule count
      mockPrisma.substitutionRecord.count
        .mockResolvedValueOnce(10) // year A substitutions
        .mockResolvedValueOnce(15); // year B substitutions
      mockSchedulingRunsReadFacade.findLatestAppliedRun
        .mockResolvedValueOnce({
          entries_unassigned: 2,
          soft_preference_score: '80',
          soft_preference_max: '100',
        })
        .mockResolvedValueOnce({
          entries_unassigned: 1,
          soft_preference_score: '90',
          soft_preference_max: '100',
        });

      const result = await service.getHistoricalComparison(TENANT_ID, {
        year_id_a: 'ay-1',
        year_id_b: 'ay-2',
      });

      expect(result.year_a.academic_year_id).toBe('ay-1');
      expect(result.year_b.academic_year_id).toBe('ay-2');
      expect(result.year_a.schedule_count).toBe(100);
      expect(result.year_b.schedule_count).toBe(120);
      expect(result.comparison.schedule_count_delta).toBe(20);
      expect(result.comparison.substitution_delta).toBe(5);
      expect(result.comparison.unassigned_delta).toBe(-1);
    });

    it('should handle years with no applied runs', async () => {
      mockSchedulesReadFacade.count.mockResolvedValue(50);
      mockPrisma.substitutionRecord.count.mockResolvedValue(0);
      mockSchedulingRunsReadFacade.findLatestAppliedRun.mockResolvedValue(null);

      const result = await service.getHistoricalComparison(TENANT_ID, {
        year_id_a: 'ay-1',
        year_id_b: 'ay-2',
      });

      expect(result.year_a.unassigned_count).toBeNull();
      expect(result.year_b.unassigned_count).toBeNull();
      expect(result.year_a.preference_satisfaction_percent).toBeNull();
      expect(result.comparison.unassigned_delta).toBe(0);
    });

    it('should return null preference when prefMax is 0', async () => {
      mockSchedulesReadFacade.count.mockResolvedValue(10);
      mockPrisma.substitutionRecord.count.mockResolvedValue(0);
      mockSchedulingRunsReadFacade.findLatestAppliedRun.mockResolvedValue({
        entries_unassigned: 0,
        soft_preference_score: '0',
        soft_preference_max: '0',
      });

      const result = await service.getHistoricalComparison(TENANT_ID, {
        year_id_a: 'ay-1',
        year_id_b: 'ay-2',
      });

      expect(result.year_a.preference_satisfaction_percent).toBeNull();
    });

    it('should return null preference when score is null', async () => {
      mockSchedulesReadFacade.count.mockResolvedValue(10);
      mockPrisma.substitutionRecord.count.mockResolvedValue(0);
      mockSchedulingRunsReadFacade.findLatestAppliedRun.mockResolvedValue({
        entries_unassigned: 0,
        soft_preference_score: null,
        soft_preference_max: '100',
      });

      const result = await service.getHistoricalComparison(TENANT_ID, {
        year_id_a: 'ay-1',
        year_id_b: 'ay-2',
      });

      expect(result.year_a.preference_satisfaction_percent).toBeNull();
    });
  });
});
