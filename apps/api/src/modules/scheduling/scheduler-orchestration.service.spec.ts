import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

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
  });
});
