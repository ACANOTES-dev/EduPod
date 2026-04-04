import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, ClassesReadFacade, ConfigurationReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { GpaService } from './grading/gpa.service';
import { PeriodGradeComputationService } from './grading/period-grade-computation.service';
import { StandardsService } from './grading/standards.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'class-1';
const SUBJECT_ID = 'subject-1';
const PERIOD_ID = 'period-1';
const STUDENT_A = 'student-a';
const STUDENT_B = 'student-b';
const CATEGORY_SUMMATIVE = 'cat-summative';
const CATEGORY_FORMATIVE = 'cat-formative';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  periodGradeSnapshot: {
    upsert: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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

function makeSummativeAssessment(id: string, grades: Array<{ student_id: string; raw_score: number | null }>) {
  return {
    id,
    category_id: CATEGORY_SUMMATIVE,
    max_score: 100,
    category: { id: CATEGORY_SUMMATIVE, name: 'Summative', assessment_type: 'summative' },
    grades: grades.map((g) => ({ student_id: g.student_id, raw_score: g.raw_score })),
  };
}

function makeFormativeAssessment(id: string, grades: Array<{ student_id: string; raw_score: number | null }>) {
  return {
    id,
    category_id: CATEGORY_FORMATIVE,
    max_score: 50,
    category: { id: CATEGORY_FORMATIVE, name: 'Formative', assessment_type: 'formative' },
    grades: grades.map((g) => ({ student_id: g.student_id, raw_score: g.raw_score })),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const mockClassesFacade = { findClassesGeneric: jest.fn(), findEnrolmentsGeneric: jest.fn() };
const mockConfigFacade = { findSettings: jest.fn() };

describe('PeriodGradeComputationService', () => {
  let service: PeriodGradeComputationService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockGpaService: { computeGpa: jest.Mock };
  let mockStandardsService: { computeCompetencySnapshots: jest.Mock };

  const baseClassWeights = [
    { category_id: CATEGORY_SUMMATIVE, weight: 100 },
  ];

  const baseGradingScale = {
    config_json: {
      type: 'numeric',
      ranges: [
        { min: 90, max: 100, label: 'A' },
        { min: 80, max: 89.99, label: 'B' },
        { min: 70, max: 79.99, label: 'C' },
        { min: 0, max: 69.99, label: 'F' },
      ],
    },
  };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockGpaService = { computeGpa: jest.fn().mockResolvedValue(null) };
    mockStandardsService = { computeCompetencySnapshots: jest.fn().mockResolvedValue(null) };

    // Reset RLS tx mock
    mockRlsTx.periodGradeSnapshot.upsert.mockReset();
    mockRlsTx.periodGradeSnapshot.upsert.mockResolvedValue({ id: 'snap-1' });

    // Default setup: class exists, no year-group weights, config with weights
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: null }]);
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue(null);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      category_weight_json: { weights: baseClassWeights },
      grading_scale: baseGradingScale,
      credit_hours: null,
    });
    mockConfigFacade.findSettings.mockResolvedValue(null);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([
      { student_id: STUDENT_A },
      { student_id: STUDENT_B },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
        PeriodGradeComputationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GpaService, useValue: mockGpaService },
        { provide: StandardsService, useValue: mockStandardsService },
      ],
    }).compile();

    service = module.get<PeriodGradeComputationService>(PeriodGradeComputationService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Basic weighted average ───────────────────────────────────────────────

  it('should compute weighted average correctly for a single summative category', async () => {
    // Student A: 80/100, Student B: 60/100
    mockPrisma.assessment.findMany.mockResolvedValue([
      makeSummativeAssessment('a1', [
        { student_id: STUDENT_A, raw_score: 80 },
        { student_id: STUDENT_B, raw_score: 60 },
      ]),
    ]);

    const result = await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result.data).toHaveLength(2);
    const snapA = result.data.find((_s: { id: string }) => {
      // find by checking what was upserted
      return mockRlsTx.periodGradeSnapshot.upsert.mock.calls.some(
        (call: unknown[]) => {
          const arg = call[0] as { create: { student_id: string; computed_value: number } };
          return arg.create?.student_id === STUDENT_A && Math.abs(arg.create?.computed_value - 80) < 0.01;
        },
      );
    });
    expect(snapA).toBeDefined();

    // Student A should be 80% → display "B"
    const callA = mockRlsTx.periodGradeSnapshot.upsert.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as { create: { student_id: string } };
        return arg.create?.student_id === STUDENT_A;
      },
    );
    expect(callA).toBeDefined();
    const argA = callA[0] as { create: { computed_value: number; display_value: string } };
    expect(argA.create.computed_value).toBeCloseTo(80, 2);
    expect(argA.create.display_value).toBe('B');
  });

  it('should compute weighted average across two categories with equal weights', async () => {
    // Two categories each 50 weight — summative and a second summative
    const CAT2 = 'cat-summative-2';
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      category_weight_json: {
        weights: [
          { category_id: CATEGORY_SUMMATIVE, weight: 50 },
          { category_id: CAT2, weight: 50 },
        ],
      },
      grading_scale: baseGradingScale,
      credit_hours: null,
    });

    const assessment1 = {
      id: 'a1',
      category_id: CATEGORY_SUMMATIVE,
      max_score: 100,
      category: { id: CATEGORY_SUMMATIVE, name: 'Summative', assessment_type: 'summative' },
      grades: [{ student_id: STUDENT_A, raw_score: 80 }],
    };
    const assessment2 = {
      id: 'a2',
      category_id: CAT2,
      max_score: 100,
      category: { id: CAT2, name: 'Summative 2', assessment_type: 'summative' },
      grades: [{ student_id: STUDENT_A, raw_score: 60 }],
    };

    mockPrisma.assessment.findMany.mockResolvedValue([assessment1, assessment2]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_A }]);

    await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    // (80% * 50 + 60% * 50) / 100 = 70%
    const callA = mockRlsTx.periodGradeSnapshot.upsert.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as { create: { student_id: string } };
        return arg.create?.student_id === STUDENT_A;
      },
    );
    const argA = callA[0] as { create: { computed_value: number; display_value: string } };
    expect(argA.create.computed_value).toBeCloseTo(70, 2);
    expect(argA.create.display_value).toBe('C');
  });

  it('should apply missing grade policy "exclude" — exclude ungraded assessments', async () => {
    mockConfigFacade.findSettings.mockResolvedValue({
      settings: { gradebook: { defaultMissingGradePolicy: 'exclude' } },
    });

    // Two assessments: Student A graded 80 on first, missing on second
    const CAT2 = 'cat-summative-2';
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      category_weight_json: {
        weights: [
          { category_id: CATEGORY_SUMMATIVE, weight: 50 },
          { category_id: CAT2, weight: 50 },
        ],
      },
      grading_scale: { config_json: { type: 'numeric', ranges: [] } },
      credit_hours: null,
    });

    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        category_id: CATEGORY_SUMMATIVE,
        max_score: 100,
        category: { id: CATEGORY_SUMMATIVE, name: 'Cat1', assessment_type: 'summative' },
        grades: [{ student_id: STUDENT_A, raw_score: 80 }],
      },
      {
        id: 'a2',
        category_id: CAT2,
        max_score: 100,
        category: { id: CAT2, name: 'Cat2', assessment_type: 'summative' },
        grades: [], // No grade for Student A
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_A }]);

    await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    // Only cat1 graded: 80% for cat1, cat2 excluded
    // total weighted = 80 * 50 = 4000, total used weight = 50
    // result = 4000 / 50 = 80%
    const callA = mockRlsTx.periodGradeSnapshot.upsert.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as { create: { student_id: string } };
        return arg.create?.student_id === STUDENT_A;
      },
    );
    const argA = callA[0] as { create: { computed_value: number } };
    expect(argA.create.computed_value).toBeCloseTo(80, 2);
  });

  it('should apply missing grade policy "zero" — count missing as 0', async () => {
    mockConfigFacade.findSettings.mockResolvedValue({
      settings: { gradebook: { defaultMissingGradePolicy: 'zero' } },
    });

    mockPrisma.assessment.findMany.mockResolvedValue([
      makeSummativeAssessment('a1', [
        { student_id: STUDENT_A, raw_score: null }, // missing
      ]),
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_A }]);

    await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    const callA = mockRlsTx.periodGradeSnapshot.upsert.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as { create: { student_id: string } };
        return arg.create?.student_id === STUDENT_A;
      },
    );
    const argA = callA[0] as { create: { computed_value: number } };
    expect(argA.create.computed_value).toBeCloseTo(0, 2);
  });

  it('should apply formative weight cap when configured', async () => {
    mockConfigFacade.findSettings.mockResolvedValue({
      settings: {
        gradebook: {
          formativeWeightCap: 20,
          formativeIncludedInPeriodGrade: true,
        },
      },
    });

    // Summative 60 weight + Formative 40 weight → formative capped at 20%
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      category_weight_json: {
        weights: [
          { category_id: CATEGORY_SUMMATIVE, weight: 60 },
          { category_id: CATEGORY_FORMATIVE, weight: 40 },
        ],
      },
      grading_scale: { config_json: { type: 'numeric', ranges: [] } },
      credit_hours: null,
    });

    mockPrisma.assessment.findMany.mockResolvedValue([
      makeSummativeAssessment('a1', [{ student_id: STUDENT_A, raw_score: 80 }]),
      makeFormativeAssessment('a2', [{ student_id: STUDENT_A, raw_score: 50 }]),
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_A }]);

    const result = await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    // Should have a warning about formative cap
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'FORMATIVE_CAP_APPLIED' }),
    );
    expect(result.meta.formative_cap_applied).toBe(true);
  });

  it('should normalize weights that do not sum to 100 and add warning', async () => {
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      category_weight_json: {
        weights: [{ category_id: CATEGORY_SUMMATIVE, weight: 50 }], // Only 50 total
      },
      grading_scale: { config_json: { type: 'numeric', ranges: [] } },
      credit_hours: null,
    });

    mockPrisma.assessment.findMany.mockResolvedValue([
      makeSummativeAssessment('a1', [{ student_id: STUDENT_A, raw_score: 80 }]),
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_A }]);

    const result = await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'WEIGHTS_NORMALIZED' }),
    );
  });

  it('should throw NotFoundException when no grade config is found', async () => {
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(null);

    await expect(
      service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when no published assessments exist', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([]);

    await expect(
      service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when no active students are enrolled', async () => {
    mockPrisma.assessment.findMany.mockResolvedValue([
      makeSummativeAssessment('a1', [{ student_id: STUDENT_A, raw_score: 80 }]),
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([]);

    await expect(
      service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when formative is excluded and no summative assessments remain', async () => {
    mockConfigFacade.findSettings.mockResolvedValue({
      settings: {
        gradebook: {
          formativeIncludedInPeriodGrade: false,
        },
      },
    });

    // Only formative assessments
    mockPrisma.assessment.findMany.mockResolvedValue([
      makeFormativeAssessment('a1', [{ student_id: STUDENT_A, raw_score: 40 }]),
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_A }]);

    await expect(
      service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('should prefer year-group weights over class-subject weights when available', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([{ year_group_id: 'yg-1' }]);

    const YEAR_GROUP_CATEGORY = 'yg-cat';
    mockPrisma.yearGroupGradeWeight.findFirst.mockResolvedValue({
      category_weights_json: {
        weights: [{ category_id: YEAR_GROUP_CATEGORY, weight: 100 }],
      },
    });

    mockPrisma.assessment.findMany.mockResolvedValue([
      {
        id: 'a1',
        category_id: YEAR_GROUP_CATEGORY,
        max_score: 100,
        category: { id: YEAR_GROUP_CATEGORY, name: 'YG Cat', assessment_type: 'summative' },
        grades: [{ student_id: STUDENT_A, raw_score: 90 }],
      },
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_A }]);

    await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    // Student A got 90 in the year-group category → 90%
    const callA = mockRlsTx.periodGradeSnapshot.upsert.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as { create: { student_id: string } };
        return arg.create?.student_id === STUDENT_A;
      },
    );
    const argA = callA[0] as { create: { computed_value: number } };
    expect(argA.create.computed_value).toBeCloseTo(90, 2);
  });

  it('should use letter grading scale for display_value', async () => {
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      category_weight_json: { weights: baseClassWeights },
      grading_scale: {
        config_json: {
          type: 'letter',
          grades: [
            { label: 'A', numeric_value: 90, gpa_value: 4 },
            { label: 'B', numeric_value: 80, gpa_value: 3 },
            { label: 'C', numeric_value: 70, gpa_value: 2 },
            { label: 'F', numeric_value: 0, gpa_value: 0 },
          ],
        },
      },
      credit_hours: null,
    });

    mockPrisma.assessment.findMany.mockResolvedValue([
      makeSummativeAssessment('a1', [{ student_id: STUDENT_A, raw_score: 85 }]),
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_A }]);

    await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    const callA = mockRlsTx.periodGradeSnapshot.upsert.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as { create: { student_id: string } };
        return arg.create?.student_id === STUDENT_A;
      },
    );
    const argA = callA[0] as { create: { display_value: string } };
    expect(argA.create.display_value).toBe('B');
  });

  it('edge: student with no grades in any category gets computed_value of 0 (exclude policy)', async () => {
    mockConfigFacade.findSettings.mockResolvedValue({
      settings: { gradebook: { defaultMissingGradePolicy: 'exclude' } },
    });

    mockPrisma.assessment.findMany.mockResolvedValue([
      makeSummativeAssessment('a1', [
        // No grade entry for STUDENT_A at all
        { student_id: STUDENT_B, raw_score: 80 },
      ]),
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_A }]);

    await service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID);

    const callA = mockRlsTx.periodGradeSnapshot.upsert.mock.calls.find(
      (call: unknown[]) => {
        const arg = call[0] as { create: { student_id: string } };
        return arg.create?.student_id === STUDENT_A;
      },
    );
    const argA = callA[0] as { create: { computed_value: number } };
    // No data for category → totalUsedWeight = 0 → computed_value = 0
    expect(argA.create.computed_value).toBe(0);
  });

  it('edge: weights with sum zero should throw BadRequestException', async () => {
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      category_weight_json: {
        weights: [{ category_id: CATEGORY_SUMMATIVE, weight: 0 }],
      },
      grading_scale: { config_json: { type: 'numeric', ranges: [] } },
      credit_hours: null,
    });

    mockPrisma.assessment.findMany.mockResolvedValue([
      makeSummativeAssessment('a1', [{ student_id: STUDENT_A, raw_score: 80 }]),
    ]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_A }]);

    await expect(
      service.compute(TENANT_ID, CLASS_ID, SUBJECT_ID, PERIOD_ID),
    ).rejects.toThrow(BadRequestException);
  });
});
