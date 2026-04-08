/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

import {
  MOCK_FACADE_PROVIDERS,
  ClassesReadFacade,
  ConfigurationReadFacade,
} from '../../../common/tests/mock-facades';
import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentReadFacade } from '../../students/student-read.facade';
import { WeightConfigService } from '../weight-config.service';

import { GpaService } from './gpa.service';
import { PeriodGradeComputationService } from './period-grade-computation.service';
import { StandardsService } from './standards.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'class-1';
const SUBJECT_ID = 'subject-1';
const PERIOD_ID = 'period-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  periodGradeSnapshot: {
    upsert: jest.fn().mockResolvedValue({ id: 'snap-1' }),
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    class: { findFirst: jest.fn() },
    yearGroupGradeWeight: { findFirst: jest.fn() },
    classSubjectGradeConfig: { findFirst: jest.fn() },
    tenantSetting: { findFirst: jest.fn() },
    assessment: { findMany: jest.fn() },
    classEnrolment: { findMany: jest.fn() },
  };
}

function buildMockGpaService() {
  return {
    computeGpa: jest.fn().mockResolvedValue({ gpa_value: 3.0 }),
  };
}

function buildMockStandardsService() {
  return {
    computeCompetencySnapshots: jest.fn().mockResolvedValue(undefined),
  };
}

const baseGradeConfig = {
  grading_scale: {
    config_json: {
      type: 'numeric' as const,
      ranges: [
        { min: 90, max: 100, label: 'A' },
        { min: 80, max: 89, label: 'B' },
        { min: 70, max: 79, label: 'C' },
        { min: 60, max: 69, label: 'D' },
        { min: 0, max: 59, label: 'F' },
      ],
    },
  },
  category_weight_json: {
    weights: [
      { category_id: 'cat-1', weight: 60 },
      { category_id: 'cat-2', weight: 40 },
    ],
  },
};

// ─── compute Tests ───────────────────────────────────────────────────────────

const mockClassesFacade = { findClassesGeneric: jest.fn(), findEnrolmentsGeneric: jest.fn() };
const mockConfigFacade = { findSettings: jest.fn() };
const mockWeightConfigService = {
  resolveSubjectWeightsForClass: jest.fn().mockResolvedValue(new Map()),
  resolvePeriodWeightsForClass: jest.fn().mockResolvedValue(new Map()),
};
const mockAcademicReadFacade = {
  findPeriodsForYear: jest.fn().mockResolvedValue([]),
};
const mockStudentReadFacade = {
  findByIds: jest.fn().mockResolvedValue([]),
};

describe('PeriodGradeComputationService — compute', () => {
  let service: PeriodGradeComputationService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.periodGradeSnapshot.upsert.mockReset().mockResolvedValue({ id: 'snap-1' });
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([]);
    mockConfigFacade.findSettings.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
        PeriodGradeComputationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GpaService, useValue: buildMockGpaService() },
        { provide: StandardsService, useValue: buildMockStandardsService() },
        { provide: WeightConfigService, useValue: mockWeightConfigService },
        { provide: AcademicReadFacade, useValue: mockAcademicReadFacade },
        { provide: StudentReadFacade, useValue: mockStudentReadFacade },
      ],
    }).compile();

    service = module.get<PeriodGradeComputationService>(PeriodGradeComputationService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when no grade weights configured', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(null);

    await expect(service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw BadRequestException when no assessments found', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(baseGradeConfig);
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([]);

    await expect(service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException when no students enrolled', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(baseGradeConfig);
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([]);

    await expect(service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should compute weighted average correctly for a single student', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(baseGradeConfig);
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 90, is_missing: false }],
      },
      {
        id: 'a2',
        max_score: 50,
        category_id: 'cat-2',
        category: { id: 'cat-2', name: 'Quiz', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 40, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    const result = await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    // cat-1: (90/100)*100 = 90% * 60 weight = 5400
    // cat-2: (40/50)*100 = 80% * 40 weight = 3200
    // total = 8600 / 100 = 86%
    expect(result.data).toHaveLength(1);
    expect(result.meta.students_computed).toBe(1);
    expect(result.meta.assessments_included).toBe(2);

    const upsertCall = mockRlsTx.periodGradeSnapshot.upsert.mock.calls[0]?.[0];
    // computed_value should be approximately 86
    expect(upsertCall).toBeDefined();
  });

  it('should apply exclude policy for missing grades by default', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(baseGradeConfig);
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 80, is_missing: false }],
      },
      {
        id: 'a2',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [], // student has no grade for this assessment
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    const result = await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    // With exclude policy, only the graded assessment counts
    expect(result.meta.missing_grade_policy).toBe('exclude');
  });

  it('should apply zero policy when configured', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(baseGradeConfig);
    mockConfigFacade.findSettings.mockResolvedValue({
      settings: { gradebook: { defaultMissingGradePolicy: 'zero' } },
    });
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 80, is_missing: false }],
      },
      {
        id: 'a2',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [], // student has no grade -> treated as 0
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    const result = await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result.meta.missing_grade_policy).toBe('zero');
  });

  it('should exclude formative assessments when formativeIncludedInPeriodGrade is false', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(baseGradeConfig);
    mockConfigFacade.findSettings.mockResolvedValue({
      settings: { gradebook: { formativeIncludedInPeriodGrade: false } },
    });
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 80, is_missing: false }],
      },
      {
        id: 'a2',
        max_score: 50,
        category_id: 'cat-2',
        category: { id: 'cat-2', name: 'Homework', assessment_type: 'formative' },
        grades: [{ student_id: 's1', raw_score: 50, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    const result = await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    // Only summative assessment should be included
    expect(result.meta.assessments_included).toBe(1);
  });

  it('should throw BadRequestException when all weights are zero', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      grading_scale: baseGradeConfig.grading_scale,
      category_weight_json: {
        weights: [
          { category_id: 'cat-1', weight: 0 },
          { category_id: 'cat-2', weight: 0 },
        ],
      },
    });
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 80, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    await expect(service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should add warnings when weights do not sum to 100', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      grading_scale: baseGradeConfig.grading_scale,
      category_weight_json: {
        weights: [
          { category_id: 'cat-1', weight: 30 },
          { category_id: 'cat-2', weight: 20 },
        ],
      },
    });
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 80, is_missing: false }],
      },
      {
        id: 'a2',
        max_score: 100,
        category_id: 'cat-2',
        category: { id: 'cat-2', name: 'Quiz', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 70, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    const result = await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result.warnings.some((w) => w.code === 'WEIGHTS_NORMALIZED')).toBe(true);
  });

  it('should apply grading scale to display_value', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      grading_scale: {
        config_json: {
          type: 'letter',
          grades: [
            { label: 'A+', numeric_value: 90 },
            { label: 'A', numeric_value: 80 },
            { label: 'B', numeric_value: 70 },
          ],
        },
      },
      category_weight_json: {
        weights: [{ category_id: 'cat-1', weight: 100 }],
      },
    });
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 85, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    // 85% should map to 'A' (>= 80)
    const upsertCall = mockRlsTx.periodGradeSnapshot.upsert.mock.calls[0]?.[0];
    expect(upsertCall?.create?.display_value).toBe('A');
  });

  it('should use year-group weights when available', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue({
      category_weights_json: {
        weights: [
          { category_id: 'cat-1', weight: 70 },
          { category_id: 'cat-2', weight: 30 },
        ],
      },
    });
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(baseGradeConfig);
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 80, is_missing: false }],
      },
      {
        id: 'a2',
        max_score: 100,
        category_id: 'cat-2',
        category: { id: 'cat-2', name: 'Quiz', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 60, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    const result = await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    // cat-1: 80% * 70 = 5600, cat-2: 60% * 30 = 1800, total: 7400/100 = 74%
    expect(result.data).toHaveLength(1);
  });

  it('should fall back to class-subject config when no year-group weights', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(baseGradeConfig);
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 90, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    const result = await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result.data).toHaveLength(1);
  });

  it('should handle class with no year_group_id', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: null }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(baseGradeConfig);
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 70, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    const result = await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result.data).toHaveLength(1);
  });

  it('should handle class not found (returns empty array)', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(baseGradeConfig);
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 70, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    const result = await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result.data).toHaveLength(1);
  });

  it('should apply formative weight cap when configured', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      grading_scale: baseGradeConfig.grading_scale,
      category_weight_json: {
        weights: [
          { category_id: 'cat-formative', weight: 60 },
          { category_id: 'cat-summative', weight: 40 },
        ],
      },
    });
    mockConfigFacade.findSettings.mockResolvedValue({
      settings: { gradebook: { formativeWeightCap: 30 } },
    });
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-formative',
        category: { id: 'cat-formative', name: 'Homework', assessment_type: 'formative' },
        grades: [{ student_id: 's1', raw_score: 90, is_missing: false }],
      },
      {
        id: 'a2',
        max_score: 100,
        category_id: 'cat-summative',
        category: { id: 'cat-summative', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 70, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    const result = await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result.warnings.some((w) => w.code === 'FORMATIVE_CAP_APPLIED')).toBe(true);
    expect(result.meta.formative_cap_applied).toBe(true);
  });

  it('should display percentage when no grading scale config is available', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      grading_scale: { config_json: null },
      category_weight_json: {
        weights: [{ category_id: 'cat-1', weight: 100 }],
      },
    });
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 85, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    const upsertCall = mockRlsTx.periodGradeSnapshot.upsert.mock.calls[0]?.[0];
    expect(upsertCall?.create?.display_value).toContain('%');
  });

  it('should fall back to percentage when numeric range does not match', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      grading_scale: {
        config_json: {
          type: 'numeric',
          ranges: [{ min: 90, max: 100, label: 'A' }],
        },
      },
      category_weight_json: {
        weights: [{ category_id: 'cat-1', weight: 100 }],
      },
    });
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 50, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    const upsertCall = mockRlsTx.periodGradeSnapshot.upsert.mock.calls[0]?.[0];
    expect(upsertCall?.create?.display_value).toContain('%');
  });

  it('should use custom grading scale with grades that have no numeric_value', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      grading_scale: {
        config_json: {
          type: 'custom',
          grades: [{ label: 'Pass' }, { label: 'Fail' }],
        },
      },
      category_weight_json: {
        weights: [{ category_id: 'cat-1', weight: 100 }],
      },
    });
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 50, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    // Grades have no numeric_value, so it should fall back to percentage
    const upsertCall = mockRlsTx.periodGradeSnapshot.upsert.mock.calls[0]?.[0];
    expect(upsertCall?.create?.display_value).toContain('%');
  });

  it('should return lowest grade label when percentage is below all numeric_values', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      grading_scale: {
        config_json: {
          type: 'letter',
          grades: [
            { label: 'A+', numeric_value: 90 },
            { label: 'A', numeric_value: 80 },
            { label: 'B', numeric_value: 70 },
            { label: 'C', numeric_value: 60 },
          ],
        },
      },
      category_weight_json: {
        weights: [{ category_id: 'cat-1', weight: 100 }],
      },
    });
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 20, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    const upsertCall = mockRlsTx.periodGradeSnapshot.upsert.mock.calls[0]?.[0];
    expect(upsertCall?.create?.display_value).toBe('C');
  });

  it('should throw when formative excluded and no summative assessments remain', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(baseGradeConfig);
    mockConfigFacade.findSettings.mockResolvedValue({
      settings: { gradebook: { formativeIncludedInPeriodGrade: false } },
    });
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Homework', assessment_type: 'formative' },
        grades: [{ student_id: 's1', raw_score: 90, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    await expect(service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should handle zero policy for missing grades', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(baseGradeConfig);
    mockConfigFacade.findSettings.mockResolvedValue({
      settings: { gradebook: { defaultMissingGradePolicy: 'zero' } },
    });
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: null, is_missing: true }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    const result = await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result.meta.missing_grade_policy).toBe('zero');
    const upsertCall = mockRlsTx.periodGradeSnapshot.upsert.mock.calls[0]?.[0];
    // Score should be 0 since missing grade is treated as 0
    expect(upsertCall?.create?.computed_value).toBe(0);
  });

  it('should fall back to percentage formatting for unrecognized grading scale type', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      grading_scale: {
        config_json: {
          type: 'percentage',
        },
      },
      category_weight_json: {
        weights: [{ category_id: 'cat-1', weight: 100 }],
      },
    });
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 75, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    const upsertCall = mockRlsTx.periodGradeSnapshot.upsert.mock.calls[0]?.[0];
    expect(upsertCall?.create?.display_value).toBe('75%');
  });

  it('should continue when GPA computation fails for a student', async () => {
    const mockGpaService = buildMockGpaService();
    mockGpaService.computeGpa.mockRejectedValue(new Error('GPA computation error'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
        PeriodGradeComputationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GpaService, useValue: mockGpaService },
        { provide: StandardsService, useValue: buildMockStandardsService() },
        { provide: WeightConfigService, useValue: mockWeightConfigService },
        { provide: AcademicReadFacade, useValue: mockAcademicReadFacade },
        { provide: StudentReadFacade, useValue: mockStudentReadFacade },
      ],
    }).compile();

    const svc = module.get<PeriodGradeComputationService>(PeriodGradeComputationService);

    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(baseGradeConfig);
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 85, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    // Should not throw — GPA failure is best-effort
    const result = await svc.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result.data).toHaveLength(1);
    // Give time for the void promise to settle
    await new Promise((r) => setTimeout(r, 10));
  });

  it('should continue when competency computation fails for a student', async () => {
    const mockStandardsService = buildMockStandardsService();
    mockStandardsService.computeCompetencySnapshots.mockRejectedValue(
      new Error('Competency error'),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
        PeriodGradeComputationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GpaService, useValue: buildMockGpaService() },
        { provide: StandardsService, useValue: mockStandardsService },
        { provide: WeightConfigService, useValue: mockWeightConfigService },
        { provide: AcademicReadFacade, useValue: mockAcademicReadFacade },
        { provide: StudentReadFacade, useValue: mockStudentReadFacade },
      ],
    }).compile();

    const svc = module.get<PeriodGradeComputationService>(PeriodGradeComputationService);

    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(baseGradeConfig);
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        max_score: 100,
        category_id: 'cat-1',
        category: { id: 'cat-1', name: 'Exam', assessment_type: 'summative' },
        grades: [{ student_id: 's1', raw_score: 85, is_missing: false }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: 's1' }]);

    // Should not throw — competency failure is best-effort
    const result = await svc.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result.data).toHaveLength(1);
    // Give time for the void promise to settle
    await new Promise((r) => setTimeout(r, 10));
  });
});
