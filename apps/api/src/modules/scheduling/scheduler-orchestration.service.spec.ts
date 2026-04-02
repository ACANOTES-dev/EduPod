import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { SchedulerOrchestrationService } from './scheduler-orchestration.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AY_ID = 'ay-1';
const USER_ID = 'user-1';
const RUN_ID = 'run-1';

const mockTx = {
  schedulingRun: {
    create: jest.fn(),
    update: jest.fn(),
  },
  schedulePeriodTemplate: { findMany: jest.fn().mockResolvedValue([]) },
  schedule: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
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

// Mock validateSchedule from @school/shared
jest.mock('@school/shared', () => ({
  validateSchedule: jest.fn().mockReturnValue({
    violations: [],
    health_score: 100,
    summary: { tier1: 0, tier2: 0, tier3: 0 },
    cell_violations: {},
  }),
}));

describe('SchedulerOrchestrationService', () => {
  let service: SchedulerOrchestrationService;
  let mockQueue: { add: jest.Mock };
  let mockPrisma: {
    yearGroup: { findMany: jest.Mock };
    schedulePeriodTemplate: { findMany: jest.Mock };
    curriculumRequirement: { findMany: jest.Mock };
    teacherCompetency: { findMany: jest.Mock };
    staffAvailability: { findMany: jest.Mock };
    staffSchedulingPreference: { findMany: jest.Mock };
    teacherSchedulingConfig: { findMany: jest.Mock };
    room: { findMany: jest.Mock };
    roomClosure: { findMany: jest.Mock };
    breakGroup: { findMany: jest.Mock };
    schedule: { findMany: jest.Mock };
    classEnrolment: { findMany: jest.Mock };
    tenantSetting: { findFirst: jest.Mock };
    staffProfile: { findMany: jest.Mock };
    academicYear: { findFirst: jest.Mock };
    schedulingRun: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    mockPrisma = {
      yearGroup: { findMany: jest.fn().mockResolvedValue([]) },
      schedulePeriodTemplate: { findMany: jest.fn().mockResolvedValue([]) },
      curriculumRequirement: { findMany: jest.fn().mockResolvedValue([]) },
      teacherCompetency: { findMany: jest.fn().mockResolvedValue([]) },
      staffAvailability: { findMany: jest.fn().mockResolvedValue([]) },
      staffSchedulingPreference: { findMany: jest.fn().mockResolvedValue([]) },
      teacherSchedulingConfig: { findMany: jest.fn().mockResolvedValue([]) },
      room: { findMany: jest.fn().mockResolvedValue([]) },
      roomClosure: { findMany: jest.fn().mockResolvedValue([]) },
      breakGroup: { findMany: jest.fn().mockResolvedValue([]) },
      schedule: { findMany: jest.fn().mockResolvedValue([]) },
      classEnrolment: { findMany: jest.fn().mockResolvedValue([]) },
      tenantSetting: { findFirst: jest.fn().mockResolvedValue(null) },
      staffProfile: { findMany: jest.fn().mockResolvedValue([]) },
      academicYear: { findFirst: jest.fn().mockResolvedValue(null) },
      schedulingRun: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    mockTx.schedulingRun.create.mockReset();
    mockTx.schedulingRun.update.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerOrchestrationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('scheduling'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<SchedulerOrchestrationService>(SchedulerOrchestrationService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── checkPrerequisites ──────────────────────────────────────────────────────

  describe('checkPrerequisites', () => {
    it('should return ready=false when no year groups have active classes', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      expect(result.missing).toContain('No year groups have active classes for this academic year');
    });

    it('should return ready=true when all prerequisites are met', async () => {
      // Year groups with classes
      mockPrisma.yearGroup.findMany.mockResolvedValue([{ id: 'yg-1', name: 'Year 1' }]);
      // Period grid exists (shared)
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([{ year_group_id: null }]);
      // Curriculum requirements exist for yg-1
      mockPrisma.curriculumRequirement.findMany.mockResolvedValue([
        {
          year_group_id: 'yg-1',
          subject_id: 'sub-1',
          subject: { name: 'Math' },
          year_group: { name: 'Year 1' },
        },
      ]);
      // Teacher competency covers that subject+year
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        { subject_id: 'sub-1', year_group_id: 'yg-1' },
      ]);
      // No pinned entries
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      expect(result.ready).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should report missing period grid for a year group', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([{ id: 'yg-1', name: 'Year 1' }]);
      // No period templates at all
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockPrisma.curriculumRequirement.findMany.mockResolvedValue([
        {
          year_group_id: 'yg-1',
          subject_id: 'sub-1',
          subject: { name: 'Math' },
          year_group: { name: 'Year 1' },
        },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        { subject_id: 'sub-1', year_group_id: 'yg-1' },
      ]);
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      expect(result.missing).toEqual(
        expect.arrayContaining([expect.stringContaining('No period grid configured')]),
      );
    });

    it('should report missing curriculum requirements', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([{ id: 'yg-1', name: 'Year 1' }]);
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([{ year_group_id: null }]);
      // No curriculum requirements
      mockPrisma.curriculumRequirement.findMany.mockResolvedValue([]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      expect(result.missing).toEqual(
        expect.arrayContaining([expect.stringContaining('No curriculum requirements defined')]),
      );
    });

    it('should detect pinned entry teacher double-booking', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      mockPrisma.schedule.findMany.mockResolvedValue([
        {
          id: 'pin-1',
          teacher_staff_id: 'teacher-1',
          room_id: 'room-1',
          weekday: 1,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T10:00:00Z'),
        },
        {
          id: 'pin-2',
          teacher_staff_id: 'teacher-1',
          room_id: 'room-2',
          weekday: 1,
          start_time: new Date('1970-01-01T09:30:00Z'),
          end_time: new Date('1970-01-01T10:30:00Z'),
        },
      ]);

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      expect(result.missing).toEqual(
        expect.arrayContaining([expect.stringContaining('teacher double-booking')]),
      );
    });
  });

  // ─── triggerSolverRun ────────────────────────────────────────────────────────

  describe('triggerSolverRun', () => {
    it('should throw NotFoundException when academic year does not exist', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      await expect(service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when prerequisites are not met', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      // No year groups => prerequisites fail
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await expect(service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException when a run is already active', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      // Prerequisites pass
      mockPrisma.yearGroup.findMany.mockResolvedValue([{ id: 'yg-1', name: 'Y1' }]);
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([{ year_group_id: null }]);
      mockPrisma.curriculumRequirement.findMany.mockResolvedValue([
        {
          year_group_id: 'yg-1',
          subject_id: 's1',
          subject: { name: 'M' },
          year_group: { name: 'Y1' },
        },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        { subject_id: 's1', year_group_id: 'yg-1' },
      ]);
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      // Active run exists
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: 'existing-run',
        status: 'running',
      });

      await expect(service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── discardRun ──────────────────────────────────────────────────────────────

  describe('discardRun', () => {
    it('should discard a completed run', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({ id: RUN_ID, status: 'completed' });
      mockTx.schedulingRun.update.mockResolvedValue({ id: RUN_ID, status: 'discarded' });

      const result = await service.discardRun(TENANT_ID, RUN_ID);

      expect(result.id).toBe(RUN_ID);
      expect(result.status).toBe('discarded');
    });

    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      await expect(service.discardRun(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when run is not completed', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({ id: RUN_ID, status: 'running' });

      await expect(service.discardRun(TENANT_ID, RUN_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── listRuns ────────────────────────────────────────────────────────────────

  describe('listRuns', () => {
    it('should return paginated runs', async () => {
      const runs = [
        {
          id: RUN_ID,
          mode: 'auto',
          status: 'completed',
          hard_constraint_violations: 0,
          soft_preference_score: null,
          soft_preference_max: null,
          entries_generated: 50,
          entries_pinned: 0,
          entries_unassigned: 0,
          solver_duration_ms: 5000,
          solver_seed: null,
          failure_reason: null,
          created_by_user_id: USER_ID,
          applied_by_user_id: null,
          applied_at: null,
          created_at: new Date('2026-03-01T10:00:00Z'),
          updated_at: new Date('2026-03-01T10:05:00Z'),
        },
      ];
      mockPrisma.schedulingRun.findMany.mockResolvedValue(runs);
      mockPrisma.schedulingRun.count.mockResolvedValue(1);

      const result = await service.listRuns(TENANT_ID, AY_ID, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      // Dates should be formatted
      expect(result.data[0]!['created_at']).toBe('2026-03-01T10:00:00.000Z');
    });

    it('should return empty when no runs exist', async () => {
      mockPrisma.schedulingRun.findMany.mockResolvedValue([]);
      mockPrisma.schedulingRun.count.mockResolvedValue(0);

      const result = await service.listRuns(TENANT_ID, AY_ID, 1, 20);

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  // ─── getRun ──────────────────────────────────────────────────────────────────

  describe('getRun', () => {
    it('should return a single run', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        solver_seed: null,
        soft_preference_score: null,
        soft_preference_max: null,
        created_at: new Date('2026-03-01T10:00:00Z'),
        updated_at: new Date('2026-03-01T10:05:00Z'),
        applied_at: null,
      });

      const result = await service.getRun(TENANT_ID, RUN_ID);

      expect(result['id']).toBe(RUN_ID);
    });

    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      await expect(service.getRun(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getRunStatus ────────────────────────────────────────────────────────────

  describe('getRunStatus', () => {
    it('should return run status', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'running',
        entries_generated: null,
        entries_unassigned: null,
        solver_duration_ms: null,
        failure_reason: null,
        updated_at: new Date('2026-03-01T10:05:00Z'),
      });

      const result = await service.getRunStatus(TENANT_ID, RUN_ID);

      expect(result.id).toBe(RUN_ID);
      expect(result.status).toBe('running');
      expect(result.updated_at).toBe('2026-03-01T10:05:00.000Z');
    });

    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      await expect(service.getRunStatus(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── applyRun ────────────────────────────────────────────────────────────────

  describe('applyRun', () => {
    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      await expect(service.applyRun(TENANT_ID, 'nonexistent', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when run is not completed', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'running',
      });

      await expect(service.applyRun(TENANT_ID, RUN_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when run has no result data', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        result_json: null,
        config_snapshot: null,
      });

      await expect(service.applyRun(TENANT_ID, RUN_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when tier-1 violations exist', async () => {
      const { validateSchedule } = jest.requireMock('@school/shared');
      validateSchedule.mockReturnValueOnce({
        violations: [{ tier: 1, message: 'Hard constraint violation' }],
        summary: { tier1: 1, tier2: 0, tier3: 0 },
      });

      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        result_json: { entries: [{ id: 'entry-1', is_supervision: false }] },
        config_snapshot: { year_groups: [] },
        academic_year_id: AY_ID,
      });

      await expect(service.applyRun(TENANT_ID, RUN_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return tier-2 violations when they exist and no acknowledgement', async () => {
      const { validateSchedule } = jest.requireMock('@school/shared');
      validateSchedule.mockReturnValueOnce({
        violations: [
          { tier: 2, message: 'Soft preference violation 1' },
          { tier: 2, message: 'Soft preference violation 2' },
        ],
        summary: { tier1: 0, tier2: 2, tier3: 0 },
      });

      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        result_json: { entries: [{ id: 'entry-1', is_supervision: false }] },
        config_snapshot: { year_groups: [] },
        academic_year_id: AY_ID,
      });

      const result = await service.applyRun(TENANT_ID, RUN_ID, USER_ID);

      expect(result.requires_acknowledgement).toBe(true);
      expect(result.tier2_count).toBe(2);
    });

    it('should apply run successfully with acknowledged violations', async () => {
      const { validateSchedule } = jest.requireMock('@school/shared');
      validateSchedule.mockReturnValueOnce({
        violations: [{ tier: 2, message: 'Soft preference' }],
        summary: { tier1: 0, tier2: 1, tier3: 0 },
      });

      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        result_json: {
          entries: [
            {
              id: 'entry-1',
              class_id: 'class-1',
              weekday: 1,
              period_order: 1,
              year_group_id: 'yg-1',
              is_supervision: false,
            },
          ],
        },
        config_snapshot: { year_groups: [{ year_group_id: 'yg-1' }] },
        academic_year_id: AY_ID,
      });

      mockTx.schedulePeriodTemplate.findMany.mockResolvedValue([
        {
          weekday: 1,
          period_order: 1,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T10:00:00Z'),
          year_group_id: 'yg-1',
        },
      ]);

      mockTx.schedule.findMany.mockResolvedValue([]);
      mockTx.schedule.create.mockResolvedValue({ id: 'new-schedule' });
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: new Date(),
      });

      const result = await service.applyRun(TENANT_ID, RUN_ID, USER_ID, true);

      expect(result.status).toBe('applied');
      expect(result.entries_applied).toBe(1);
    });
  });

  // ─── assembleSolverInput ─────────────────────────────────────────────────────

  describe('assembleSolverInput', () => {
    it('should assemble complete solver input with all data', async () => {
      // Setup mocks for all parallel queries
      mockPrisma.yearGroup.findMany.mockResolvedValue([
        {
          id: 'yg-1',
          name: 'Year 1',
          classes: [
            { id: 'class-1', name: '1A', _count: { class_enrolments: 25 } },
            { id: 'class-2', name: '1B', _count: { class_enrolments: 24 } },
          ],
        },
      ]);

      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
        {
          weekday: 1,
          period_order: 1,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T10:00:00Z'),
          schedule_period_type: 'teaching',
          supervision_mode: 'teacher',
          break_group_id: null,
          year_group_id: 'yg-1',
        },
        {
          weekday: 1,
          period_order: 2,
          start_time: new Date('1970-01-01T10:00:00Z'),
          end_time: new Date('1970-01-01T11:00:00Z'),
          schedule_period_type: 'teaching',
          supervision_mode: 'teacher',
          break_group_id: null,
          year_group_id: null,
        }, // shared
      ]);

      mockPrisma.curriculumRequirement.findMany.mockResolvedValue([
        {
          id: 'cr-1',
          year_group_id: 'yg-1',
          subject_id: 'sub-1',
          min_periods_per_week: 4,
          max_periods_per_day: 2,
          preferred_periods_per_week: 5,
          requires_double_period: false,
          double_period_count: 0,
          subject: { name: 'Math' },
        },
      ]);

      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        {
          staff_profile_id: 'teacher-1',
          subject_id: 'sub-1',
          year_group_id: 'yg-1',
          is_primary: true,
        },
      ]);

      mockPrisma.staffAvailability.findMany.mockResolvedValue([
        {
          staff_profile_id: 'teacher-1',
          weekday: 1,
          available_from: new Date('1970-01-01T08:00:00Z'),
          available_to: new Date('1970-01-01T16:00:00Z'),
        },
      ]);

      mockPrisma.staffSchedulingPreference.findMany.mockResolvedValue([]);

      mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue([
        {
          staff_profile_id: 'teacher-1',
          max_periods_per_week: 20,
          max_periods_per_day: 5,
          max_supervision_duties_per_week: 3,
        },
      ]);

      mockPrisma.room.findMany.mockResolvedValue([
        { id: 'room-1', room_type: 'classroom', capacity: 30, is_exclusive: false },
      ]);

      mockPrisma.roomClosure.findMany.mockResolvedValue([
        { room_id: 'room-1', date_from: new Date('2026-06-01'), date_to: new Date('2026-06-05') },
      ]);

      mockPrisma.breakGroup.findMany.mockResolvedValue([
        {
          id: 'bg-1',
          name: 'Morning Break',
          required_supervisor_count: 2,
          year_groups: [{ year_group_id: 'yg-1' }],
        },
      ]);

      mockPrisma.schedule.findMany.mockResolvedValue([
        {
          id: 'pinned-1',
          class_id: 'class-1',
          weekday: 1,
          period_order: 1,
          room_id: 'room-1',
          teacher_staff_id: 'teacher-1',
          class_entity: { year_group_id: 'yg-1', subject_id: 'sub-1' },
        },
      ]);

      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        { class_id: 'class-1', student_id: 'student-1' },
        { class_id: 'class-2', student_id: 'student-1' },
        { class_id: 'class-1', student_id: 'student-2' },
      ]);

      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: {
          scheduling: {
            maxSolverDurationSeconds: 180,
            preferenceWeights: { low: 1, medium: 2, high: 5 },
            globalSoftWeights: {
              evenSubjectSpread: 3,
              minimiseTeacherGaps: 2,
              roomConsistency: 1,
              workloadBalance: 2,
              breakDutyBalance: 1,
            },
          },
        },
      });

      mockPrisma.staffProfile.findMany.mockResolvedValue([
        { id: 'teacher-1', user: { first_name: 'John', last_name: 'Doe' } },
      ]);

      const result = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(result.year_groups).toHaveLength(1);
      expect(result.year_groups[0]!.sections).toHaveLength(2);
      expect(result.year_groups[0]!.period_grid).toHaveLength(2);
      expect(result.curriculum).toHaveLength(1);
      expect(result.teachers).toHaveLength(1);
      expect(result.teachers[0]!.competencies).toHaveLength(1);
      expect(result.rooms).toHaveLength(1);
      expect(result.room_closures).toHaveLength(1);
      expect(result.break_groups).toHaveLength(1);
      expect(result.pinned_entries).toHaveLength(1);
      expect(result.student_overlaps).toHaveLength(1);
      expect(result.settings.max_solver_duration_seconds).toBe(180);
      expect(result.settings.preference_weights.high).toBe(5);
    });

    it('should handle empty data gracefully', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockPrisma.curriculumRequirement.findMany.mockResolvedValue([]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      mockPrisma.staffAvailability.findMany.mockResolvedValue([]);
      mockPrisma.staffSchedulingPreference.findMany.mockResolvedValue([]);
      mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue([]);
      mockPrisma.room.findMany.mockResolvedValue([]);
      mockPrisma.roomClosure.findMany.mockResolvedValue([]);
      mockPrisma.breakGroup.findMany.mockResolvedValue([]);
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      const result = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(result.year_groups).toHaveLength(0);
      expect(result.teachers).toHaveLength(0);
      expect(result.student_overlaps).toHaveLength(0);
      expect(result.settings.max_solver_duration_seconds).toBe(120); // default
    });

    it('should handle students in multiple classes', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([
        {
          id: 'yg-1',
          name: 'Year 1',
          classes: [{ id: 'class-1', name: '1A', _count: { class_enrolments: 3 } }],
        },
      ]);
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
        {
          weekday: 1,
          period_order: 1,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T10:00:00Z'),
          schedule_period_type: 'teaching',
          supervision_mode: 'teacher',
          break_group_id: null,
          year_group_id: 'yg-1',
        },
      ]);
      mockPrisma.curriculumRequirement.findMany.mockResolvedValue([]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      mockPrisma.staffAvailability.findMany.mockResolvedValue([]);
      mockPrisma.staffSchedulingPreference.findMany.mockResolvedValue([]);
      mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue([]);
      mockPrisma.room.findMany.mockResolvedValue([]);
      mockPrisma.roomClosure.findMany.mockResolvedValue([]);
      mockPrisma.breakGroup.findMany.mockResolvedValue([]);
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      // Student 1 in both class-1 and class-2
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        { class_id: 'class-1', student_id: 'student-1' },
        { class_id: 'class-2', student_id: 'student-1' },
        { class_id: 'class-1', student_id: 'student-2' },
        { class_id: 'class-3', student_id: 'student-2' },
      ]);
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      const result = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(result.student_overlaps.length).toBeGreaterThan(0);
    });
  });

  // ─── triggerSolverRun with settings ──────────────────────────────────────────

  describe('triggerSolverRun with settings', () => {
    beforeEach(() => {
      // Setup prerequisites
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      mockPrisma.yearGroup.findMany.mockResolvedValue([
        {
          id: 'yg-1',
          name: 'Year 1',
          classes: [{ id: 'class-1', name: '1A', _count: { class_enrolments: 20 } }],
        },
      ]);
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
        {
          weekday: 1,
          period_order: 1,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T10:00:00Z'),
          schedule_period_type: 'teaching',
          supervision_mode: 'teacher',
          break_group_id: null,
          year_group_id: null,
        },
      ]);
      mockPrisma.curriculumRequirement.findMany.mockResolvedValue([
        {
          year_group_id: 'yg-1',
          subject_id: 's1',
          min_periods_per_week: 4,
          max_periods_per_day: 2,
          preferred_periods_per_week: 5,
          requires_double_period: false,
          double_period_count: 0,
          subject: { name: 'Math' },
          year_group: { name: 'Year 1' },
        },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        { subject_id: 's1', year_group_id: 'yg-1' },
      ]);
      mockPrisma.schedule.findMany.mockResolvedValue([]);
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      // Minimal solver input data
      mockPrisma.staffProfile.findMany.mockResolvedValue([]);
      mockPrisma.staffAvailability.findMany.mockResolvedValue([]);
      mockPrisma.staffSchedulingPreference.findMany.mockResolvedValue([]);
      mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue([]);
      mockPrisma.room.findMany.mockResolvedValue([]);
      mockPrisma.roomClosure.findMany.mockResolvedValue([]);
      mockPrisma.breakGroup.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      mockTx.schedulingRun.create.mockResolvedValue({
        id: RUN_ID,
        status: 'queued',
        created_at: new Date(),
      });
    });

    it('should apply solver_seed from settings', async () => {
      await service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID, { solver_seed: 12345 });

      expect(mockTx.schedulingRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            solver_seed: BigInt(12345),
          }),
        }),
      );
    });

    it('should apply max_solver_duration_seconds from settings', async () => {
      await service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID, {
        max_solver_duration_seconds: 300,
      });

      const createCall = mockTx.schedulingRun.create.mock.calls[0][0];
      const configSnapshot = createCall.data.config_snapshot as {
        settings: { max_solver_duration_seconds: number };
      };
      expect(configSnapshot.settings.max_solver_duration_seconds).toBe(300);
    });

    it('should set mode to hybrid when pinned entries exist', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([
        { id: 'pinned-1', class_id: 'class-1', weekday: 1, period_order: 1, is_pinned: true },
      ]);

      await service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID);

      expect(mockTx.schedulingRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mode: 'hybrid',
          }),
        }),
      );
    });

    it('should set mode to auto when no pinned entries exist', async () => {
      mockPrisma.schedule.findMany.mockResolvedValue([]);

      await service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID);

      expect(mockTx.schedulingRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mode: 'auto',
          }),
        }),
      );
    });
  });
});
