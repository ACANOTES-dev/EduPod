/**
 * Additional branch coverage for SchedulerOrchestrationService.
 * Targets: applyRun tier1/tier2 violations, triggerSolverRun settings overrides,
 * assembleSolverInput data transformations, formatRunPartial edge cases.
 */
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { ConfigurationReadFacade } from '../configuration/configuration-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { FeasibilityService } from '../scheduling-runs/feasibility/feasibility.service';
import { SchedulingRunsReadFacade } from '../scheduling-runs/scheduling-runs-read.facade';
import { StaffAvailabilityReadFacade } from '../staff-availability/staff-availability-read.facade';
import { StaffPreferencesReadFacade } from '../staff-preferences/staff-preferences-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { SchedulerOrchestrationService } from './scheduler-orchestration.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AY_ID = 'ay-1';
const USER_ID = 'user-1';
const RUN_ID = 'run-1';

const mockTx = {
  schedulingRun: { create: jest.fn(), update: jest.fn() },
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

const mockValidateSchedule = jest.fn().mockReturnValue({
  violations: [],
  health_score: 100,
  summary: { tier1: 0, tier2: 0, tier3: 0 },
  cell_violations: {},
});

jest.mock('@school/shared/scheduler', () => ({
  validateSchedule: (...args: unknown[]) => mockValidateSchedule(...args),
}));

function buildFacadeMocks() {
  return {
    academicReadFacade: {
      findCurrentYear: jest.fn().mockResolvedValue(null),
      findCurrentYearId: jest.fn().mockResolvedValue('year-1'),
      findYearById: jest.fn().mockResolvedValue(null),
      findYearByIdOrThrow: jest.fn().mockResolvedValue('year-1'),
      findSubjectByIdOrThrow: jest.fn().mockResolvedValue('subject-1'),
      findYearGroupByIdOrThrow: jest.fn().mockResolvedValue('yg-1'),
      findYearGroupsWithActiveClasses: jest.fn().mockResolvedValue([]),
      findYearGroupsWithClassesAndCounts: jest.fn().mockResolvedValue([]),
      findAllYearGroups: jest.fn().mockResolvedValue([]),
      findSubjectsByIdsWithOrder: jest.fn().mockResolvedValue([]),
      findSubjectById: jest.fn().mockResolvedValue(null),
      findYearGroupById: jest.fn().mockResolvedValue(null),
      findPeriodById: jest.fn().mockResolvedValue(null),
    },
    schedulingRunsReadFacade: {
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
    schedulesReadFacade: {
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
  };
}

describe('SchedulerOrchestrationService — branch coverage', () => {
  let service: SchedulerOrchestrationService;
  let module: TestingModule;
  let facades: ReturnType<typeof buildFacadeMocks>;
  let mockQueue: { add: jest.Mock };
  let mockPrisma: {
    schedulePeriodTemplate: { findMany: jest.Mock };
    curriculumRequirement: { findMany: jest.Mock };
    classSchedulingRequirement: { findMany: jest.Mock };
    classSubjectRequirement: { findMany: jest.Mock };
    classSubjectGradeConfig: { findMany: jest.Mock };
    teacherCompetency: { findMany: jest.Mock };
    teacherSchedulingConfig: { findMany: jest.Mock };
    breakGroup: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    facades = buildFacadeMocks();

    mockPrisma = {
      schedulePeriodTemplate: { findMany: jest.fn().mockResolvedValue([]) },
      curriculumRequirement: { findMany: jest.fn().mockResolvedValue([]) },
      classSchedulingRequirement: { findMany: jest.fn().mockResolvedValue([]) },
      classSubjectRequirement: { findMany: jest.fn().mockResolvedValue([]) },
      classSubjectGradeConfig: { findMany: jest.fn().mockResolvedValue([]) },
      teacherCompetency: { findMany: jest.fn().mockResolvedValue([]) },
      teacherSchedulingConfig: { findMany: jest.fn().mockResolvedValue([]) },
      breakGroup: { findMany: jest.fn().mockResolvedValue([]) },
    };

    mockTx.schedulingRun.create.mockReset();
    mockTx.schedulingRun.update.mockReset();
    mockTx.schedule.findMany.mockResolvedValue([]);
    mockTx.schedulePeriodTemplate.findMany.mockResolvedValue([]);
    mockValidateSchedule.mockReturnValue({
      violations: [],
      health_score: 100,
      summary: { tier1: 0, tier2: 0, tier3: 0 },
      cell_violations: {},
    });

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: AcademicReadFacade, useValue: facades.academicReadFacade },
        {
          provide: ClassesReadFacade,
          useValue: {
            findById: jest.fn(),
            existsOrThrow: jest.fn(),
            findEnrolledStudentIds: jest.fn(),
            countEnrolledStudents: jest.fn(),
            findOtherClassEnrolmentsForStudents: jest.fn(),
            findByAcademicYear: jest.fn(),
            findByYearGroup: jest.fn(),
            findIdsByAcademicYear: jest.fn(),
            countByAcademicYear: jest.fn(),
            findClassesWithoutTeachers: jest.fn(),
            findClassIdsForStudent: jest.fn(),
            findEnrolmentPairsForAcademicYear: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ConfigurationReadFacade,
          useValue: {
            findSettings: jest.fn().mockResolvedValue(null),
            findSettingsJson: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: RoomsReadFacade,
          useValue: {
            findById: jest.fn(),
            existsOrThrow: jest.fn(),
            exists: jest.fn(),
            findActiveRooms: jest.fn().mockResolvedValue([]),
            findActiveRoomBasics: jest.fn(),
            countActiveRooms: jest.fn(),
            findAllClosures: jest.fn().mockResolvedValue([]),
            findClosuresPaginated: jest.fn(),
            findClosureById: jest.fn(),
          },
        },
        { provide: SchedulesReadFacade, useValue: facades.schedulesReadFacade },
        { provide: SchedulingRunsReadFacade, useValue: facades.schedulingRunsReadFacade },
        {
          provide: StaffAvailabilityReadFacade,
          useValue: {
            findByAcademicYear: jest.fn().mockResolvedValue([]),
            findByStaffIds: jest.fn(),
            findByWeekday: jest.fn(),
          },
        },
        {
          provide: StaffPreferencesReadFacade,
          useValue: {
            findByAcademicYear: jest.fn().mockResolvedValue([]),
            findByStaffProfile: jest.fn(),
          },
        },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            findById: jest.fn(),
            findByIds: jest.fn().mockResolvedValue([]),
            findByUserId: jest.fn(),
            findActiveStaff: jest.fn(),
            existsOrThrow: jest.fn(),
            resolveProfileId: jest.fn(),
          },
        },
        SchedulerOrchestrationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('scheduling'), useValue: mockQueue },
        {
          provide: FeasibilityService,
          useValue: {
            runFeasibilitySweep: jest.fn().mockResolvedValue({
              overall_feasibility: 'feasible',
              teacher_load: [],
              room_load: [],
              class_contact_hours: [],
              curriculum_coverage: [],
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SchedulerOrchestrationService>(SchedulerOrchestrationService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── applyRun — tier1 violations ─────────────────────────────────────────

  describe('SchedulerOrchestrationService — applyRun tier1 violations', () => {
    it('should throw BadRequestException for tier1 violations', async () => {
      facades.schedulingRunsReadFacade.findById.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: { entries: [], unassigned: [] },
        config_snapshot: { year_groups: [] },
      });

      mockValidateSchedule.mockReturnValue({
        violations: [{ tier: 1, type: 'hard', message: 'Teacher double-booked' }],
        health_score: 0,
        summary: { tier1: 1, tier2: 0, tier3: 0 },
        cell_violations: {},
      });

      await expect(service.applyRun(TENANT_ID, RUN_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── applyRun — tier2 violations requiring acknowledgement ────────────────

  describe('SchedulerOrchestrationService — applyRun tier2 acknowledgement', () => {
    it('should return acknowledgement prompt for tier2 violations', async () => {
      facades.schedulingRunsReadFacade.findById.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: { entries: [], unassigned: [] },
        config_snapshot: { year_groups: [] },
      });

      mockValidateSchedule.mockReturnValue({
        violations: [{ tier: 2, type: 'soft', message: 'Teacher gap' }],
        health_score: 85,
        summary: { tier1: 0, tier2: 1, tier3: 0 },
        cell_violations: {},
      });

      const result = await service.applyRun(TENANT_ID, RUN_ID, USER_ID);

      expect(result.requires_acknowledgement).toBe(true);
      expect(result.tier2_count).toBe(1);
    });

    it('should proceed when tier2 violations are acknowledged', async () => {
      facades.schedulingRunsReadFacade.findById.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: { entries: [], unassigned: [] },
        config_snapshot: { year_groups: [] },
      });

      mockValidateSchedule.mockReturnValue({
        violations: [{ tier: 2, type: 'soft', message: 'Teacher gap' }],
        health_score: 85,
        summary: { tier1: 0, tier2: 1, tier3: 0 },
        cell_violations: {},
      });

      mockTx.schedule.findMany.mockResolvedValue([]);
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: new Date(),
      });

      const result = await service.applyRun(TENANT_ID, RUN_ID, USER_ID, true);

      expect(result.status).toBe('applied');
    });
  });

  // ─── applyRun — no config_snapshot skips validation ───────────────────────

  describe('SchedulerOrchestrationService — applyRun no config snapshot', () => {
    it('should skip validation when config_snapshot is null', async () => {
      facades.schedulingRunsReadFacade.findById.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: { entries: [], unassigned: [] },
        config_snapshot: null,
      });

      mockTx.schedule.findMany.mockResolvedValue([]);
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: new Date(),
      });

      const result = await service.applyRun(TENANT_ID, RUN_ID, USER_ID);

      expect(result.status).toBe('applied');
      expect(mockValidateSchedule).not.toHaveBeenCalled();
    });
  });

  // ─── applyRun — entries with start_time/end_time vs period template ───────

  describe('SchedulerOrchestrationService — applyRun entry time resolution', () => {
    it('should use entry start_time/end_time when provided', async () => {
      facades.schedulingRunsReadFacade.findById.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: {
          entries: [
            {
              class_id: 'c1',
              weekday: 1,
              period_order: 1,
              start_time: '09:00',
              end_time: '10:00',
              teacher_staff_id: 't1',
              room_id: 'r1',
              is_pinned: false,
              is_supervision: false,
              year_group_id: 'yg-1',
            },
          ],
          unassigned: [],
        },
        config_snapshot: null,
      });

      mockTx.schedule.findMany.mockResolvedValue([]);
      mockTx.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: new Date(),
      });

      const result = await service.applyRun(TENANT_ID, RUN_ID, USER_ID);

      expect(result.entries_applied).toBe(1);
      expect(mockTx.schedule.create).toHaveBeenCalled();
    });

    it('should skip supervision entries', async () => {
      facades.schedulingRunsReadFacade.findById.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: {
          entries: [
            {
              class_id: 'c1',
              weekday: 1,
              period_order: 1,
              start_time: '09:00',
              end_time: '10:00',
              teacher_staff_id: 't1',
              room_id: 'r1',
              is_pinned: false,
              is_supervision: true,
              year_group_id: 'yg-1',
            },
          ],
          unassigned: [],
        },
        config_snapshot: null,
      });

      mockTx.schedule.findMany.mockResolvedValue([]);
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: new Date(),
      });

      const result = await service.applyRun(TENANT_ID, RUN_ID, USER_ID);

      expect(result.entries_applied).toBe(0);
      expect(mockTx.schedule.create).not.toHaveBeenCalled();
    });

    it('should end-date schedules with attendance sessions instead of deleting', async () => {
      facades.schedulingRunsReadFacade.findById.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: { entries: [], unassigned: [] },
        config_snapshot: null,
      });

      mockTx.schedule.findMany.mockResolvedValue([
        { id: 'sched-1', _count: { attendance_sessions: 3 } },
        { id: 'sched-2', _count: { attendance_sessions: 0 } },
      ]);
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: new Date(),
      });

      await service.applyRun(TENANT_ID, RUN_ID, USER_ID);

      // sched-1 should be end-dated
      expect(mockTx.schedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sched-1' },
          data: expect.objectContaining({ effective_end_date: expect.any(Date) }),
        }),
      );
      // sched-2 should be deleted
      expect(mockTx.schedule.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sched-2' } }),
      );
    });
  });

  // ─── triggerSolverRun — settings overrides ────────────────────────────────

  describe('SchedulerOrchestrationService — triggerSolverRun settings overrides', () => {
    function setupPrerequisites() {
      facades.academicReadFacade.findYearGroupsWithActiveClasses.mockResolvedValue([
        { id: 'yg-1', name: 'Y1' },
      ]);
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
        {
          year_group_id: null,
          weekday: 0,
          period_order: 1,
          start_time: new Date('1970-01-01T08:00:00Z'),
          end_time: new Date('1970-01-01T09:00:00Z'),
          schedule_period_type: 'teaching',
          supervision_mode: null,
          break_group_id: null,
        },
      ]);
      mockPrisma.curriculumRequirement.findMany.mockResolvedValue([
        {
          year_group_id: 'yg-1',
          subject_id: 's1',
          subject: { name: 'M' },
          year_group: { name: 'Y1' },
        },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        { subject_id: 's1', year_group_id: 'yg-1', staff_profile_id: 't1' },
      ]);
      facades.schedulesReadFacade.findPinnedEntries.mockResolvedValue([]);
      facades.schedulingRunsReadFacade.findActiveRun.mockResolvedValue(null);

      facades.academicReadFacade.findYearGroupsWithClassesAndCounts.mockResolvedValue([
        {
          id: 'yg-1',
          name: 'Y1',
          classes: [{ id: 'c1', name: 'C1', _count: { class_enrolments: 10 } }],
        },
      ]);

      mockTx.schedulingRun.create.mockResolvedValue({
        id: RUN_ID,
        status: 'queued',
        created_at: new Date(),
      });
    }

    it('should set mode to hybrid when pinned entries exist', async () => {
      setupPrerequisites();
      facades.schedulesReadFacade.findPinnedEntries.mockResolvedValue([
        {
          id: 'pin-1',
          class_id: 'c1',
          room_id: 'r1',
          teacher_staff_id: 't1',
          weekday: 1,
          period_order: 1,
          class_entity: { subject_id: 's1', year_group_id: 'yg-1' },
        },
      ]);

      const result = await service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID);

      expect(result.mode).toBe('hybrid');
    });

    it('should apply solver_seed override', async () => {
      setupPrerequisites();

      await service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID, {
        academic_year_id: AY_ID,
        max_solver_duration_seconds: 120,
        solver_seed: 42,
      });

      expect(mockTx.schedulingRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            solver_seed: BigInt(42),
          }),
        }),
      );
    });

    it('should apply max_solver_duration_seconds override', async () => {
      setupPrerequisites();

      const result = await service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID, {
        academic_year_id: AY_ID,
        max_solver_duration_seconds: 300,
      });

      expect(result.status).toBe('queued');
    });
  });
});
