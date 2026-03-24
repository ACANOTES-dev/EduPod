import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RotationService } from './rotation.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACADEMIC_YEAR_ID = 'ay-1';

const mockTx = {
  rotationConfig: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

const makeSavedConfig = (overrides: Partial<{
  id: string;
  cycle_length: number;
  week_labels_json: string[];
  effective_start_date: Date;
  updated_at: Date;
}> = {}) => ({
  id: 'config-1',
  cycle_length: 2,
  week_labels_json: ['Week A', 'Week B'],
  effective_start_date: new Date('2026-09-01'),
  updated_at: new Date('2026-03-01'),
  ...overrides,
});

describe('RotationService', () => {
  let service: RotationService;
  let mockPrisma: {
    academicYear: { findFirst: jest.Mock };
    rotationConfig: { findFirst: jest.Mock };
    schedule: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      academicYear: {
        findFirst: jest.fn().mockResolvedValue({ id: ACADEMIC_YEAR_ID }),
      },
      rotationConfig: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      schedule: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    mockTx.rotationConfig.create.mockResolvedValue(makeSavedConfig());
    mockTx.rotationConfig.update.mockResolvedValue(makeSavedConfig());
    mockTx.rotationConfig.delete.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RotationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RotationService>(RotationService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── upsertRotationConfig ─────────────────────────────────────────────────

  describe('upsertRotationConfig', () => {
    it('should create a new rotation config when none exists', async () => {
      mockPrisma.rotationConfig.findFirst.mockResolvedValue(null);

      const result = await service.upsertRotationConfig(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
        cycle_length: 2,
        week_labels: ['Week A', 'Week B'],
        effective_start_date: '2026-09-01',
      });

      expect(result.cycle_length).toBe(2);
      expect(mockTx.rotationConfig.create).toHaveBeenCalled();
      expect(mockTx.rotationConfig.update).not.toHaveBeenCalled();
    });

    it('should update an existing rotation config when one exists', async () => {
      mockPrisma.rotationConfig.findFirst.mockResolvedValue({ id: 'existing-config' });
      mockTx.rotationConfig.update.mockResolvedValue(makeSavedConfig({ cycle_length: 3, week_labels_json: ['W1', 'W2', 'W3'] }));

      const result = await service.upsertRotationConfig(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
        cycle_length: 3,
        week_labels: ['W1', 'W2', 'W3'],
        effective_start_date: '2026-09-01',
      });

      expect(mockTx.rotationConfig.update).toHaveBeenCalled();
      expect(mockTx.rotationConfig.create).not.toHaveBeenCalled();
      expect(result.cycle_length).toBe(3);
    });

    it('should throw NotFoundException when academic year does not exist', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      await expect(
        service.upsertRotationConfig(TENANT_ID, {
          academic_year_id: 'nonexistent',
          cycle_length: 2,
          week_labels: ['Week A', 'Week B'],
          effective_start_date: '2026-09-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getCurrentRotationWeek ────────────────────────────────────────────────

  describe('getCurrentRotationWeek', () => {
    it('should return week index 0 on the first week of the rotation', async () => {
      mockPrisma.rotationConfig.findFirst.mockResolvedValue({
        id: 'config-1',
        cycle_length: 2,
        week_labels_json: ['Week A', 'Week B'],
        effective_start_date: new Date('2026-01-05'), // A Monday
      });

      // Same week as start
      const result = await service.getCurrentRotationWeek(TENANT_ID, ACADEMIC_YEAR_ID, '2026-01-07');

      expect(result.week_index).toBe(0);
      expect(result.week_label).toBe('Week A');
    });

    it('should return week index 1 after one full week has elapsed', async () => {
      mockPrisma.rotationConfig.findFirst.mockResolvedValue({
        id: 'config-1',
        cycle_length: 2,
        week_labels_json: ['Week A', 'Week B'],
        effective_start_date: new Date('2026-01-05'), // week 0 starts here
      });

      // 7 days later = week 1
      const result = await service.getCurrentRotationWeek(TENANT_ID, ACADEMIC_YEAR_ID, '2026-01-12');

      expect(result.week_index).toBe(1);
      expect(result.week_label).toBe('Week B');
    });

    it('should wrap back to week 0 after completing a full cycle', async () => {
      mockPrisma.rotationConfig.findFirst.mockResolvedValue({
        id: 'config-1',
        cycle_length: 2,
        week_labels_json: ['Week A', 'Week B'],
        effective_start_date: new Date('2026-01-05'),
      });

      // 14 days later = 2 full weeks = cycle wraps back to index 0
      const result = await service.getCurrentRotationWeek(TENANT_ID, ACADEMIC_YEAR_ID, '2026-01-19');

      expect(result.week_index).toBe(0);
      expect(result.weeks_elapsed).toBe(2);
    });

    it('should handle a 4-week cycle correctly', async () => {
      mockPrisma.rotationConfig.findFirst.mockResolvedValue({
        id: 'config-1',
        cycle_length: 4,
        week_labels_json: ['W1', 'W2', 'W3', 'W4'],
        effective_start_date: new Date('2026-01-05'),
      });

      // 21 days = 3 weeks elapsed → index 3
      const result = await service.getCurrentRotationWeek(TENANT_ID, ACADEMIC_YEAR_ID, '2026-01-26');

      expect(result.week_index).toBe(3);
      expect(result.week_label).toBe('W4');
    });

    it('should clamp to week 0 when date is before effective_start_date', async () => {
      mockPrisma.rotationConfig.findFirst.mockResolvedValue({
        id: 'config-1',
        cycle_length: 2,
        week_labels_json: ['Week A', 'Week B'],
        effective_start_date: new Date('2026-09-01'),
      });

      // Date before the effective start
      const result = await service.getCurrentRotationWeek(TENANT_ID, ACADEMIC_YEAR_ID, '2026-01-01');

      expect(result.week_index).toBe(0);
      expect(result.weeks_elapsed).toBe(0);
    });

    it('should throw NotFoundException when no rotation config exists', async () => {
      mockPrisma.rotationConfig.findFirst.mockResolvedValue(null);

      await expect(
        service.getCurrentRotationWeek(TENANT_ID, ACADEMIC_YEAR_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should fall back to Week N label when label array is shorter than cycle', async () => {
      mockPrisma.rotationConfig.findFirst.mockResolvedValue({
        id: 'config-1',
        cycle_length: 3,
        week_labels_json: ['Week A'], // Only one label for a 3-week cycle
        effective_start_date: new Date('2026-01-05'),
      });

      // 7 days = index 1, but no label at index 1
      const result = await service.getCurrentRotationWeek(TENANT_ID, ACADEMIC_YEAR_ID, '2026-01-12');

      expect(result.week_label).toBe('Week 2');
    });
  });

  // ─── deleteRotationConfig ──────────────────────────────────────────────────

  describe('deleteRotationConfig', () => {
    it('should throw ConflictException when schedules reference rotation weeks', async () => {
      mockPrisma.rotationConfig.findFirst.mockResolvedValue({ id: 'config-1' });
      mockPrisma.schedule.findFirst.mockResolvedValue({ id: 'schedule-1' });

      await expect(
        service.deleteRotationConfig(TENANT_ID, ACADEMIC_YEAR_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('should delete config when no schedules reference rotation weeks', async () => {
      mockPrisma.rotationConfig.findFirst.mockResolvedValue({ id: 'config-1' });
      mockPrisma.schedule.findFirst.mockResolvedValue(null);

      const result = await service.deleteRotationConfig(TENANT_ID, ACADEMIC_YEAR_ID);

      expect(result.deleted).toBe(true);
      expect(mockTx.rotationConfig.delete).toHaveBeenCalled();
    });
  });
});
