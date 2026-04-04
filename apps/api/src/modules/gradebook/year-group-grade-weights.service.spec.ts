import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AcademicReadFacade, MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { YearGroupGradeWeightsService } from './year-group-grade-weights.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const YEAR_GROUP_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PERIOD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CATEGORY_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const TARGET_YEAR_GROUP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  yearGroupGradeWeight: {
    upsert: jest.fn(),
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
    yearGroup: { findFirst: jest.fn() },
    academicPeriod: { findFirst: jest.fn() },
    assessmentCategory: { findMany: jest.fn() },
    yearGroupGradeWeight: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
}

const sampleWeight = {
  id: 'weight-1',
  tenant_id: TENANT_ID,
  year_group_id: YEAR_GROUP_ID,
  academic_period_id: PERIOD_ID,
  category_weights_json: {
    weights: [{ category_id: CATEGORY_ID, weight: 1.0 }],
  },
};

const validDto = {
  year_group_id: YEAR_GROUP_ID,
  academic_period_id: PERIOD_ID,
  category_weights: [{ category_id: CATEGORY_ID, weight: 1.0 }],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('YearGroupGradeWeightsService', () => {
  let service: YearGroupGradeWeightsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockAcademicFacade: {
    findYearGroupByIdOrThrow: jest.Mock;
    findPeriodById: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.yearGroupGradeWeight.upsert.mockReset();
    mockRlsTx.yearGroupGradeWeight.delete.mockReset();
    mockAcademicFacade = {
      findYearGroupByIdOrThrow: jest.fn().mockResolvedValue(undefined),
      findPeriodById: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        YearGroupGradeWeightsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
      ],
    }).compile();

    service = module.get<YearGroupGradeWeightsService>(YearGroupGradeWeightsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── upsert ───────────────────────────────────────────────────────────────

  describe('upsert', () => {
    it('should throw NotFoundException when year group does not exist', async () => {
      mockAcademicFacade.findYearGroupByIdOrThrow.mockRejectedValue(
        new NotFoundException({ code: 'YEAR_GROUP_NOT_FOUND', message: 'Year group not found' }),
      );

      await expect(service.upsert(TENANT_ID, validDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when academic period does not exist', async () => {
      mockAcademicFacade.findYearGroupByIdOrThrow.mockResolvedValue(undefined);
      mockAcademicFacade.findPeriodById.mockResolvedValue(null);

      await expect(service.upsert(TENANT_ID, validDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when a category_id does not exist', async () => {
      mockAcademicFacade.findYearGroupByIdOrThrow.mockResolvedValue(undefined);
      mockAcademicFacade.findPeriodById.mockResolvedValue({ id: PERIOD_ID });
      mockPrisma.assessmentCategory.findMany.mockResolvedValue([]); // none found

      await expect(service.upsert(TENANT_ID, validDto)).rejects.toThrow(NotFoundException);
    });

    it('should upsert and return weight config when all validations pass', async () => {
      mockAcademicFacade.findYearGroupByIdOrThrow.mockResolvedValue(undefined);
      mockAcademicFacade.findPeriodById.mockResolvedValue({ id: PERIOD_ID });
      mockPrisma.assessmentCategory.findMany.mockResolvedValue([{ id: CATEGORY_ID }]);
      mockRlsTx.yearGroupGradeWeight.upsert.mockResolvedValue(sampleWeight);

      const result = await service.upsert(TENANT_ID, validDto);

      expect(result).toEqual(sampleWeight);
      expect(mockRlsTx.yearGroupGradeWeight.upsert).toHaveBeenCalledTimes(1);
    });
  });

  // ─── findByYearGroup ──────────────────────────────────────────────────────

  describe('findByYearGroup', () => {
    it('should throw NotFoundException when year group does not exist', async () => {
      mockAcademicFacade.findYearGroupByIdOrThrow.mockRejectedValue(
        new NotFoundException({ code: 'YEAR_GROUP_NOT_FOUND', message: 'Year group not found' }),
      );

      await expect(service.findByYearGroup(TENANT_ID, YEAR_GROUP_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return empty data when no configs exist for the year group', async () => {
      mockAcademicFacade.findYearGroupByIdOrThrow.mockResolvedValue(undefined);
      mockPrisma.yearGroupGradeWeight.findMany.mockResolvedValue([]);

      const result = await service.findByYearGroup(TENANT_ID, YEAR_GROUP_ID);

      expect(result.data).toHaveLength(0);
    });

    it('should return configs with resolved category names', async () => {
      mockAcademicFacade.findYearGroupByIdOrThrow.mockResolvedValue(undefined);
      mockPrisma.yearGroupGradeWeight.findMany.mockResolvedValue([
        {
          ...sampleWeight,
          academic_period: { id: PERIOD_ID, name: 'Term 1' },
        },
      ]);
      mockPrisma.assessmentCategory.findMany.mockResolvedValue([
        { id: CATEGORY_ID, name: 'Quizzes' },
      ]);

      const result = await service.findByYearGroup(TENANT_ID, YEAR_GROUP_ID);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.category_weights[0]?.category_name).toBe('Quizzes');
    });
  });

  // ─── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should throw NotFoundException when config does not exist', async () => {
      mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne(TENANT_ID, YEAR_GROUP_ID, PERIOD_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return config when it exists', async () => {
      const configWithPeriod = {
        ...sampleWeight,
        academic_period: { id: PERIOD_ID, name: 'Term 1' },
      };
      mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(configWithPeriod);

      const result = await service.findOne(TENANT_ID, YEAR_GROUP_ID, PERIOD_ID);

      expect(result).toEqual(configWithPeriod);
    });
  });

  // ─── copyFromYearGroup ────────────────────────────────────────────────────

  describe('copyFromYearGroup', () => {
    it('should throw NotFoundException when source year group does not exist', async () => {
      mockAcademicFacade.findYearGroupByIdOrThrow
        .mockRejectedValueOnce(new NotFoundException({ code: 'YEAR_GROUP_NOT_FOUND', message: 'Year group not found' }));

      await expect(
        service.copyFromYearGroup(TENANT_ID, {
          source_year_group_id: YEAR_GROUP_ID,
          target_year_group_id: TARGET_YEAR_GROUP_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when target year group does not exist', async () => {
      mockAcademicFacade.findYearGroupByIdOrThrow
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new NotFoundException({ code: 'YEAR_GROUP_NOT_FOUND', message: 'Year group not found' }));

      await expect(
        service.copyFromYearGroup(TENANT_ID, {
          source_year_group_id: YEAR_GROUP_ID,
          target_year_group_id: TARGET_YEAR_GROUP_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when source has no configs', async () => {
      mockAcademicFacade.findYearGroupByIdOrThrow.mockResolvedValue(undefined);
      mockPrisma.yearGroupGradeWeight.findMany.mockResolvedValue([]);

      await expect(
        service.copyFromYearGroup(TENANT_ID, {
          source_year_group_id: YEAR_GROUP_ID,
          target_year_group_id: TARGET_YEAR_GROUP_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should copy configs from source to target and return copied count', async () => {
      mockAcademicFacade.findYearGroupByIdOrThrow.mockResolvedValue(undefined);
      mockPrisma.yearGroupGradeWeight.findMany.mockResolvedValue([sampleWeight]);
      mockRlsTx.yearGroupGradeWeight.upsert.mockResolvedValue({ ...sampleWeight, year_group_id: TARGET_YEAR_GROUP_ID });

      const result = await service.copyFromYearGroup(TENANT_ID, {
        source_year_group_id: YEAR_GROUP_ID,
        target_year_group_id: TARGET_YEAR_GROUP_ID,
      }) as { copied: number };

      expect(result.copied).toBe(1);
      expect(mockRlsTx.yearGroupGradeWeight.upsert).toHaveBeenCalledTimes(1);
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should throw NotFoundException when config does not exist', async () => {
      mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);

      await expect(
        service.delete(TENANT_ID, YEAR_GROUP_ID, PERIOD_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should delete the config when it exists', async () => {
      mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue({ id: 'weight-1' });
      mockRlsTx.yearGroupGradeWeight.delete.mockResolvedValue(sampleWeight);

      const result = await service.delete(TENANT_ID, YEAR_GROUP_ID, PERIOD_ID);

      expect(result).toEqual(sampleWeight);
      expect(mockRlsTx.yearGroupGradeWeight.delete).toHaveBeenCalledWith({
        where: { id: 'weight-1' },
      });
    });
  });
});
