/* eslint-disable import/order -- jest.mock must precede mocked imports */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

const mockTx = {
  schedulingRun: {
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      ),
  }),
}));

import { PrismaService } from '../prisma/prisma.service';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { SchedulingReadFacade } from '../scheduling/scheduling-read.facade';
import { StaffAvailabilityReadFacade } from '../staff-availability/staff-availability-read.facade';
import { AcademicReadFacade } from '../academics/academic-read.facade';

import { SchedulingPrerequisitesService } from './scheduling-prerequisites.service';
import { SchedulingRunsService } from './scheduling-runs.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-uuid-0001';
const AY_ID = 'ay-uuid-0001';
const RUN_ID = 'run-uuid-0001';

const NOW = new Date('2026-03-01T12:00:00Z');

describe('SchedulingRunsService', () => {
  let service: SchedulingRunsService;
  let mockPrisma: {
    academicYear: { findFirst: jest.Mock };
    schedulingRun: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    schedule: { count: jest.Mock };
  };
  let mockPrerequisites: { check: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      academicYear: { findFirst: jest.fn() },
      schedulingRun: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      schedule: { count: jest.fn().mockResolvedValue(0) },
    };

    mockPrerequisites = {
      check: jest.fn().mockResolvedValue({ ready: true, checks: [] }),
    };

    mockTx.schedulingRun.create.mockReset();
    mockTx.schedulingRun.update.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ClassesReadFacade, useValue: {
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
    } },
        { provide: SchedulesReadFacade, useValue: {
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
    } },
        { provide: SchedulingReadFacade, useValue: {
      findPeriodTemplate: jest.fn().mockResolvedValue(null),
      countTeachingPeriods: jest.fn().mockResolvedValue(0),
      findPeriodTemplates: jest.fn().mockResolvedValue([]),
      countClassRequirements: jest.fn().mockResolvedValue(0),
      findClassRequirementsWithDetails: jest.fn().mockResolvedValue([]),
      findTeacherCompetencies: jest.fn().mockResolvedValue([]),
      findTeacherConfigs: jest.fn().mockResolvedValue([]),
    } },
        { provide: StaffAvailabilityReadFacade, useValue: {
      findByAcademicYear: jest.fn().mockResolvedValue([]),
      findByStaffIds: jest.fn().mockResolvedValue([]),
      findByWeekday: jest.fn().mockResolvedValue([]),
    } },
        { provide: AcademicReadFacade, useValue: {
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
    } },
        SchedulingRunsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SchedulingPrerequisitesService, useValue: mockPrerequisites },
      ],
    }).compile();

    service = module.get<SchedulingRunsService>(SchedulingRunsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create a queued scheduling run when prerequisites pass', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);
      mockPrisma.schedule.count.mockResolvedValue(0);

      const createdRun = {
        id: RUN_ID,
        tenant_id: TENANT_ID,
        academic_year_id: AY_ID,
        mode: 'auto',
        status: 'queued',
        solver_seed: null,
        soft_preference_score: null,
        soft_preference_max: null,
        created_at: NOW,
        updated_at: NOW,
        applied_at: null,
      };
      mockTx.schedulingRun.create.mockResolvedValue(createdRun);

      const result = await service.create(TENANT_ID, USER_ID, {
        academic_year_id: AY_ID,
      });

      expect(result['status']).toBe('queued');
      expect(result['mode']).toBe('auto');
      expect(mockTx.schedulingRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'queued',
            academic_year_id: AY_ID,
          }),
        }),
      );
    });

    it('should set mode to hybrid when pinned entries exist', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);
      mockPrisma.schedule.count.mockResolvedValue(5);

      const createdRun = {
        id: RUN_ID,
        mode: 'hybrid',
        status: 'queued',
        solver_seed: null,
        soft_preference_score: null,
        soft_preference_max: null,
        created_at: NOW,
        updated_at: NOW,
        applied_at: null,
      };
      mockTx.schedulingRun.create.mockResolvedValue(createdRun);

      const result = await service.create(TENANT_ID, USER_ID, {
        academic_year_id: AY_ID,
      });

      expect(result['mode']).toBe('hybrid');
    });

    it('should throw NotFoundException when academic year does not exist', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, { academic_year_id: 'nonexistent' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when an active run already exists', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: 'existing-run',
        status: 'running',
      });

      await expect(
        service.create(TENANT_ID, USER_ID, { academic_year_id: AY_ID }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when prerequisites are not met', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);
      mockPrerequisites.check.mockResolvedValue({
        ready: false,
        checks: [{ key: 'period_grid_exists', passed: false, message: 'No grid' }],
      });

      await expect(
        service.create(TENANT_ID, USER_ID, { academic_year_id: AY_ID }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── findById ───────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return a formatted run when found', async () => {
      const run = {
        id: RUN_ID,
        status: 'completed',
        solver_seed: BigInt(42),
        soft_preference_score: null,
        soft_preference_max: null,
        created_at: NOW,
        updated_at: NOW,
        applied_at: null,
      };
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(run);

      const result = await service.findById(TENANT_ID, RUN_ID);

      expect(result['id']).toBe(RUN_ID);
      expect(result['solver_seed']).toBe(42);
      expect(result['created_at']).toBe(NOW.toISOString());
    });

    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      await expect(
        service.findById(TENANT_ID, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getProgress ────────────────────────────────────────────────────────────

  describe('getProgress', () => {
    it('should return progress data with computed phase', async () => {
      const run = {
        id: RUN_ID,
        status: 'running',
        entries_generated: 100,
        entries_pinned: 5,
        entries_unassigned: 10,
        solver_duration_ms: 3500,
        failure_reason: null,
        updated_at: NOW,
      };
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(run);

      const result = await service.getProgress(TENANT_ID, RUN_ID);

      expect(result.phase).toBe('solving');
      expect(result.entries_assigned).toBe(90);
      expect(result.entries_total).toBe(100);
      expect(result.elapsed_ms).toBe(3500);
    });

    it('should return phase "complete" for completed runs', async () => {
      const run = {
        id: RUN_ID,
        status: 'completed',
        entries_generated: 50,
        entries_pinned: 0,
        entries_unassigned: 0,
        solver_duration_ms: 2000,
        failure_reason: null,
        updated_at: NOW,
      };
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(run);

      const result = await service.getProgress(TENANT_ID, RUN_ID);

      expect(result.phase).toBe('complete');
    });

    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      await expect(
        service.getProgress(TENANT_ID, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── cancel ─────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('should cancel a queued run', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'queued',
      });
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'failed',
        failure_reason: 'Cancelled by user',
        solver_seed: null,
        soft_preference_score: null,
        soft_preference_max: null,
        created_at: NOW,
        updated_at: NOW,
        applied_at: null,
      });

      const result = await service.cancel(TENANT_ID, RUN_ID);

      expect(result['status']).toBe('failed');
      expect(result['failure_reason']).toBe('Cancelled by user');
    });

    it('should throw BadRequestException for a completed run', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
      });

      await expect(
        service.cancel(TENANT_ID, RUN_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      await expect(
        service.cancel(TENANT_ID, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── discard ────────────────────────────────────────────────────────────────

  describe('discard', () => {
    it('should discard a completed run', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        updated_at: NOW,
      });
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'discarded',
        solver_seed: null,
        soft_preference_score: null,
        soft_preference_max: null,
        created_at: NOW,
        updated_at: NOW,
        applied_at: null,
      });

      const result = await service.discard(TENANT_ID, RUN_ID, {
        expected_updated_at: NOW.toISOString(),
      });

      expect(result['status']).toBe('discarded');
    });

    it('should throw BadRequestException for a non-completed run', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'running',
        updated_at: NOW,
      });

      await expect(
        service.discard(TENANT_ID, RUN_ID, {
          expected_updated_at: NOW.toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException on stale updated_at', async () => {
      const staleDate = new Date('2026-02-01T00:00:00Z');
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        updated_at: NOW,
      });

      await expect(
        service.discard(TENANT_ID, RUN_ID, {
          expected_updated_at: staleDate.toISOString(),
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated runs', async () => {
      const run = {
        id: RUN_ID,
        status: 'completed',
        solver_seed: null,
        soft_preference_score: null,
        soft_preference_max: null,
        created_at: NOW,
        updated_at: NOW,
        applied_at: null,
      };
      mockPrisma.schedulingRun.findMany.mockResolvedValue([run]);
      mockPrisma.schedulingRun.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, AY_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });
  });

  // ─── parseResultJson ───────────────────────────────────────────────────────

  describe('parseResultJson', () => {
    it('should return null for null input', () => {
      expect(service.parseResultJson(null)).toBeNull();
    });

    it('should return null when entries is not an array', () => {
      expect(service.parseResultJson({ entries: 'not-array' })).toBeNull();
    });

    it('should return the object when it has an entries array', () => {
      const data = { entries: [{ class_id: 'c1' }], unassigned: [] };
      expect(service.parseResultJson(data)).toEqual(data);
    });
  });

  // ─── addAdjustment ──────────────────────────────────────────────────────────

  describe('addAdjustment', () => {
    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      await expect(
        service.addAdjustment(TENANT_ID, 'nonexistent', {
          expected_updated_at: NOW.toISOString(),
          adjustment: { type: 'remove', class_id: 'c1', weekday: 1, period_order: 1 },
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for a non-completed run', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'running',
        updated_at: NOW,
        proposed_adjustments: [],
      });

      await expect(
        service.addAdjustment(TENANT_ID, RUN_ID, {
          expected_updated_at: NOW.toISOString(),
          adjustment: { type: 'remove', class_id: 'c1', weekday: 1, period_order: 1 },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException on stale updated_at', async () => {
      const staleDate = new Date('2026-02-01T00:00:00Z');
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        updated_at: NOW,
        proposed_adjustments: [],
      });

      await expect(
        service.addAdjustment(TENANT_ID, RUN_ID, {
          expected_updated_at: staleDate.toISOString(),
          adjustment: { type: 'remove', class_id: 'c1', weekday: 1, period_order: 1 },
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── assertExists ──────────────────────────────────────────────────────────

  describe('assertExists', () => {
    it('should return the run when it exists', async () => {
      const run = { id: RUN_ID, status: 'completed' };
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(run);

      const result = await service.assertExists(TENANT_ID, RUN_ID);
      expect(result).toEqual(run);
    });

    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      await expect(
        service.assertExists(TENANT_ID, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
