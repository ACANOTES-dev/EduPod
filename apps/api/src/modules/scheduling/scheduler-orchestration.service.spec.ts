import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { ConfigurationReadFacade } from '../configuration/configuration-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
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

// Mock validateSchedule from @school/shared/scheduler
jest.mock('@school/shared/scheduler', () => ({
  validateSchedule: jest.fn().mockReturnValue({
    violations: [],
    health_score: 100,
    summary: { tier1: 0, tier2: 0, tier3: 0 },
    cell_violations: {},
  }),
}));

describe('SchedulerOrchestrationService', () => {
  let service: SchedulerOrchestrationService;
  let module: TestingModule;
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

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        {
          provide: AcademicReadFacade,
          useValue: {
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
        },
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
          provide: ConfigurationReadFacade,
          useValue: {
            findSettings: jest.fn().mockResolvedValue(null),
            findSettingsJson: jest.fn().mockResolvedValue(null),
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
          provide: StaffPreferencesReadFacade,
          useValue: {
            findByAcademicYear: jest.fn().mockResolvedValue([]),
            findByStaffProfile: jest.fn().mockResolvedValue([]),
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
      // findYearGroupsWithActiveClasses returns [] by default from facade mock
      // findPinnedEntries returns [] by default from facade mock

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      expect(result.missing).toContain('No year groups have active classes for this academic year');
    });

    it('should return ready=true when all prerequisites are met', async () => {
      // Year groups with classes via facade
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearGroupsWithActiveClasses as jest.Mock).mockResolvedValue([
        { id: 'yg-1', name: 'Year 1' },
      ]);
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
      // No pinned entries via facade
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([]);

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      expect(result.ready).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should report missing period grid for a year group', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearGroupsWithActiveClasses as jest.Mock).mockResolvedValue([
        { id: 'yg-1', name: 'Year 1' },
      ]);
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
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([]);

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      expect(result.missing).toEqual(
        expect.arrayContaining([expect.stringContaining('No period grid configured')]),
      );
    });

    it('should report missing curriculum requirements', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearGroupsWithActiveClasses as jest.Mock).mockResolvedValue([
        { id: 'yg-1', name: 'Year 1' },
      ]);
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([{ year_group_id: null }]);
      // No curriculum requirements
      mockPrisma.curriculumRequirement.findMany.mockResolvedValue([]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([]);

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      expect(result.missing).toEqual(
        expect.arrayContaining([expect.stringContaining('No curriculum requirements defined')]),
      );
    });

    it('should detect pinned entry teacher double-booking', async () => {
      // findYearGroupsWithActiveClasses returns [] by default
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([
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
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearByIdOrThrow as jest.Mock).mockRejectedValue(
        new NotFoundException('Year not found'),
      );

      await expect(service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when prerequisites are not met', async () => {
      // findYearByIdOrThrow resolves by default (doesn't throw)
      // No year groups => prerequisites fail (findYearGroupsWithActiveClasses returns [] by default)

      await expect(service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException when a run is already active', async () => {
      // Prerequisites pass
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearGroupsWithActiveClasses as jest.Mock).mockResolvedValue([
        { id: 'yg-1', name: 'Y1' },
      ]);
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
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([]);
      // Active run exists
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findActiveRun as jest.Mock).mockResolvedValue({
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
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findStatusById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
      });
      mockTx.schedulingRun.update.mockResolvedValue({ id: RUN_ID, status: 'discarded' });

      const result = await service.discardRun(TENANT_ID, RUN_ID);

      expect(result.id).toBe(RUN_ID);
      expect(result.status).toBe('discarded');
    });

    it('should throw NotFoundException when run does not exist', async () => {
      // findStatusById returns null by default from mock

      await expect(service.discardRun(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when run is not completed', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findStatusById as jest.Mock).mockResolvedValue({ id: RUN_ID, status: 'running' });

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
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.listRuns as jest.Mock).mockResolvedValue({ data: runs, total: 1 });

      const result = await service.listRuns(TENANT_ID, AY_ID, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      // Dates should be formatted
      expect(result.data[0]!['created_at']).toBe('2026-03-01T10:00:00.000Z');
    });

    it('should return empty when no runs exist', async () => {
      // listRuns returns { data: [], total: 0 } by default from facade mock

      const result = await service.listRuns(TENANT_ID, AY_ID, 1, 20);

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  // ─── getRun ──────────────────────────────────────────────────────────────────

  describe('getRun', () => {
    it('should return a single run', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
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
      // findById returns null by default from facade mock

      await expect(service.getRun(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getRunStatus ────────────────────────────────────────────────────────────

  describe('getRunStatus', () => {
    it('should return run status', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
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
      // findById returns null by default from facade mock

      await expect(service.getRunStatus(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── applyRun ────────────────────────────────────────────────────────────────

  describe('applyRun', () => {
    it('should throw NotFoundException when run does not exist', async () => {
      // findById returns null by default from facade mock

      await expect(service.applyRun(TENANT_ID, 'nonexistent', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when run is not completed', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'running',
      });

      await expect(service.applyRun(TENANT_ID, RUN_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when run has no result data', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        result_json: null,
        config_snapshot: null,
      });

      await expect(service.applyRun(TENANT_ID, RUN_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when result_json.entries is not an array', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        result_json: { entries: 'not-an-array' },
        config_snapshot: null,
      });

      await expect(service.applyRun(TENANT_ID, RUN_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── listRuns — formatting edge cases ────────────────────────────────────

  describe('listRuns — formatting', () => {
    it('should handle solver_seed as bigint', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.listRuns as jest.Mock).mockResolvedValue({
        data: [
          {
            id: RUN_ID,
            solver_seed: BigInt(12345),
            soft_preference_score: null,
            soft_preference_max: null,
            created_at: new Date('2026-03-01'),
            updated_at: new Date('2026-03-01'),
            applied_at: null,
          },
        ],
        total: 1,
      });

      const result = await service.listRuns(TENANT_ID, AY_ID, 1, 20);

      expect(result.data[0]!['solver_seed']).toBe(12345);
    });

    it('should convert soft_preference_score to number', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.listRuns as jest.Mock).mockResolvedValue({
        data: [
          {
            id: RUN_ID,
            solver_seed: null,
            soft_preference_score: '80',
            soft_preference_max: '100',
            created_at: new Date('2026-03-01'),
            updated_at: new Date('2026-03-01'),
            applied_at: new Date('2026-03-02'),
          },
        ],
        total: 1,
      });

      const result = await service.listRuns(TENANT_ID, AY_ID, 1, 20);

      expect(result.data[0]!['soft_preference_score']).toBe(80);
      expect(result.data[0]!['soft_preference_max']).toBe(100);
      expect(result.data[0]!['applied_at']).toBe('2026-03-02T00:00:00.000Z');
    });

    it('should handle null soft_preference_score/max', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.listRuns as jest.Mock).mockResolvedValue({
        data: [
          {
            id: RUN_ID,
            solver_seed: null,
            soft_preference_score: null,
            soft_preference_max: null,
            created_at: '2026-03-01T00:00:00.000Z',
            updated_at: '2026-03-01T00:00:00.000Z',
            applied_at: null,
          },
        ],
        total: 1,
      });

      const result = await service.listRuns(TENANT_ID, AY_ID, 1, 20);

      expect(result.data[0]!['soft_preference_score']).toBeNull();
      expect(result.data[0]!['soft_preference_max']).toBeNull();
      // When dates are already strings, they pass through unchanged
      expect(result.data[0]!['created_at']).toBe('2026-03-01T00:00:00.000Z');
    });

    it('should pass through already-formatted date strings', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.listRuns as jest.Mock).mockResolvedValue({
        data: [
          {
            id: RUN_ID,
            solver_seed: undefined,
            soft_preference_score: null,
            soft_preference_max: null,
            created_at: 'already-string',
            updated_at: 'already-string',
            applied_at: null,
          },
        ],
        total: 1,
      });

      const result = await service.listRuns(TENANT_ID, AY_ID, 1, 20);

      expect(result.data[0]!['solver_seed']).toBeNull();
      expect(result.data[0]!['created_at']).toBe('already-string');
    });
  });

  // ─── checkPrerequisites — pinned entry edge cases ─────────────────────────

  describe('checkPrerequisites — pinned entry room double-booking', () => {
    it('should detect pinned entry room double-booking', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([
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
          teacher_staff_id: 'teacher-2',
          room_id: 'room-1',
          weekday: 1,
          start_time: new Date('1970-01-01T09:30:00Z'),
          end_time: new Date('1970-01-01T10:30:00Z'),
        },
      ]);

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      expect(result.missing).toEqual(
        expect.arrayContaining([expect.stringContaining('room double-booking')]),
      );
    });

    it('should not flag pinned entries on different weekdays', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearGroupsWithActiveClasses as jest.Mock).mockResolvedValue([
        { id: 'yg-1', name: 'Year 1' },
      ]);
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

      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([
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
          room_id: 'room-1',
          weekday: 2, // Different weekday
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T10:00:00Z'),
        },
      ]);

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      expect(result.ready).toBe(true);
    });

    it('should not flag pinned entries that do not overlap in time', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearGroupsWithActiveClasses as jest.Mock).mockResolvedValue([
        { id: 'yg-1', name: 'Year 1' },
      ]);
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

      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([
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
          room_id: 'room-1',
          weekday: 1,
          start_time: new Date('1970-01-01T10:00:00Z'), // Starts exactly when pin-1 ends
          end_time: new Date('1970-01-01T11:00:00Z'),
        },
      ]);

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      expect(result.ready).toBe(true);
    });

    it('should not flag overlapping pinned entries with different teachers and rooms', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([
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
          teacher_staff_id: 'teacher-2',
          room_id: 'room-2',
          weekday: 1,
          start_time: new Date('1970-01-01T09:30:00Z'),
          end_time: new Date('1970-01-01T10:30:00Z'),
        },
      ]);

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      // Missing year groups, but no pinned conflict
      const pinConflicts = result.missing.filter((m) => m.includes('double-booking'));
      expect(pinConflicts).toHaveLength(0);
    });

    it('should not flag pinned entries with null teacher_staff_id or room_id', async () => {
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([
        {
          id: 'pin-1',
          teacher_staff_id: null,
          room_id: null,
          weekday: 1,
          start_time: new Date('1970-01-01T09:00:00Z'),
          end_time: new Date('1970-01-01T10:00:00Z'),
        },
        {
          id: 'pin-2',
          teacher_staff_id: null,
          room_id: null,
          weekday: 1,
          start_time: new Date('1970-01-01T09:30:00Z'),
          end_time: new Date('1970-01-01T10:30:00Z'),
        },
      ]);

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      const pinConflicts = result.missing.filter((m) => m.includes('double-booking'));
      expect(pinConflicts).toHaveLength(0);
    });
  });

  // ─── checkPrerequisites — year-group-specific period grid ─────────────────

  describe('checkPrerequisites — year-group-specific grid', () => {
    it('should accept year-group-specific period grid (not shared)', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearGroupsWithActiveClasses as jest.Mock).mockResolvedValue([
        { id: 'yg-1', name: 'Year 1' },
      ]);
      // Year-group-specific grid, not shared (null)
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([{ year_group_id: 'yg-1' }]);
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
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([]);

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      expect(result.ready).toBe(true);
    });

    // Retired in Stage 3 of the scheduler rebuild — the year-group-grained
    // "no eligible teacher" check moved to `SchedulingPrerequisitesService`
    // as the per-class `every_class_subject_has_teacher` check. Coverage for
    // the new shape lives in `scheduling-prerequisites.service.spec.ts`.
    it.skip('should report missing teacher for subject+year group combo (retired Stage 3)', () => {
      // intentionally empty — see comment above
    });

    it('should report multiple year groups missing grids independently', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearGroupsWithActiveClasses as jest.Mock).mockResolvedValue([
        { id: 'yg-1', name: 'Year 1' },
        { id: 'yg-2', name: 'Year 2' },
      ]);
      // Only yg-1 has a grid, yg-2 does not, no shared grid
      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([{ year_group_id: 'yg-1' }]);
      mockPrisma.curriculumRequirement.findMany
        .mockResolvedValueOnce([{ year_group_id: 'yg-1' }, { year_group_id: 'yg-2' }])
        .mockResolvedValueOnce([]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([]);

      const result = await service.checkPrerequisites(TENANT_ID, AY_ID);

      expect(result.ready).toBe(false);
      const gridMissing = result.missing.filter((m) => m.includes('No period grid'));
      expect(gridMissing).toHaveLength(1);
      expect(gridMissing[0]).toContain('Year 2');
    });
  });

  // ─── triggerSolverRun — success paths ──────────────────────────────────────

  describe('triggerSolverRun — success paths', () => {
    function setupPassingPrerequisites() {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearGroupsWithActiveClasses as jest.Mock).mockResolvedValue([
        { id: 'yg-1', name: 'Y1' },
      ]);
      (acadFacade.findYearGroupsWithClassesAndCounts as jest.Mock).mockResolvedValue([
        {
          id: 'yg-1',
          name: 'Y1',
          classes: [{ id: 'cls-1', name: '1A', _count: { class_enrolments: 20 } }],
        },
      ]);

      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
        {
          year_group_id: null,
          weekday: 1,
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
          min_periods_per_week: 5,
          max_periods_per_day: 2,
          preferred_periods_per_week: null,
          requires_double_period: false,
          double_period_count: null,
        },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        { staff_profile_id: 'staff-1', subject_id: 's1', year_group_id: 'yg-1' },
      ]);
      mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue([
        {
          staff_profile_id: 'staff-1',
          max_periods_per_week: 25,
          max_periods_per_day: 6,
          max_supervision_duties_per_week: 3,
        },
      ]);
      mockPrisma.breakGroup.findMany.mockResolvedValue([
        {
          id: 'bg-1',
          name: 'Break A',
          year_groups: [{ year_group_id: 'yg-1' }],
          required_supervisor_count: 2,
        },
      ]);

      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([]);

      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findActiveRun as jest.Mock).mockResolvedValue(null);

      const staffAvailFacade = module.get(StaffAvailabilityReadFacade);
      (staffAvailFacade.findByAcademicYear as jest.Mock).mockResolvedValue([
        {
          staff_profile_id: 'staff-1',
          weekday: 1,
          available_from: new Date('1970-01-01T08:00:00Z'),
          available_to: new Date('1970-01-01T16:00:00Z'),
        },
      ]);

      const staffPrefFacade = module.get(StaffPreferencesReadFacade);
      (staffPrefFacade.findByAcademicYear as jest.Mock).mockResolvedValue([
        {
          id: 'pref-1',
          staff_profile_id: 'staff-1',
          preference_type: 'preferred_time',
          preference_payload: {},
          priority: 'medium',
        },
      ]);

      const staffProfileFacade = module.get(StaffProfileReadFacade);
      (staffProfileFacade.findByIds as jest.Mock).mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Brown' } },
      ]);

      const roomsFacade = module.get(RoomsReadFacade);
      (roomsFacade.findActiveRooms as jest.Mock).mockResolvedValue([
        { id: 'room-1', room_type: 'classroom', capacity: 30, is_exclusive: false },
      ]);
      (roomsFacade.findAllClosures as jest.Mock).mockResolvedValue([
        {
          room_id: 'room-1',
          date_from: new Date('2026-06-01'),
          date_to: new Date('2026-06-05'),
        },
      ]);

      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findEnrolmentPairsForAcademicYear as jest.Mock).mockResolvedValue([
        { student_id: 'stu-1', class_id: 'cls-1' },
        { student_id: 'stu-1', class_id: 'cls-2' },
      ]);

      const configFacade = module.get(ConfigurationReadFacade);
      (configFacade.findSettings as jest.Mock).mockResolvedValue({
        settings: {
          scheduling: {
            maxSolverDurationSeconds: 60,
            preferenceWeights: { low: 1, medium: 3, high: 5 },
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

      const runCreated = new Date('2026-03-01T10:00:00Z');
      mockTx.schedulingRun.create.mockResolvedValue({
        id: RUN_ID,
        status: 'queued',
        created_at: runCreated,
      });
    }

    it('should create a solver run in auto mode when no pinned entries', async () => {
      setupPassingPrerequisites();

      const result = await service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID);

      expect(result.id).toBe(RUN_ID);
      expect(result.status).toBe('queued');
      expect(result.mode).toBe('auto');
      expect(result.academic_year_id).toBe(AY_ID);
      expect(mockQueue.add).toHaveBeenCalledWith('scheduling:solve-v2', {
        tenant_id: TENANT_ID,
        run_id: RUN_ID,
      });
    });

    it('should create a solver run in hybrid mode when pinned entries exist', async () => {
      setupPassingPrerequisites();

      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([
        {
          id: 'pin-1',
          class_id: 'cls-1',
          class_entity: { subject_id: 's1', year_group_id: 'yg-1' },
          room_id: 'room-1',
          teacher_staff_id: 'staff-1',
          weekday: 1,
          period_order: 1,
          start_time: new Date('1970-01-01T08:00:00Z'),
          end_time: new Date('1970-01-01T09:00:00Z'),
        },
      ]);

      const result = await service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID);

      expect(result.mode).toBe('hybrid');
    });

    it('should apply solver_seed override when provided', async () => {
      setupPassingPrerequisites();

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

    it('should apply max_solver_duration_seconds override when provided', async () => {
      setupPassingPrerequisites();

      await service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID, {
        academic_year_id: AY_ID,
        max_solver_duration_seconds: 300,
      });

      // The config_snapshot should reflect the overridden value
      const createCall = mockTx.schedulingRun.create.mock.calls[0]![0];
      const config = JSON.parse(JSON.stringify(createCall.data.config_snapshot));
      expect(config.settings.max_solver_duration_seconds).toBe(300);
    });

    it('should not override solver_seed when it is null', async () => {
      setupPassingPrerequisites();

      await service.triggerSolverRun(TENANT_ID, AY_ID, USER_ID, {
        academic_year_id: AY_ID,
        max_solver_duration_seconds: 120,
        solver_seed: null,
      });

      expect(mockTx.schedulingRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            solver_seed: null,
          }),
        }),
      );
    });

    it('should handle empty teacherIds list (no staff profile query)', async () => {
      setupPassingPrerequisites();
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);

      // Prerequisites will fail but assembleSolverInput is separate — test via trigger
      // Use direct assembleSolverInput call instead
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearGroupsWithClassesAndCounts as jest.Mock).mockResolvedValue([]);

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(input.teachers).toHaveLength(0);
    });
  });

  // ─── assembleSolverInput ────────────────────────────────────────────────────

  describe('assembleSolverInput', () => {
    function setupAssembleData() {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearGroupsWithClassesAndCounts as jest.Mock).mockResolvedValue([
        {
          id: 'yg-1',
          name: 'Y1',
          classes: [{ id: 'cls-1', name: '1A', _count: { class_enrolments: 20 } }],
        },
      ]);

      mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
        {
          year_group_id: null,
          weekday: 1,
          period_order: 1,
          start_time: new Date('1970-01-01T08:00:00Z'),
          end_time: new Date('1970-01-01T09:00:00Z'),
          schedule_period_type: 'teaching',
          supervision_mode: null,
          break_group_id: null,
        },
        {
          year_group_id: 'yg-1',
          weekday: 2,
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
          subject: { name: 'Maths' },
          min_periods_per_week: 5,
          max_periods_per_day: 2,
          preferred_periods_per_week: 6,
          requires_double_period: true,
          double_period_count: 1,
        },
      ]);

      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        { staff_profile_id: 'staff-1', subject_id: 's1', year_group_id: 'yg-1', class_id: null },
      ]);

      mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue([
        {
          staff_profile_id: 'staff-1',
          max_periods_per_week: 25,
          max_periods_per_day: 6,
          max_supervision_duties_per_week: 3,
        },
      ]);

      mockPrisma.breakGroup.findMany.mockResolvedValue([
        {
          id: 'bg-1',
          name: 'Break A',
          year_groups: [{ year_group_id: 'yg-1' }],
          required_supervisor_count: 2,
        },
      ]);

      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([
        {
          id: 'pin-1',
          class_id: 'cls-1',
          class_entity: { subject_id: 's1', year_group_id: 'yg-1' },
          room_id: 'room-1',
          teacher_staff_id: 'staff-1',
          weekday: 1,
          period_order: 1,
        },
      ]);

      const staffAvailFacade = module.get(StaffAvailabilityReadFacade);
      (staffAvailFacade.findByAcademicYear as jest.Mock).mockResolvedValue([
        {
          staff_profile_id: 'staff-1',
          weekday: 1,
          available_from: new Date('1970-01-01T08:00:00Z'),
          available_to: new Date('1970-01-01T16:00:00Z'),
        },
      ]);

      const staffPrefFacade = module.get(StaffPreferencesReadFacade);
      (staffPrefFacade.findByAcademicYear as jest.Mock).mockResolvedValue([
        {
          id: 'pref-1',
          staff_profile_id: 'staff-1',
          preference_type: 'preferred_time',
          preference_payload: { slot: 'morning' },
          priority: 'high',
        },
      ]);

      const staffProfileFacade = module.get(StaffProfileReadFacade);
      (staffProfileFacade.findByIds as jest.Mock).mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Brown' } },
      ]);

      const roomsFacade = module.get(RoomsReadFacade);
      (roomsFacade.findActiveRooms as jest.Mock).mockResolvedValue([
        { id: 'room-1', room_type: 'classroom', capacity: 30, is_exclusive: false },
      ]);
      (roomsFacade.findAllClosures as jest.Mock).mockResolvedValue([
        {
          room_id: 'room-1',
          date_from: new Date('2026-06-01'),
          date_to: new Date('2026-06-05'),
        },
      ]);

      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findEnrolmentPairsForAcademicYear as jest.Mock).mockResolvedValue([
        { student_id: 'stu-1', class_id: 'cls-1' },
        { student_id: 'stu-1', class_id: 'cls-2' },
        { student_id: 'stu-2', class_id: 'cls-1' },
      ]);

      const configFacade = module.get(ConfigurationReadFacade);
      (configFacade.findSettings as jest.Mock).mockResolvedValue(null);
    }

    it('should assemble complete solver input with all sections', async () => {
      setupAssembleData();

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(input.year_groups).toHaveLength(1);
      expect(input.year_groups[0]!.year_group_id).toBe('yg-1');
      expect(input.year_groups[0]!.sections).toHaveLength(1);
      expect(input.year_groups[0]!.sections[0]!.student_count).toBe(20);
    });

    it('should build period grid from shared and year-group-specific templates', async () => {
      setupAssembleData();

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      // yg-1 should include both shared (null) and yg-1-specific templates
      expect(input.year_groups[0]!.period_grid.length).toBe(2);
    });

    it('should build curriculum entries with all fields', async () => {
      setupAssembleData();

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(input.curriculum).toHaveLength(1);
      expect(input.curriculum[0]!.subject_name).toBe('Maths');
      expect(input.curriculum[0]!.min_periods_per_week).toBe(5);
      expect(input.curriculum[0]!.requires_double_period).toBe(true);
      expect(input.curriculum[0]!.double_period_count).toBe(1);
      expect(input.curriculum[0]!.required_room_type).toBeNull();
      expect(input.curriculum[0]!.preferred_room_id).toBeNull();
    });

    it('should build teacher inputs with competencies, availability, preferences, and config', async () => {
      setupAssembleData();

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(input.teachers).toHaveLength(1);
      const teacher = input.teachers[0]!;
      expect(teacher.staff_profile_id).toBe('staff-1');
      expect(teacher.name).toBe('Alice Brown');
      expect(teacher.competencies).toHaveLength(1);
      // Stage 2: competency carries class_id (pin) / null (pool). The fixture
      // mocks a pool entry → class_id is null.
      expect(teacher.competencies[0]!.class_id).toBeNull();
      expect(teacher.availability).toHaveLength(1);
      expect(teacher.availability[0]!.from).toBe('08:00');
      expect(teacher.preferences).toHaveLength(1);
      expect(teacher.preferences[0]!.preference_type).toBe('preferred_time');
      expect(teacher.max_periods_per_week).toBe(25);
      expect(teacher.max_periods_per_day).toBe(6);
      expect(teacher.max_supervision_duties_per_week).toBe(3);
    });

    it('should fallback to teacherId as name when staff profile not found', async () => {
      setupAssembleData();

      const staffProfileFacade = module.get(StaffProfileReadFacade);
      (staffProfileFacade.findByIds as jest.Mock).mockResolvedValue([]);

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(input.teachers[0]!.name).toBe('staff-1');
    });

    it('should use null defaults when no teacher scheduling config exists', async () => {
      setupAssembleData();
      mockPrisma.teacherSchedulingConfig.findMany.mockResolvedValue([]);

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      const teacher = input.teachers[0]!;
      expect(teacher.max_periods_per_week).toBeNull();
      expect(teacher.max_periods_per_day).toBeNull();
      expect(teacher.max_supervision_duties_per_week).toBeNull();
    });

    it('should build room info and room closures', async () => {
      setupAssembleData();

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(input.rooms).toHaveLength(1);
      expect(input.rooms[0]!.room_type).toBe('classroom');
      expect(input.room_closures).toHaveLength(1);
      expect(input.room_closures[0]!.room_id).toBe('room-1');
    });

    it('should build break groups from raw data', async () => {
      setupAssembleData();

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(input.break_groups).toHaveLength(1);
      expect(input.break_groups[0]!.name).toBe('Break A');
      expect(input.break_groups[0]!.year_group_ids).toEqual(['yg-1']);
      expect(input.break_groups[0]!.required_supervisor_count).toBe(2);
    });

    it('should build pinned entries from schedules', async () => {
      setupAssembleData();

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(input.pinned_entries).toHaveLength(1);
      expect(input.pinned_entries[0]!.schedule_id).toBe('pin-1');
      expect(input.pinned_entries[0]!.subject_id).toBe('s1');
      expect(input.pinned_entries[0]!.year_group_id).toBe('yg-1');
    });

    it('should handle pinned entries with null class_entity', async () => {
      setupAssembleData();

      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([
        {
          id: 'pin-1',
          class_id: 'cls-1',
          class_entity: null,
          room_id: null,
          teacher_staff_id: null,
          weekday: 1,
          period_order: 1,
        },
      ]);

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(input.pinned_entries[0]!.subject_id).toBeNull();
      expect(input.pinned_entries[0]!.year_group_id).toBeNull();
    });

    it('should default period_order to 0 when null in pinned entries', async () => {
      setupAssembleData();

      const schedFacade = module.get(SchedulesReadFacade);
      (schedFacade.findPinnedEntries as jest.Mock).mockResolvedValue([
        {
          id: 'pin-1',
          class_id: 'cls-1',
          class_entity: { subject_id: 's1', year_group_id: 'yg-1' },
          room_id: 'room-1',
          teacher_staff_id: 'staff-1',
          weekday: 1,
          period_order: null,
        },
      ]);

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(input.pinned_entries[0]!.period_order).toBe(0);
    });

    it('should compute student overlaps from enrolment pairs', async () => {
      setupAssembleData();

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      // stu-1 enrolled in cls-1 and cls-2 → one overlap pair
      expect(input.student_overlaps).toHaveLength(1);
      const pair = input.student_overlaps[0]!;
      const sortedPair = [pair.class_id_a, pair.class_id_b].sort();
      expect(sortedPair).toEqual(['cls-1', 'cls-2']);
    });

    it('should not create duplicate student overlap entries', async () => {
      setupAssembleData();

      // Two students share the same pair of classes
      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findEnrolmentPairsForAcademicYear as jest.Mock).mockResolvedValue([
        { student_id: 'stu-1', class_id: 'cls-1' },
        { student_id: 'stu-1', class_id: 'cls-2' },
        { student_id: 'stu-2', class_id: 'cls-1' },
        { student_id: 'stu-2', class_id: 'cls-2' },
      ]);

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(input.student_overlaps).toHaveLength(1);
    });

    it('should use default settings when tenantSettings is null', async () => {
      setupAssembleData();

      const configFacade = module.get(ConfigurationReadFacade);
      (configFacade.findSettings as jest.Mock).mockResolvedValue(null);

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(input.settings.max_solver_duration_seconds).toBe(120);
      expect(input.settings.preference_weights.low).toBe(1);
      expect(input.settings.preference_weights.medium).toBe(2);
      expect(input.settings.preference_weights.high).toBe(3);
      expect(input.settings.global_soft_weights.even_subject_spread).toBe(2);
      expect(input.settings.solver_seed).toBeNull();
    });

    it('should use tenant settings when they are provided', async () => {
      setupAssembleData();

      const configFacade = module.get(ConfigurationReadFacade);
      (configFacade.findSettings as jest.Mock).mockResolvedValue({
        settings: {
          scheduling: {
            maxSolverDurationSeconds: 200,
            preferenceWeights: { low: 2, medium: 4, high: 8 },
            globalSoftWeights: {
              evenSubjectSpread: 5,
              minimiseTeacherGaps: 3,
              roomConsistency: 2,
              workloadBalance: 4,
              breakDutyBalance: 3,
            },
          },
        },
      });

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(input.settings.max_solver_duration_seconds).toBe(200);
      expect(input.settings.preference_weights.low).toBe(2);
      expect(input.settings.preference_weights.medium).toBe(4);
      expect(input.settings.preference_weights.high).toBe(8);
      expect(input.settings.global_soft_weights.even_subject_spread).toBe(5);
    });

    it('should handle student enrolled in only one class (no overlaps)', async () => {
      setupAssembleData();

      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findEnrolmentPairsForAcademicYear as jest.Mock).mockResolvedValue([
        { student_id: 'stu-1', class_id: 'cls-1' },
      ]);

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(input.student_overlaps).toHaveLength(0);
    });

    it('should handle student enrolled in three classes (three overlap pairs)', async () => {
      setupAssembleData();

      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findEnrolmentPairsForAcademicYear as jest.Mock).mockResolvedValue([
        { student_id: 'stu-1', class_id: 'cls-1' },
        { student_id: 'stu-1', class_id: 'cls-2' },
        { student_id: 'stu-1', class_id: 'cls-3' },
      ]);

      const input = await service.assembleSolverInput(TENANT_ID, AY_ID);

      expect(input.student_overlaps).toHaveLength(3);
    });
  });

  // ─── applyRun — full paths ──────────────────────────────────────────────────

  describe('applyRun — success and validation', () => {
    const { validateSchedule } = jest.requireMock('@school/shared/scheduler') as {
      validateSchedule: jest.Mock;
    };

    it('should apply entries successfully and return result', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: {
          entries: [
            {
              class_id: 'cls-1',
              weekday: 1,
              period_order: 1,
              room_id: 'room-1',
              teacher_staff_id: 'staff-1',
              year_group_id: 'yg-1',
              is_pinned: false,
              is_supervision: false,
              start_time: '08:00',
              end_time: '09:00',
            },
          ],
          unassigned: [],
        },
        config_snapshot: null,
      });

      mockTx.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockTx.schedule.findMany.mockResolvedValue([]);
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: new Date('2026-03-02T10:00:00Z'),
      });

      const result = await service.applyRun(TENANT_ID, RUN_ID, USER_ID);

      expect(result.id).toBe(RUN_ID);
      expect(result.status).toBe('applied');
      expect(result.entries_applied).toBe(1);
      expect(mockTx.schedule.create).toHaveBeenCalled();
    });

    it('should skip supervision entries during apply', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: {
          entries: [
            {
              class_id: 'cls-1',
              weekday: 1,
              period_order: 1,
              room_id: null,
              teacher_staff_id: 'staff-1',
              year_group_id: 'yg-1',
              is_pinned: false,
              is_supervision: true,
              start_time: '08:00',
              end_time: '09:00',
            },
          ],
          unassigned: [],
        },
        config_snapshot: null,
      });

      mockTx.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockTx.schedule.findMany.mockResolvedValue([]);
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: new Date('2026-03-02T10:00:00Z'),
      });

      const result = await service.applyRun(TENANT_ID, RUN_ID, USER_ID);

      expect(result.entries_applied).toBe(0);
      expect(mockTx.schedule.create).not.toHaveBeenCalled();
    });

    it('should resolve times from period templates when entry has no start_time/end_time', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: {
          entries: [
            {
              class_id: 'cls-1',
              weekday: 1,
              period_order: 1,
              room_id: 'room-1',
              teacher_staff_id: 'staff-1',
              year_group_id: 'yg-1',
              is_pinned: false,
              is_supervision: false,
              start_time: null,
              end_time: null,
            },
          ],
          unassigned: [],
        },
        config_snapshot: null,
      });

      const periodStart = new Date('1970-01-01T08:00:00Z');
      const periodEnd = new Date('1970-01-01T09:00:00Z');
      mockTx.schedulePeriodTemplate.findMany.mockResolvedValue([
        {
          weekday: 1,
          period_order: 1,
          start_time: periodStart,
          end_time: periodEnd,
          year_group_id: 'yg-1',
        },
      ]);
      mockTx.schedule.findMany.mockResolvedValue([]);
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: new Date(),
      });

      await service.applyRun(TENANT_ID, RUN_ID, USER_ID);

      expect(mockTx.schedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            start_time: periodStart,
            end_time: periodEnd,
          }),
        }),
      );
    });

    it('should fall back to shared template when year-group-specific not found', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: {
          entries: [
            {
              class_id: 'cls-1',
              weekday: 1,
              period_order: 1,
              room_id: 'room-1',
              teacher_staff_id: 'staff-1',
              year_group_id: 'yg-1',
              is_pinned: false,
              is_supervision: false,
              start_time: null,
              end_time: null,
            },
          ],
          unassigned: [],
        },
        config_snapshot: null,
      });

      const sharedStart = new Date('1970-01-01T08:30:00Z');
      const sharedEnd = new Date('1970-01-01T09:30:00Z');
      mockTx.schedulePeriodTemplate.findMany.mockResolvedValue([
        {
          weekday: 1,
          period_order: 1,
          start_time: sharedStart,
          end_time: sharedEnd,
          year_group_id: null,
        },
      ]);
      mockTx.schedule.findMany.mockResolvedValue([]);
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: new Date(),
      });

      await service.applyRun(TENANT_ID, RUN_ID, USER_ID);

      expect(mockTx.schedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            start_time: sharedStart,
            end_time: sharedEnd,
          }),
        }),
      );
    });

    it('should skip entries with no matching period template', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: {
          entries: [
            {
              class_id: 'cls-1',
              weekday: 5,
              period_order: 99,
              room_id: null,
              teacher_staff_id: null,
              year_group_id: 'yg-1',
              is_pinned: false,
              is_supervision: false,
              start_time: null,
              end_time: null,
            },
          ],
          unassigned: [],
        },
        config_snapshot: null,
      });

      mockTx.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockTx.schedule.findMany.mockResolvedValue([]);
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: new Date(),
      });

      const result = await service.applyRun(TENANT_ID, RUN_ID, USER_ID);

      expect(mockTx.schedule.create).not.toHaveBeenCalled();
      // entries_applied counts non-supervision entries (not skipped-template ones)
      expect(result.entries_applied).toBe(1);
    });

    it('should end-date existing auto_generated schedules that have attendance sessions', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: { entries: [], unassigned: [] },
        config_snapshot: null,
      });

      mockTx.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockTx.schedule.findMany.mockResolvedValue([
        { id: 'old-sched-1', _count: { attendance_sessions: 3 } },
      ]);
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: new Date(),
      });

      await service.applyRun(TENANT_ID, RUN_ID, USER_ID);

      expect(mockTx.schedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'old-sched-1' },
          data: expect.objectContaining({ effective_end_date: expect.any(Date) }),
        }),
      );
      expect(mockTx.schedule.delete).not.toHaveBeenCalled();
    });

    it('should delete existing auto_generated schedules that have no attendance sessions', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: { entries: [], unassigned: [] },
        config_snapshot: null,
      });

      mockTx.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockTx.schedule.findMany.mockResolvedValue([
        { id: 'old-sched-2', _count: { attendance_sessions: 0 } },
      ]);
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: new Date(),
      });

      await service.applyRun(TENANT_ID, RUN_ID, USER_ID);

      expect(mockTx.schedule.delete).toHaveBeenCalledWith({ where: { id: 'old-sched-2' } });
      expect(mockTx.schedule.update).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException on tier-1 violations', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: {
          entries: [
            {
              class_id: 'cls-1',
              weekday: 1,
              period_order: 1,
              is_pinned: false,
              is_supervision: false,
              start_time: '08:00',
              end_time: '09:00',
            },
          ],
          unassigned: [],
        },
        config_snapshot: {
          year_groups: [],
          curriculum: [],
          teachers: [],
          rooms: [],
          room_closures: [],
          break_groups: [],
          pinned_entries: [],
          student_overlaps: [],
          settings: {},
        },
      });

      validateSchedule.mockReturnValue({
        violations: [{ tier: 1, type: 'teacher_double_booking', message: 'T1 conflict' }],
        health_score: 50,
        summary: { tier1: 1, tier2: 0, tier3: 0 },
        cell_violations: {},
      });

      await expect(service.applyRun(TENANT_ID, RUN_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );

      // Reset validateSchedule
      validateSchedule.mockReturnValue({
        violations: [],
        health_score: 100,
        summary: { tier1: 0, tier2: 0, tier3: 0 },
        cell_violations: {},
      });
    });

    it('should return tier-2 acknowledgement prompt when not acknowledged', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: {
          entries: [
            {
              class_id: 'cls-1',
              weekday: 1,
              period_order: 1,
              is_pinned: false,
              is_supervision: false,
              start_time: '08:00',
              end_time: '09:00',
            },
          ],
          unassigned: [],
        },
        config_snapshot: {
          year_groups: [],
          curriculum: [],
          teachers: [],
          rooms: [],
          room_closures: [],
          break_groups: [],
          pinned_entries: [],
          student_overlaps: [],
          settings: {},
        },
      });

      validateSchedule.mockReturnValue({
        violations: [{ tier: 2, type: 'soft_constraint', message: 'T2 issue' }],
        health_score: 80,
        summary: { tier1: 0, tier2: 1, tier3: 0 },
        cell_violations: {},
      });

      const result = await service.applyRun(TENANT_ID, RUN_ID, USER_ID, false);

      expect(result).toEqual(
        expect.objectContaining({
          requires_acknowledgement: true,
          tier2_count: 1,
        }),
      );

      // Reset validateSchedule
      validateSchedule.mockReturnValue({
        violations: [],
        health_score: 100,
        summary: { tier1: 0, tier2: 0, tier3: 0 },
        cell_violations: {},
      });
    });

    it('should proceed with apply when tier-2 violations are acknowledged', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: {
          entries: [
            {
              class_id: 'cls-1',
              weekday: 1,
              period_order: 1,
              room_id: 'room-1',
              teacher_staff_id: 'staff-1',
              year_group_id: 'yg-1',
              is_pinned: false,
              is_supervision: false,
              start_time: '08:00',
              end_time: '09:00',
            },
          ],
          unassigned: [],
        },
        config_snapshot: {
          year_groups: [],
          curriculum: [],
          teachers: [],
          rooms: [],
          room_closures: [],
          break_groups: [],
          pinned_entries: [],
          student_overlaps: [],
          settings: {},
        },
      });

      validateSchedule.mockReturnValue({
        violations: [{ tier: 2, type: 'soft_constraint', message: 'T2 issue' }],
        health_score: 80,
        summary: { tier1: 0, tier2: 1, tier3: 0 },
        cell_violations: {},
      });

      mockTx.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockTx.schedule.findMany.mockResolvedValue([]);
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: new Date('2026-03-02T10:00:00Z'),
      });

      const result = await service.applyRun(TENANT_ID, RUN_ID, USER_ID, true);

      expect(result.status).toBe('applied');
      expect(result.entries_applied).toBe(1);

      // Reset validateSchedule
      validateSchedule.mockReturnValue({
        violations: [],
        health_score: 100,
        summary: { tier1: 0, tier2: 0, tier3: 0 },
        cell_violations: {},
      });
    });

    it('should coalesce undefined room_id and teacher_staff_id to null', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: {
          entries: [
            {
              class_id: 'cls-1',
              weekday: 1,
              period_order: 1,
              year_group_id: 'yg-1',
              is_pinned: false,
              is_supervision: false,
              start_time: '08:00',
              end_time: '09:00',
              // room_id and teacher_staff_id are undefined (not present)
            },
          ],
          unassigned: [],
        },
        config_snapshot: null,
      });

      mockTx.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockTx.schedule.findMany.mockResolvedValue([]);
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: new Date(),
      });

      await service.applyRun(TENANT_ID, RUN_ID, USER_ID);

      expect(mockTx.schedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            room_id: null,
            teacher_staff_id: null,
          }),
        }),
      );
    });

    it('should handle applied_at being null in result', async () => {
      const runsFacade = module.get(SchedulingRunsReadFacade);
      (runsFacade.findById as jest.Mock).mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: { entries: [], unassigned: [] },
        config_snapshot: null,
      });

      mockTx.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockTx.schedule.findMany.mockResolvedValue([]);
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        applied_at: null,
      });

      const result = await service.applyRun(TENANT_ID, RUN_ID, USER_ID);

      expect(result.applied_at).toBeNull();
    });
  });
});
