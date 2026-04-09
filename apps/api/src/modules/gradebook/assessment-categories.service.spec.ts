import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { AssessmentCategoriesService } from './assessment-categories.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CATEGORY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = '33333333-3333-3333-3333-333333333333';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  assessmentCategory: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: typeof mockRlsTx) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    assessmentCategory: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    assessment: { count: jest.fn() },
  };
}

const sampleCategory = {
  id: CATEGORY_ID,
  tenant_id: TENANT_ID,
  name: 'Quizzes',
  default_weight: 0.3,
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AssessmentCategoriesService', () => {
  let service: AssessmentCategoriesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.assessmentCategory.create.mockReset();
    mockRlsTx.assessmentCategory.update.mockReset();
    mockRlsTx.assessmentCategory.delete.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AssessmentCategoriesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<AssessmentCategoriesService>(AssessmentCategoriesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create and return a new assessment category with numeric default_weight', async () => {
      mockRlsTx.assessmentCategory.create.mockResolvedValue(sampleCategory);

      const result = await service.create(TENANT_ID, USER_ID, {
        name: 'Quizzes',
        default_weight: 0.3,
      });

      expect(result.name).toBe('Quizzes');
      expect(typeof result.default_weight).toBe('number');
      expect(mockRlsTx.assessmentCategory.create).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictException on duplicate name (P2002)', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockRlsTx.assessmentCategory.create.mockRejectedValue(p2002);

      await expect(
        service.create(TENANT_ID, USER_ID, { name: 'Quizzes', default_weight: 0.3 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return all categories with in_use flag', async () => {
      mockPrisma.assessmentCategory.findMany.mockResolvedValue([
        { ...sampleCategory, _count: { assessments: 3 } },
      ]);

      const result = await service.findAll(TENANT_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.in_use).toBe(true);
    });

    it('should set in_use=false when assessment count is zero', async () => {
      mockPrisma.assessmentCategory.findMany.mockResolvedValue([
        { ...sampleCategory, _count: { assessments: 0 } },
      ]);

      const result = await service.findAll(TENANT_ID);

      expect(result.data[0]?.in_use).toBe(false);
    });

    it('should return empty data when no categories exist', async () => {
      mockPrisma.assessmentCategory.findMany.mockResolvedValue([]);

      const result = await service.findAll(TENANT_ID);

      expect(result.data).toHaveLength(0);
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should throw NotFoundException when category does not exist', async () => {
      mockPrisma.assessmentCategory.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, CATEGORY_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return category with numeric default_weight', async () => {
      mockPrisma.assessmentCategory.findFirst.mockResolvedValue(sampleCategory);

      const result = await service.findOne(TENANT_ID, CATEGORY_ID);

      expect(result.id).toBe(CATEGORY_ID);
      expect(typeof result.default_weight).toBe('number');
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should throw NotFoundException when category does not exist', async () => {
      mockPrisma.assessmentCategory.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, CATEGORY_ID, USER_ID, { name: 'Exams' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update category name and return updated record', async () => {
      mockPrisma.assessmentCategory.findFirst.mockResolvedValue({
        id: CATEGORY_ID,
        created_by_user_id: null,
        subject_id: null,
        year_group_id: null,
        status: 'approved',
      });
      mockRlsTx.assessmentCategory.update.mockResolvedValue({ ...sampleCategory, name: 'Exams' });

      const result = await service.update(TENANT_ID, CATEGORY_ID, USER_ID, { name: 'Exams' });

      expect(result.name).toBe('Exams');
      expect(mockRlsTx.assessmentCategory.update).toHaveBeenCalledTimes(1);
    });

    it('should throw ConflictException on duplicate name during update', async () => {
      mockPrisma.assessmentCategory.findFirst.mockResolvedValue({
        id: CATEGORY_ID,
        created_by_user_id: null,
        subject_id: null,
        year_group_id: null,
        status: 'approved',
      });
      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });
      mockRlsTx.assessmentCategory.update.mockRejectedValue(p2002);

      await expect(
        service.update(TENANT_ID, CATEGORY_ID, USER_ID, { name: 'Exams' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should allow admins to update approved global categories created by another user', async () => {
      mockPrisma.assessmentCategory.findFirst.mockResolvedValue({
        id: CATEGORY_ID,
        created_by_user_id: '44444444-4444-4444-4444-444444444444',
        subject_id: null,
        year_group_id: null,
        status: 'approved',
      });
      mockRlsTx.assessmentCategory.update.mockResolvedValue({ ...sampleCategory, name: 'Global Exams' });

      const result = await service.update(TENANT_ID, CATEGORY_ID, USER_ID, { name: 'Global Exams' });

      expect(result.name).toBe('Global Exams');
      expect(mockRlsTx.assessmentCategory.update).toHaveBeenCalledTimes(1);
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should throw NotFoundException when category does not exist', async () => {
      mockPrisma.assessmentCategory.findFirst.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, CATEGORY_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException when assessments reference the category', async () => {
      mockPrisma.assessmentCategory.findFirst.mockResolvedValue({
        id: CATEGORY_ID,
        created_by_user_id: null,
        subject_id: null,
        year_group_id: null,
      });
      mockPrisma.assessment.count.mockResolvedValue(5);

      await expect(service.delete(TENANT_ID, CATEGORY_ID, USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should delete the category when no assessments reference it', async () => {
      mockPrisma.assessmentCategory.findFirst.mockResolvedValue({
        id: CATEGORY_ID,
        created_by_user_id: null,
        subject_id: null,
        year_group_id: null,
      });
      mockPrisma.assessment.count.mockResolvedValue(0);
      mockRlsTx.assessmentCategory.delete.mockResolvedValue(sampleCategory);

      const result = await service.delete(TENANT_ID, CATEGORY_ID, USER_ID);

      expect(result).toEqual(sampleCategory);
      expect(mockRlsTx.assessmentCategory.delete).toHaveBeenCalledWith({
        where: { id: CATEGORY_ID },
      });
    });

    it('should allow admins to delete global categories created by another user', async () => {
      mockPrisma.assessmentCategory.findFirst.mockResolvedValue({
        id: CATEGORY_ID,
        created_by_user_id: '44444444-4444-4444-4444-444444444444',
        subject_id: null,
        year_group_id: null,
      });
      mockPrisma.assessment.count.mockResolvedValue(0);
      mockRlsTx.assessmentCategory.delete.mockResolvedValue(sampleCategory);

      const result = await service.delete(TENANT_ID, CATEGORY_ID, USER_ID);

      expect(result).toEqual(sampleCategory);
      expect(mockRlsTx.assessmentCategory.delete).toHaveBeenCalledWith({
        where: { id: CATEGORY_ID },
      });
    });
  });
});
