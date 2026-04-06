import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  ClassesReadFacade,
  AcademicReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { ClassGradeConfigsService } from './class-grade-configs.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SUBJECT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SCALE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CATEGORY_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CONFIG_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  classSubjectGradeConfig: {
    upsert: jest.fn(),
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
    class: { findFirst: jest.fn() },
    subject: { findFirst: jest.fn() },
    gradingScale: { findFirst: jest.fn() },
    assessmentCategory: { findMany: jest.fn() },
    classSubjectGradeConfig: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    grade: { count: jest.fn() },
  };
}

const sampleConfig = {
  id: CONFIG_ID,
  tenant_id: TENANT_ID,
  class_id: CLASS_ID,
  subject_id: SUBJECT_ID,
  grading_scale_id: SCALE_ID,
  category_weight_json: {
    weights: [{ category_id: CATEGORY_ID, weight: 1.0 }],
  },
  grading_scale: { id: SCALE_ID, name: 'Standard Scale' },
};

const validDto = {
  grading_scale_id: SCALE_ID,
  category_weight_json: {
    weights: [{ category_id: CATEGORY_ID, weight: 1.0 }],
  },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ClassGradeConfigsService', () => {
  let service: ClassGradeConfigsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  const mockClassesFacade = { existsOrThrow: jest.fn() };
  const mockAcademicFacade = { findSubjectsGeneric: jest.fn() };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.classSubjectGradeConfig.upsert.mockReset();
    mockRlsTx.classSubjectGradeConfig.delete.mockReset();
    mockClassesFacade.existsOrThrow.mockResolvedValue(true);
    mockAcademicFacade.findSubjectsGeneric.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        ClassGradeConfigsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClassGradeConfigsService>(ClassGradeConfigsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── upsert ───────────────────────────────────────────────────────────────

  describe('upsert', () => {
    it('should throw NotFoundException when class does not exist', async () => {
      mockClassesFacade.existsOrThrow.mockRejectedValue(new NotFoundException('class not found'));

      await expect(service.upsert(TENANT_ID, CLASS_ID, SUBJECT_ID, validDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when subject does not exist', async () => {
      mockAcademicFacade.findSubjectsGeneric.mockResolvedValue([]);

      await expect(service.upsert(TENANT_ID, CLASS_ID, SUBJECT_ID, validDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when subject is not academic', async () => {
      mockAcademicFacade.findSubjectsGeneric.mockResolvedValue([
        { id: SUBJECT_ID, subject_type: 'extracurricular' },
      ]);

      await expect(service.upsert(TENANT_ID, CLASS_ID, SUBJECT_ID, validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when grading scale does not exist', async () => {
      mockAcademicFacade.findSubjectsGeneric.mockResolvedValue([
        { id: SUBJECT_ID, subject_type: 'academic' },
      ]);
      mockPrisma.gradingScale.findFirst.mockResolvedValue(null);

      await expect(service.upsert(TENANT_ID, CLASS_ID, SUBJECT_ID, validDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when a category_id does not exist', async () => {
      mockAcademicFacade.findSubjectsGeneric.mockResolvedValue([
        { id: SUBJECT_ID, subject_type: 'academic' },
      ]);
      mockPrisma.gradingScale.findFirst.mockResolvedValue({ id: SCALE_ID });
      mockPrisma.assessmentCategory.findMany.mockResolvedValue([]); // none found

      await expect(service.upsert(TENANT_ID, CLASS_ID, SUBJECT_ID, validDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should upsert and return config when all validations pass', async () => {
      mockAcademicFacade.findSubjectsGeneric.mockResolvedValue([
        { id: SUBJECT_ID, subject_type: 'academic' },
      ]);
      mockPrisma.gradingScale.findFirst.mockResolvedValue({ id: SCALE_ID });
      mockPrisma.assessmentCategory.findMany.mockResolvedValue([{ id: CATEGORY_ID }]);
      mockRlsTx.classSubjectGradeConfig.upsert.mockResolvedValue(sampleConfig);

      const result = await service.upsert(TENANT_ID, CLASS_ID, SUBJECT_ID, validDto);

      expect(result).toEqual(sampleConfig);
      expect(mockRlsTx.classSubjectGradeConfig.upsert).toHaveBeenCalledTimes(1);
    });
  });

  // ─── findByClass ──────────────────────────────────────────────────────────

  describe('findByClass', () => {
    it('should return configs with resolved category names', async () => {
      mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue([
        {
          ...sampleConfig,
          subject: { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
        },
      ]);
      mockPrisma.assessmentCategory.findMany.mockResolvedValue([
        { id: CATEGORY_ID, name: 'Quizzes' },
      ]);

      const result = await service.findByClass(TENANT_ID, CLASS_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.category_weights[0]?.category_name).toBe('Quizzes');
    });

    it('should fall back to "Unknown" when a category cannot be resolved', async () => {
      mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue([sampleConfig]);
      mockPrisma.assessmentCategory.findMany.mockResolvedValue([]);

      const result = await service.findByClass(TENANT_ID, CLASS_ID);

      expect(result.data[0]?.category_weights[0]?.category_name).toBe('Unknown');
    });

    it('should return empty data when no configs exist for the class', async () => {
      mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue([]);

      const result = await service.findByClass(TENANT_ID, CLASS_ID);

      expect(result.data).toHaveLength(0);
      expect(mockPrisma.assessmentCategory.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should throw NotFoundException when config does not exist', async () => {
      mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(null);

      await expect(service.findOne(TENANT_ID, CLASS_ID, SUBJECT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return config when it exists', async () => {
      mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(sampleConfig);

      const result = await service.findOne(TENANT_ID, CLASS_ID, SUBJECT_ID);

      expect(result).toEqual(sampleConfig);
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should throw NotFoundException when config does not exist', async () => {
      mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, CLASS_ID, SUBJECT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException when graded assessments exist for the class+subject', async () => {
      mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({ id: CONFIG_ID });
      mockPrisma.grade.count.mockResolvedValue(3);

      await expect(service.delete(TENANT_ID, CLASS_ID, SUBJECT_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should delete config when no graded assessments exist', async () => {
      mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({ id: CONFIG_ID });
      mockPrisma.grade.count.mockResolvedValue(0);
      mockRlsTx.classSubjectGradeConfig.delete.mockResolvedValue(sampleConfig);

      const result = await service.delete(TENANT_ID, CLASS_ID, SUBJECT_ID);

      expect(result).toEqual(sampleConfig);
      expect(mockRlsTx.classSubjectGradeConfig.delete).toHaveBeenCalledWith({
        where: { id: CONFIG_ID },
      });
    });
  });
});
