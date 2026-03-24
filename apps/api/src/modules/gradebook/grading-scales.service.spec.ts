import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { GradingScalesService } from './grading-scales.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SCALE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  gradingScale: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: typeof mockRlsTx) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    gradingScale: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    classSubjectGradeConfig: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    grade: { count: jest.fn() },
  };
}

const sampleScale = {
  id: SCALE_ID,
  tenant_id: TENANT_ID,
  name: 'Standard Scale',
  config_json: { type: 'numeric' as const, ranges: [{ label: 'A', min: 90, max: 100 }] },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GradingScalesService', () => {
  let service: GradingScalesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.gradingScale.create.mockReset();
    mockRlsTx.gradingScale.update.mockReset();
    mockRlsTx.gradingScale.delete.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradingScalesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GradingScalesService>(GradingScalesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create and return a new grading scale', async () => {
      mockRlsTx.gradingScale.create.mockResolvedValue(sampleScale);

      const result = await service.create(TENANT_ID, {
        name: 'Standard Scale',
        config_json: { type: 'numeric' as const, ranges: [{ label: 'A', min: 90, max: 100 }] },
      });

      expect(result).toEqual(sampleScale);
      expect(mockRlsTx.gradingScale.create).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictException on duplicate name (P2002)', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockRlsTx.gradingScale.create.mockRejectedValue(p2002);

      await expect(
        service.create(TENANT_ID, { name: 'Standard Scale', config_json: { type: 'numeric' as const, ranges: [{ label: 'A', min: 90, max: 100 }] } }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated grading scales with meta', async () => {
      mockPrisma.gradingScale.findMany.mockResolvedValue([sampleScale]);
      mockPrisma.gradingScale.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should return empty data when no scales exist', async () => {
      mockPrisma.gradingScale.findMany.mockResolvedValue([]);
      mockPrisma.gradingScale.count.mockResolvedValue(0);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should throw NotFoundException when scale does not exist', async () => {
      mockPrisma.gradingScale.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, SCALE_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return scale with is_in_use=false when no configs reference it', async () => {
      mockPrisma.gradingScale.findFirst.mockResolvedValue(sampleScale);
      mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue([]);

      const result = await service.findOne(TENANT_ID, SCALE_ID);

      expect(result.is_in_use).toBe(false);
    });

    it('should return is_in_use=true when configs reference it and grades exist', async () => {
      mockPrisma.gradingScale.findFirst.mockResolvedValue(sampleScale);
      mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue([
        { class_id: 'class-1', subject_id: 'subject-1' },
      ]);
      mockPrisma.grade.count.mockResolvedValue(5);

      const result = await service.findOne(TENANT_ID, SCALE_ID);

      expect(result.is_in_use).toBe(true);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should throw NotFoundException when scale does not exist', async () => {
      mockPrisma.gradingScale.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, SCALE_ID, { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when updating config of an in-use scale', async () => {
      mockPrisma.gradingScale.findFirst.mockResolvedValue({ id: SCALE_ID });
      mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue([
        { class_id: 'class-1', subject_id: 'subject-1' },
      ]);
      mockPrisma.grade.count.mockResolvedValue(3);

      await expect(
        service.update(TENANT_ID, SCALE_ID, { config_json: { type: 'numeric' as const, ranges: [{ min: 0, max: 100, label: 'A' }] } }),
      ).rejects.toThrow(ConflictException);
    });

    it('should update name without checking in-use status', async () => {
      mockPrisma.gradingScale.findFirst.mockResolvedValue({ id: SCALE_ID });
      mockRlsTx.gradingScale.update.mockResolvedValue({ ...sampleScale, name: 'Updated Name' });

      const result = await service.update(TENANT_ID, SCALE_ID, { name: 'Updated Name' });

      expect(result).toMatchObject({ name: 'Updated Name' });
      expect(mockPrisma.classSubjectGradeConfig.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should throw NotFoundException when scale does not exist', async () => {
      mockPrisma.gradingScale.findFirst.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, SCALE_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when grade configs reference the scale', async () => {
      mockPrisma.gradingScale.findFirst.mockResolvedValue({ id: SCALE_ID });
      mockPrisma.classSubjectGradeConfig.count.mockResolvedValue(2);

      await expect(service.delete(TENANT_ID, SCALE_ID)).rejects.toThrow(ConflictException);
    });

    it('should delete the scale when no configs reference it', async () => {
      mockPrisma.gradingScale.findFirst.mockResolvedValue({ id: SCALE_ID });
      mockPrisma.classSubjectGradeConfig.count.mockResolvedValue(0);
      mockRlsTx.gradingScale.delete.mockResolvedValue(sampleScale);

      const result = await service.delete(TENANT_ID, SCALE_ID);

      expect(result).toEqual(sampleScale);
      expect(mockRlsTx.gradingScale.delete).toHaveBeenCalledWith({ where: { id: SCALE_ID } });
    });
  });

  // ─── isInUse ──────────────────────────────────────────────────────────────

  describe('isInUse', () => {
    it('should return false when no grade configs reference the scale', async () => {
      mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue([]);

      const result = await service.isInUse(TENANT_ID, SCALE_ID);

      expect(result).toBe(false);
    });

    it('should return false when configs exist but no grades have raw_score', async () => {
      mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue([
        { class_id: 'class-1', subject_id: 'subject-1' },
      ]);
      mockPrisma.grade.count.mockResolvedValue(0);

      const result = await service.isInUse(TENANT_ID, SCALE_ID);

      expect(result).toBe(false);
    });

    it('should return true when configs exist and grades have raw_scores', async () => {
      mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue([
        { class_id: 'class-1', subject_id: 'subject-1' },
      ]);
      mockPrisma.grade.count.mockResolvedValue(10);

      const result = await service.isInUse(TENANT_ID, SCALE_ID);

      expect(result).toBe(true);
    });
  });
});
