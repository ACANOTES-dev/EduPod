/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

import { AcademicReadFacade, MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

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

  const mockAcademicReadFacade = {
    findYearByIdOrThrow: jest.fn().mockResolvedValue(AY_ID),
  };

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
    mockAcademicReadFacade.findYearByIdOrThrow.mockResolvedValue(AY_ID);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: AcademicReadFacade, useValue: mockAcademicReadFacade },
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
      mockAcademicReadFacade.findYearByIdOrThrow.mockRejectedValue(
        new NotFoundException({ code: 'ACADEMIC_YEAR_NOT_FOUND', message: 'Not found' }),
      );

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

      await expect(service.create(TENANT_ID, USER_ID, { academic_year_id: AY_ID })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException when prerequisites are not met', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);
      mockPrerequisites.check.mockResolvedValue({
        ready: false,
        checks: [{ key: 'period_grid_exists', passed: false, message: 'No grid' }],
      });

      await expect(service.create(TENANT_ID, USER_ID, { academic_year_id: AY_ID })).rejects.toThrow(
        BadRequestException,
      );
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

      await expect(service.findById(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
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

      await expect(service.getProgress(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
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

      await expect(service.cancel(TENANT_ID, RUN_ID)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      await expect(service.cancel(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
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

      await expect(service.assertExists(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── create — solver_seed branch ────────────────────────────────────────────

  describe('create — solver_seed', () => {
    it('should pass solver_seed as BigInt when provided', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);
      mockPrisma.schedule.count.mockResolvedValue(0);

      const createdRun = {
        id: RUN_ID,
        mode: 'auto',
        status: 'queued',
        solver_seed: BigInt(12345),
        soft_preference_score: null,
        soft_preference_max: null,
        created_at: NOW,
        updated_at: NOW,
        applied_at: null,
      };
      mockTx.schedulingRun.create.mockResolvedValue(createdRun);

      const result = await service.create(TENANT_ID, USER_ID, {
        academic_year_id: AY_ID,
        solver_seed: 12345,
      });

      expect(result['solver_seed']).toBe(12345);
      expect(mockTx.schedulingRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            solver_seed: BigInt(12345),
          }),
        }),
      );
    });

    it('should pass null solver_seed when not provided', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);
      mockPrisma.schedule.count.mockResolvedValue(0);

      const createdRun = {
        id: RUN_ID,
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

      await service.create(TENANT_ID, USER_ID, {
        academic_year_id: AY_ID,
      });

      expect(mockTx.schedulingRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ solver_seed: null }),
        }),
      );
    });
  });

  // ─── getProgress — all phase branches ──────────────────────────────────────

  describe('getProgress — phases', () => {
    it('should return phase "preparing" for queued runs', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'queued',
        entries_generated: null,
        entries_pinned: null,
        entries_unassigned: null,
        solver_duration_ms: null,
        failure_reason: null,
        updated_at: NOW,
      });

      const result = await service.getProgress(TENANT_ID, RUN_ID);

      expect(result.phase).toBe('preparing');
      expect(result.entries_assigned).toBe(0);
      expect(result.elapsed_ms).toBe(0);
    });

    it('should return phase "complete" for applied runs', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        entries_generated: 50,
        entries_pinned: 5,
        entries_unassigned: 0,
        solver_duration_ms: 4000,
        failure_reason: null,
        updated_at: NOW,
      });

      const result = await service.getProgress(TENANT_ID, RUN_ID);

      expect(result.phase).toBe('complete');
      expect(result.entries_assigned).toBe(50);
    });

    it('should return phase "failed" for failed runs', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'failed',
        entries_generated: 10,
        entries_pinned: 0,
        entries_unassigned: 5,
        solver_duration_ms: 1000,
        failure_reason: 'Solver timeout',
        updated_at: NOW,
      });

      const result = await service.getProgress(TENANT_ID, RUN_ID);

      expect(result.phase).toBe('failed');
      expect(result.failure_reason).toBe('Solver timeout');
    });

    it('should return phase "failed" for discarded runs', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'discarded',
        entries_generated: 50,
        entries_pinned: 0,
        entries_unassigned: 0,
        solver_duration_ms: 3000,
        failure_reason: null,
        updated_at: NOW,
      });

      const result = await service.getProgress(TENANT_ID, RUN_ID);

      expect(result.phase).toBe('failed');
    });
  });

  // ─── cancel — running status ──────────────────────────────────────────────

  describe('cancel — running status', () => {
    it('should cancel a running run', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'running',
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
    });

    it('should throw BadRequestException for a failed run', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'failed',
      });

      await expect(service.cancel(TENANT_ID, RUN_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── discard — NotFoundException ──────────────────────────────────────────

  describe('discard — not found', () => {
    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      await expect(
        service.discard(TENANT_ID, 'nonexistent', {
          expected_updated_at: NOW.toISOString(),
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── addAdjustment — success path ──────────────────────────────────────────

  describe('addAdjustment — success', () => {
    it('should append adjustment to existing array and return updated run', async () => {
      const existingAdj = [
        { type: 'remove' as const, class_id: 'c0', weekday: 1, period_order: 1 },
      ];
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        updated_at: NOW,
        proposed_adjustments: existingAdj,
      });
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        solver_seed: null,
        soft_preference_score: null,
        soft_preference_max: null,
        created_at: NOW,
        updated_at: NOW,
        applied_at: null,
      });

      const result = await service.addAdjustment(TENANT_ID, RUN_ID, {
        expected_updated_at: NOW.toISOString(),
        adjustment: { type: 'remove', class_id: 'c1', weekday: 2, period_order: 3 },
      });

      expect(result['id']).toBe(RUN_ID);
      expect(mockTx.schedulingRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: RUN_ID },
          data: expect.objectContaining({
            proposed_adjustments: expect.arrayContaining([
              expect.objectContaining({ class_id: 'c0' }),
              expect.objectContaining({ class_id: 'c1' }),
            ]),
          }),
        }),
      );
    });

    it('edge: should handle null proposed_adjustments as empty array', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        updated_at: NOW,
        proposed_adjustments: null,
      });
      mockTx.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        solver_seed: null,
        soft_preference_score: null,
        soft_preference_max: null,
        created_at: NOW,
        updated_at: NOW,
        applied_at: null,
      });

      await service.addAdjustment(TENANT_ID, RUN_ID, {
        expected_updated_at: NOW.toISOString(),
        adjustment: { type: 'remove', class_id: 'c1', weekday: 1, period_order: 1 },
      });

      expect(mockTx.schedulingRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            proposed_adjustments: [expect.objectContaining({ class_id: 'c1' })],
          }),
        }),
      );
    });
  });

  // ─── findAll — pagination ─────────────────────────────────────────────────

  describe('findAll — formatting', () => {
    it('should format Decimal fields and date strings', async () => {
      const run = {
        id: RUN_ID,
        status: 'completed',
        solver_seed: BigInt(99),
        soft_preference_score: 85.5,
        soft_preference_max: 100.0,
        created_at: 'already-a-string',
        updated_at: NOW,
        applied_at: NOW,
      };
      mockPrisma.schedulingRun.findMany.mockResolvedValue([run]);
      mockPrisma.schedulingRun.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, AY_ID, { page: 1, pageSize: 20 });

      expect(result.data[0]!['solver_seed']).toBe(99);
      expect(result.data[0]!['soft_preference_score']).toBe(85.5);
      expect(result.data[0]!['soft_preference_max']).toBe(100);
      // String date should pass through
      expect(result.data[0]!['created_at']).toBe('already-a-string');
      // Date should be ISO stringified
      expect(result.data[0]!['updated_at']).toBe(NOW.toISOString());
      expect(result.data[0]!['applied_at']).toBe(NOW.toISOString());
    });

    it('should handle null applied_at', async () => {
      const run = {
        id: RUN_ID,
        status: 'queued',
        solver_seed: null,
        soft_preference_score: null,
        soft_preference_max: null,
        created_at: NOW,
        updated_at: NOW,
        applied_at: null,
      };
      mockPrisma.schedulingRun.findMany.mockResolvedValue([run]);
      mockPrisma.schedulingRun.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, AY_ID, { page: 1, pageSize: 10 });

      expect(result.data[0]!['solver_seed']).toBeNull();
      expect(result.data[0]!['soft_preference_score']).toBeNull();
      expect(result.data[0]!['applied_at']).toBeNull();
    });

    it('should compute correct skip for page 2', async () => {
      mockPrisma.schedulingRun.findMany.mockResolvedValue([]);
      mockPrisma.schedulingRun.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, AY_ID, { page: 2, pageSize: 10 });

      expect(mockPrisma.schedulingRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  // ─── parseResultJson — edge cases ──────────────────────────────────────────

  describe('parseResultJson — edge cases', () => {
    it('should return null for undefined input', () => {
      expect(service.parseResultJson(undefined)).toBeNull();
    });

    it('should return null for non-object input', () => {
      expect(service.parseResultJson('string')).toBeNull();
    });

    it('should return null for numeric input', () => {
      expect(service.parseResultJson(42)).toBeNull();
    });
  });
});
