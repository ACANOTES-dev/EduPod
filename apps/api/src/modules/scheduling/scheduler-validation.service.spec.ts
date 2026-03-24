import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { validateSchedule } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { SchedulerOrchestrationService } from './scheduler-orchestration.service';
import { SchedulerValidationService } from './scheduler-validation.service';

jest.mock('@school/shared', () => ({
  validateSchedule: jest.fn(),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const RUN_ID = 'run-1';
const AY_ID = 'ay-1';

const mockValidationResult = {
  violations: [],
  health_score: 100,
  summary: { tier1: 0, tier2: 0, tier3: 0 },
  cell_violations: {},
};

const mockConfigSnapshot = {
  year_groups: [],
  curriculum: [],
  teachers: [],
  rooms: [],
  room_closures: [],
  break_groups: [],
  pinned_entries: [],
  student_overlaps: [],
  settings: {
    max_solver_duration_seconds: 120,
    preference_weights: { low: 1, medium: 2, high: 3 },
    global_soft_weights: {
      even_subject_spread: 2,
      minimise_teacher_gaps: 1,
      room_consistency: 1,
      workload_balance: 1,
      break_duty_balance: 1,
    },
    solver_seed: null,
  },
};

const mockResultJson = {
  entries: [
    {
      class_id: 'cls-1',
      subject_id: 'sub-1',
      year_group_id: 'yg-1',
      teacher_staff_id: 'staff-1',
      room_id: 'room-1',
      weekday: 1,
      period_order: 1,
      is_pinned: false,
      is_supervision: false,
      start_time: null,
      end_time: null,
    },
  ],
  unassigned: [],
};

describe('SchedulerValidationService', () => {
  let service: SchedulerValidationService;
  let mockPrisma: {
    schedulingRun: { findFirst: jest.Mock };
  };
  let mockOrchestration: {
    assembleSolverInput: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      schedulingRun: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    mockOrchestration = {
      assembleSolverInput: jest.fn().mockResolvedValue(mockConfigSnapshot),
    };

    (validateSchedule as jest.Mock).mockReturnValue(mockValidationResult);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerValidationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SchedulerOrchestrationService, useValue: mockOrchestration },
      ],
    }).compile();

    service = module.get<SchedulerValidationService>(SchedulerValidationService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── validateRun ─────────────────────────────────────────────────────────────

  describe('validateRun', () => {
    it('should validate a completed run using config_snapshot', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: mockResultJson,
        config_snapshot: mockConfigSnapshot,
        proposed_adjustments: null,
      });

      const result = await service.validateRun(TENANT_ID, RUN_ID);

      expect(result.health_score).toBe(100);
      expect(result.summary.tier1).toBe(0);
      expect(validateSchedule).toHaveBeenCalledWith(mockConfigSnapshot, mockResultJson.entries);
    });

    it('should fall back to assembleSolverInput when config_snapshot is null', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: mockResultJson,
        config_snapshot: null,
        proposed_adjustments: null,
      });

      await service.validateRun(TENANT_ID, RUN_ID);

      expect(mockOrchestration.assembleSolverInput).toHaveBeenCalledWith(TENANT_ID, AY_ID);
    });

    it('should also accept applied runs for validation', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'applied',
        academic_year_id: AY_ID,
        result_json: mockResultJson,
        config_snapshot: mockConfigSnapshot,
        proposed_adjustments: null,
      });

      const result = await service.validateRun(TENANT_ID, RUN_ID);

      expect(result.health_score).toBe(100);
    });

    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      await expect(service.validateRun(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when run is not completed or applied', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'running',
      });

      await expect(service.validateRun(TENANT_ID, RUN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when run has no result_json', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        result_json: null,
        config_snapshot: mockConfigSnapshot,
        proposed_adjustments: null,
      });

      await expect(service.validateRun(TENANT_ID, RUN_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should include proposed_adjustments when present', async () => {
      const adjustedValidation = {
        ...mockValidationResult,
        health_score: 95,
        summary: { tier1: 0, tier2: 1, tier3: 0 },
      };
      (validateSchedule as jest.Mock).mockReturnValue(adjustedValidation);

      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: mockResultJson,
        config_snapshot: mockConfigSnapshot,
        proposed_adjustments: [
          {
            type: 'teacher_change',
            class_id: 'cls-1',
            weekday: 1,
            period_order: 1,
            new_teacher_staff_id: 'staff-2',
          },
        ],
      });

      const result = await service.validateRun(TENANT_ID, RUN_ID);

      expect(result.health_score).toBe(95);
      // The entries passed to validateSchedule should have the teacher changed
      const callArgs = (validateSchedule as jest.Mock).mock.calls[0];
      const entries = callArgs[1] as Array<{ teacher_staff_id: string }>;
      expect(entries[0]!.teacher_staff_id).toBe('staff-2');
    });
  });

  // ─── validateAdjustments ─────────────────────────────────────────────────────

  describe('validateAdjustments', () => {
    it('should validate a run with new adjustments', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: mockResultJson,
        config_snapshot: mockConfigSnapshot,
        proposed_adjustments: null,
      });

      const adjustments = [
        {
          type: 'teacher_change',
          class_id: 'cls-1',
          weekday: 1,
          period_order: 1,
          new_teacher_staff_id: 'staff-2',
        },
      ];

      const result = await service.validateAdjustments(TENANT_ID, RUN_ID, adjustments);

      expect(result).toEqual(mockValidationResult);
      const callArgs = (validateSchedule as jest.Mock).mock.calls[0];
      const entries = callArgs[1] as Array<{ teacher_staff_id: string }>;
      expect(entries[0]!.teacher_staff_id).toBe('staff-2');
    });

    it('should combine existing proposed_adjustments with new ones', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: {
          entries: [
            { ...mockResultJson.entries[0], class_id: 'cls-1', weekday: 1, period_order: 1 },
            {
              class_id: 'cls-2',
              subject_id: 'sub-2',
              year_group_id: 'yg-1',
              teacher_staff_id: 'staff-3',
              room_id: 'room-2',
              weekday: 1,
              period_order: 2,
              is_pinned: false,
              is_supervision: false,
              start_time: null,
              end_time: null,
            },
          ],
          unassigned: [],
        },
        config_snapshot: mockConfigSnapshot,
        proposed_adjustments: [
          {
            type: 'teacher_change',
            class_id: 'cls-1',
            weekday: 1,
            period_order: 1,
            new_teacher_staff_id: 'staff-2',
          },
        ],
      });

      const newAdjustments = [
        {
          type: 'remove',
          class_id: 'cls-2',
          weekday: 1,
          period_order: 2,
        },
      ];

      await service.validateAdjustments(TENANT_ID, RUN_ID, newAdjustments);

      const callArgs = (validateSchedule as jest.Mock).mock.calls[0];
      const entries = callArgs[1] as Array<{ class_id: string; teacher_staff_id: string }>;
      // cls-1 should have teacher changed, cls-2 should be removed
      expect(entries.length).toBe(1);
      expect(entries[0]!.class_id).toBe('cls-1');
      expect(entries[0]!.teacher_staff_id).toBe('staff-2');
    });

    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      await expect(
        service.validateAdjustments(TENANT_ID, 'nonexistent', []),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when run has no result_json', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        result_json: null,
        config_snapshot: mockConfigSnapshot,
        proposed_adjustments: null,
      });

      await expect(
        service.validateAdjustments(TENANT_ID, RUN_ID, []),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle move adjustment type', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: mockResultJson,
        config_snapshot: mockConfigSnapshot,
        proposed_adjustments: null,
      });

      const adjustments = [
        {
          type: 'move',
          class_id: 'cls-1',
          from_weekday: 1,
          from_period_order: 1,
          to_weekday: 2,
          to_period_order: 3,
        },
      ];

      await service.validateAdjustments(TENANT_ID, RUN_ID, adjustments);

      const callArgs = (validateSchedule as jest.Mock).mock.calls[0];
      const entries = callArgs[1] as Array<{ weekday: number; period_order: number }>;
      expect(entries[0]!.weekday).toBe(2);
      expect(entries[0]!.period_order).toBe(3);
    });

    it('should handle swap adjustment type', async () => {
      const twoEntryResult = {
        entries: [
          { ...mockResultJson.entries[0], class_id: 'cls-1', weekday: 1, period_order: 1 },
          {
            class_id: 'cls-2',
            subject_id: 'sub-2',
            year_group_id: 'yg-1',
            teacher_staff_id: 'staff-2',
            room_id: 'room-2',
            weekday: 2,
            period_order: 2,
            is_pinned: false,
            is_supervision: false,
            start_time: null,
            end_time: null,
          },
        ],
        unassigned: [],
      };

      mockPrisma.schedulingRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        status: 'completed',
        academic_year_id: AY_ID,
        result_json: twoEntryResult,
        config_snapshot: mockConfigSnapshot,
        proposed_adjustments: null,
      });

      const adjustments = [
        {
          type: 'swap',
          entry_a: { class_id: 'cls-1', weekday: 1, period_order: 1 },
          entry_b: { class_id: 'cls-2', weekday: 2, period_order: 2 },
        },
      ];

      await service.validateAdjustments(TENANT_ID, RUN_ID, adjustments);

      const callArgs = (validateSchedule as jest.Mock).mock.calls[0];
      const entries = callArgs[1] as Array<{
        class_id: string;
        weekday: number;
        period_order: number;
      }>;
      const cls1 = entries.find((e) => e.class_id === 'cls-1');
      const cls2 = entries.find((e) => e.class_id === 'cls-2');
      // Positions should be swapped
      expect(cls1?.weekday).toBe(2);
      expect(cls1?.period_order).toBe(2);
      expect(cls2?.weekday).toBe(1);
      expect(cls2?.period_order).toBe(1);
    });
  });
});
