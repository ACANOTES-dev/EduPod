import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

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
    schedulingRun: { findFirst: jest.Mock; count: jest.Mock };
    staffAvailability: { findMany: jest.Mock };
    schedulePeriodTemplate: { count: jest.Mock };
    staffProfile: { findFirst: jest.Mock; findMany: jest.Mock };
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
        count: jest.fn().mockResolvedValue(0),
      },
      staffAvailability: { findMany: jest.fn().mockResolvedValue([]) },
      schedulePeriodTemplate: { count: jest.fn().mockResolvedValue(0) },
      staffProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
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
      mockPrisma.schedule.groupBy.mockResolvedValue([
        { class_id: 'c1' },
        { class_id: 'c2' },
      ]);
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);
      mockPrisma.schedulingRun.count.mockResolvedValue(0);
      mockPrisma.schedule.count.mockResolvedValue(3);

      const result = await service.overview(TENANT_ID, AY_ID);

      expect(result.total_classes).toBe(10);
      expect(result.configured_classes).toBe(8);
      expect(result.scheduled_classes).toBe(2);
      expect(result.pinned_entries).toBe(3);
      expect(result.active_run).toBe(false);
      expect(result.latest_run).toBeNull();
    });

    it('should include latest_run when a completed run exists', async () => {
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

      const result = await service.overview(TENANT_ID, AY_ID);

      expect(result.latest_run).not.toBeNull();
      expect(result.latest_run?.id).toBe('run-1');
      expect(result.latest_run?.soft_preference_score).toBe(85);
      expect(result.latest_run?.created_at).toBe(NOW.toISOString());
    });

    it('should set active_run to true when queued/running runs exist', async () => {
      mockPrisma.class.count.mockResolvedValue(5);
      mockPrisma.classSchedulingRequirement.count.mockResolvedValue(5);
      mockPrisma.schedule.groupBy.mockResolvedValue([]);
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);
      mockPrisma.schedulingRun.count.mockResolvedValue(1);
      mockPrisma.schedule.count.mockResolvedValue(0);

      const result = await service.overview(TENANT_ID, AY_ID);

      expect(result.active_run).toBe(true);
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
              preference_satisfaction: [
                { type: 'time', weight: 1, satisfied: true },
              ],
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
});
