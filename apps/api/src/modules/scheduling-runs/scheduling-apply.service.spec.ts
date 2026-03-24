/* eslint-disable import/order -- jest.mock must precede mocked imports */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

const mockDb = {
  $queryRaw: jest.fn(),
  class: { findMany: jest.fn() },
  schedulePeriodTemplate: { findMany: jest.fn() },
  schedule: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  schedulingRun: { update: jest.fn() },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockDb),
      ),
  }),
}));

import { PeriodGridService } from '../period-grid/period-grid.service';
import { PrismaService } from '../prisma/prisma.service';

import { SchedulingApplyService } from './scheduling-apply.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-uuid-0001';
const RUN_ID = 'run-uuid-0001';
const AY_ID = 'ay-uuid-0001';
const NOW = new Date('2026-03-01T12:00:00Z');

const baseRun = {
  id: RUN_ID,
  tenant_id: TENANT_ID,
  academic_year_id: AY_ID,
  status: 'completed',
  updated_at: NOW,
  config_snapshot: { grid_hash: 'hash-abc' },
  result_json: {
    entries: [
      {
        class_id: 'cls-1',
        room_id: 'room-1',
        teacher_staff_id: 'staff-1',
        weekday: 1,
        period_order: 1,
        start_time: '09:00',
        end_time: '09:45',
        is_pinned: false,
        preference_satisfaction: [],
      },
    ],
    unassigned: [],
  },
  proposed_adjustments: [],
};

describe('SchedulingApplyService', () => {
  let service: SchedulingApplyService;
  let mockPrisma: Record<string, unknown>;
  let mockPeriodGridService: { getGridHash: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {};
    mockPeriodGridService = {
      getGridHash: jest.fn().mockResolvedValue('hash-abc'),
    };

    // Reset all mockDb methods
    mockDb.$queryRaw.mockReset();
    mockDb.class.findMany.mockReset();
    mockDb.schedulePeriodTemplate.findMany.mockReset();
    mockDb.schedule.findMany.mockReset();
    mockDb.schedule.create.mockReset();
    mockDb.schedule.update.mockReset();
    mockDb.schedule.delete.mockReset();
    mockDb.schedulingRun.update.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulingApplyService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PeriodGridService, useValue: mockPeriodGridService },
      ],
    }).compile();

    service = module.get<SchedulingApplyService>(SchedulingApplyService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Successful apply ──────────────────────────────────────────────────────

  describe('apply (happy path)', () => {
    it('should apply a completed run and mark it as applied', async () => {
      mockDb.$queryRaw.mockResolvedValue([{ ...baseRun }]);
      mockDb.class.findMany.mockResolvedValue([{ id: 'cls-1' }]);
      mockDb.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockDb.schedule.findMany.mockResolvedValue([]);
      mockDb.schedule.create.mockResolvedValue({});

      const appliedRun = {
        id: RUN_ID,
        status: 'applied',
        applied_by_user_id: USER_ID,
        applied_at: NOW,
        solver_seed: null,
        soft_preference_score: null,
        soft_preference_max: null,
        created_at: NOW,
        updated_at: NOW,
      };
      mockDb.schedulingRun.update.mockResolvedValue(appliedRun);

      const result = await service.apply(TENANT_ID, RUN_ID, USER_ID, {
        expected_updated_at: NOW.toISOString(),
      });

      expect(result['status']).toBe('applied');
      expect(mockDb.schedulingRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: RUN_ID },
          data: expect.objectContaining({
            status: 'applied',
            applied_by_user_id: USER_ID,
          }),
        }),
      );
    });

    it('should end-date existing auto_generated schedules with attendance', async () => {
      mockDb.$queryRaw.mockResolvedValue([{ ...baseRun }]);
      mockDb.class.findMany.mockResolvedValue([{ id: 'cls-1' }]);
      mockDb.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockDb.schedule.findMany.mockResolvedValue([
        { id: 'sched-old', class_id: 'cls-1', _count: { attendance_sessions: 3 } },
      ]);
      mockDb.schedule.create.mockResolvedValue({});
      mockDb.schedule.update.mockResolvedValue({});
      mockDb.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        solver_seed: null,
        soft_preference_score: null,
        soft_preference_max: null,
        created_at: NOW,
        updated_at: NOW,
        applied_at: NOW,
      });

      await service.apply(TENANT_ID, RUN_ID, USER_ID, {
        expected_updated_at: NOW.toISOString(),
      });

      // Should end-date the existing schedule, not delete it
      expect(mockDb.schedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sched-old' },
          data: expect.objectContaining({
            effective_end_date: expect.any(Date),
          }),
        }),
      );
      expect(mockDb.schedule.delete).not.toHaveBeenCalled();
    });

    it('should delete existing auto_generated schedules without attendance', async () => {
      mockDb.$queryRaw.mockResolvedValue([{ ...baseRun }]);
      mockDb.class.findMany.mockResolvedValue([{ id: 'cls-1' }]);
      mockDb.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockDb.schedule.findMany.mockResolvedValue([
        { id: 'sched-old', class_id: 'cls-1', _count: { attendance_sessions: 0 } },
      ]);
      mockDb.schedule.create.mockResolvedValue({});
      mockDb.schedule.delete.mockResolvedValue({});
      mockDb.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        solver_seed: null,
        soft_preference_score: null,
        soft_preference_max: null,
        created_at: NOW,
        updated_at: NOW,
        applied_at: NOW,
      });

      await service.apply(TENANT_ID, RUN_ID, USER_ID, {
        expected_updated_at: NOW.toISOString(),
      });

      expect(mockDb.schedule.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'sched-old' } }),
      );
    });
  });

  // ─── Error paths ───────────────────────────────────────────────────────────

  describe('apply (error paths)', () => {
    it('should throw NotFoundException when run does not exist', async () => {
      mockDb.$queryRaw.mockResolvedValue([]);

      await expect(
        service.apply(TENANT_ID, RUN_ID, USER_ID, {
          expected_updated_at: NOW.toISOString(),
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when run status is not completed', async () => {
      mockDb.$queryRaw.mockResolvedValue([
        { ...baseRun, status: 'running' },
      ]);

      await expect(
        service.apply(TENANT_ID, RUN_ID, USER_ID, {
          expected_updated_at: NOW.toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException on stale updated_at (optimistic concurrency)', async () => {
      const staleDate = new Date('2026-02-01T00:00:00Z');
      mockDb.$queryRaw.mockResolvedValue([{ ...baseRun }]);

      await expect(
        service.apply(TENANT_ID, RUN_ID, USER_ID, {
          expected_updated_at: staleDate.toISOString(),
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when period grid hash has changed', async () => {
      mockDb.$queryRaw.mockResolvedValue([{ ...baseRun }]);
      mockPeriodGridService.getGridHash.mockResolvedValue('hash-different');

      await expect(
        service.apply(TENANT_ID, RUN_ID, USER_ID, {
          expected_updated_at: NOW.toISOString(),
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when run has no result_json', async () => {
      mockDb.$queryRaw.mockResolvedValue([
        { ...baseRun, result_json: null },
      ]);

      await expect(
        service.apply(TENANT_ID, RUN_ID, USER_ID, {
          expected_updated_at: NOW.toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Filtering inactive classes ─────────────────────────────────────────────

  describe('apply (class filtering)', () => {
    it('should skip entries for inactive classes', async () => {
      mockDb.$queryRaw.mockResolvedValue([{ ...baseRun }]);
      // cls-1 is NOT in active classes — simulate inactive
      mockDb.class.findMany.mockResolvedValue([]);
      mockDb.schedulePeriodTemplate.findMany.mockResolvedValue([]);
      mockDb.schedule.findMany.mockResolvedValue([]);
      mockDb.schedulingRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        solver_seed: null,
        soft_preference_score: null,
        soft_preference_max: null,
        created_at: NOW,
        updated_at: NOW,
        applied_at: NOW,
      });

      await service.apply(TENANT_ID, RUN_ID, USER_ID, {
        expected_updated_at: NOW.toISOString(),
      });

      // schedule.create should NOT be called since the class is inactive
      expect(mockDb.schedule.create).not.toHaveBeenCalled();
    });
  });
});
