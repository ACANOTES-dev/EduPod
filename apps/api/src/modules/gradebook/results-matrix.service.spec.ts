import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ClassesReadFacade, MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { ResultsMatrixService } from './results-matrix.service';
import { WeightConfigService } from './weight-config.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const YEAR_ID = '99999999-9999-9999-9999-999999999999';
const PERIOD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PERIOD_ID_2 = '22222222-2222-2222-2222-222222222222';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SUBJECT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CATEGORY_ID = 'cccc1111-1111-1111-1111-111111111111';
const ASSESSMENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const ASSESSMENT_ID_2 = '33333333-3333-3333-3333-333333333333';
const USER_ID = '11111111-1111-1111-1111-111111111111';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  grade: {
    upsert: jest.fn(),
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
    classEnrolment: { findMany: jest.fn() },
    assessment: { findMany: jest.fn() },
    grade: { findMany: jest.fn() },
  };
}

function mockStudent(id: string, first: string, last: string, number: string | null = null) {
  return {
    student: { id, first_name: first, last_name: last, student_number: number },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ResultsMatrixService', () => {
  let service: ResultsMatrixService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockClassesFacade: {
    existsOrThrow: jest.Mock;
    findEnrolmentsGeneric: jest.Mock;
    findClassesGeneric: jest.Mock;
  };
  let mockWeightConfig: { resolvePeriodWeightsForClass: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.grade.upsert.mockReset();
    mockClassesFacade = {
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      findEnrolmentsGeneric: jest.fn().mockResolvedValue([]),
      findClassesGeneric: jest.fn().mockResolvedValue([{ academic_year_id: YEAR_ID }]),
    };
    mockWeightConfig = {
      resolvePeriodWeightsForClass: jest.fn().mockResolvedValue(new Map<string, number>()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ResultsMatrixService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: WeightConfigService, useValue: mockWeightConfig },
      ],
    }).compile();

    service = module.get<ResultsMatrixService>(ResultsMatrixService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getMatrix ─────────────────────────────────────────────────────────────

  describe('getMatrix', () => {
    it('should throw NotFoundException when class does not exist', async () => {
      mockClassesFacade.existsOrThrow.mockRejectedValue(
        new NotFoundException({ code: 'CLASS_NOT_FOUND', message: 'Class not found' }),
      );

      await expect(service.getMatrix(TENANT_ID, CLASS_ID, PERIOD_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return an empty matrix when no students are enrolled', async () => {
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([]);
      mockPrisma.assessment.findMany.mockResolvedValue([]);

      const result = await service.getMatrix(TENANT_ID, CLASS_ID, PERIOD_ID);

      expect(result.students).toHaveLength(0);
      expect(result.subjects).toHaveLength(0);
      expect(result.cells).toEqual({});
    });

    it('should group assessments into one column per category per subject', async () => {
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([
        mockStudent(STUDENT_ID, 'Alice', 'Smith', 'S001'),
      ]);
      // Two assessments in the same category — should collapse into a single column
      mockPrisma.assessment.findMany.mockResolvedValue([
        {
          id: ASSESSMENT_ID,
          title: 'Quiz 1',
          max_score: 100,
          status: 'submitted_locked',
          academic_period_id: PERIOD_ID,
          subject: { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
          category: { id: CATEGORY_ID, name: 'Quizzes' },
        },
        {
          id: ASSESSMENT_ID_2,
          title: 'Quiz 2',
          max_score: 50,
          status: 'submitted_locked',
          academic_period_id: PERIOD_ID,
          subject: { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
          category: { id: CATEGORY_ID, name: 'Quizzes' },
        },
      ]);
      mockPrisma.grade.findMany.mockResolvedValue([
        { student_id: STUDENT_ID, assessment_id: ASSESSMENT_ID, raw_score: 80, is_missing: false },
        {
          student_id: STUDENT_ID,
          assessment_id: ASSESSMENT_ID_2,
          raw_score: 40,
          is_missing: false,
        },
      ]);

      const result = await service.getMatrix(TENANT_ID, CLASS_ID, PERIOD_ID);

      expect(result.subjects).toHaveLength(1);
      expect(result.subjects[0]?.categories).toHaveLength(1);
      expect(result.subjects[0]?.categories[0]?.category_name).toBe('Quizzes');

      // Pooled: (80 + 40) / (100 + 50) = 120/150 = 80.00%
      const cell = result.cells[STUDENT_ID]?.[SUBJECT_ID]?.[CATEGORY_ID];
      expect(cell?.percentage).toBeCloseTo(80.0, 4);
      expect(cell?.assessment_count).toBe(2);
    });

    it('should pool Karen-style data: (51/100, 19/50) with two categories', async () => {
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([
        mockStudent(STUDENT_ID, 'Karen', 'Carroll'),
      ]);
      const endOfTermCatId = 'cat-eot';
      const homeworkCatId = 'cat-hw';
      mockPrisma.assessment.findMany.mockResolvedValue([
        {
          id: 'a1',
          title: 'End of Term',
          max_score: 100,
          status: 'submitted_locked',
          academic_period_id: PERIOD_ID,
          subject: { id: SUBJECT_ID, name: 'English', code: null },
          category: { id: endOfTermCatId, name: 'End of Term Test' },
        },
        {
          id: 'a2',
          title: 'Homework',
          max_score: 50,
          status: 'submitted_locked',
          academic_period_id: PERIOD_ID,
          subject: { id: SUBJECT_ID, name: 'English', code: null },
          category: { id: homeworkCatId, name: 'Homework' },
        },
      ]);
      mockPrisma.grade.findMany.mockResolvedValue([
        { student_id: STUDENT_ID, assessment_id: 'a1', raw_score: 51, is_missing: false },
        { student_id: STUDENT_ID, assessment_id: 'a2', raw_score: 19, is_missing: false },
      ]);

      const result = await service.getMatrix(TENANT_ID, CLASS_ID, PERIOD_ID);

      expect(result.subjects[0]?.categories).toHaveLength(2);
      // 51 / 100 = 51.00%
      expect(result.cells[STUDENT_ID]?.[SUBJECT_ID]?.[endOfTermCatId]?.percentage).toBeCloseTo(
        51.0,
        4,
      );
      // 19 / 50 = 38.00%
      expect(result.cells[STUDENT_ID]?.[SUBJECT_ID]?.[homeworkCatId]?.percentage).toBeCloseTo(
        38.0,
        4,
      );
    });

    it('should return null percentage when the student has no grades in a category', async () => {
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([
        mockStudent(STUDENT_ID, 'Alice', 'Smith'),
      ]);
      mockPrisma.assessment.findMany.mockResolvedValue([
        {
          id: ASSESSMENT_ID,
          title: 'Quiz 1',
          max_score: 100,
          status: 'submitted_locked',
          academic_period_id: PERIOD_ID,
          subject: { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
          category: { id: CATEGORY_ID, name: 'Quizzes' },
        },
      ]);
      mockPrisma.grade.findMany.mockResolvedValue([]);

      const result = await service.getMatrix(TENANT_ID, CLASS_ID, PERIOD_ID);

      const cell = result.cells[STUDENT_ID]?.[SUBJECT_ID]?.[CATEGORY_ID];
      expect(cell?.percentage).toBeNull();
      expect(cell?.assessment_count).toBe(0);
    });

    it('should skip assessments whose grade is null (treated as ungraded)', async () => {
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([
        mockStudent(STUDENT_ID, 'Alice', 'Smith'),
      ]);
      mockPrisma.assessment.findMany.mockResolvedValue([
        {
          id: ASSESSMENT_ID,
          title: 'Quiz 1',
          max_score: 100,
          status: 'submitted_locked',
          academic_period_id: PERIOD_ID,
          subject: { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
          category: { id: CATEGORY_ID, name: 'Quizzes' },
        },
        {
          id: ASSESSMENT_ID_2,
          title: 'Quiz 2',
          max_score: 100,
          status: 'submitted_locked',
          academic_period_id: PERIOD_ID,
          subject: { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
          category: { id: CATEGORY_ID, name: 'Quizzes' },
        },
      ]);
      mockPrisma.grade.findMany.mockResolvedValue([
        { student_id: STUDENT_ID, assessment_id: ASSESSMENT_ID, raw_score: 80, is_missing: false },
        {
          student_id: STUDENT_ID,
          assessment_id: ASSESSMENT_ID_2,
          raw_score: null,
          is_missing: true,
        },
      ]);

      const result = await service.getMatrix(TENANT_ID, CLASS_ID, PERIOD_ID);

      // Only the graded assessment contributes: 80/100 = 80%
      const cell = result.cells[STUDENT_ID]?.[SUBJECT_ID]?.[CATEGORY_ID];
      expect(cell?.percentage).toBeCloseTo(80.0, 4);
      expect(cell?.assessment_count).toBe(1);
    });

    it('should not query grades when there are no assessments', async () => {
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([
        mockStudent(STUDENT_ID, 'Alice', 'Smith'),
      ]);
      mockPrisma.assessment.findMany.mockResolvedValue([]);

      await service.getMatrix(TENANT_ID, CLASS_ID, PERIOD_ID);

      expect(mockPrisma.grade.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── getMatrix — all-periods view ────────────────────────────────────────

  describe('getMatrix — all-periods view', () => {
    it('should combine per-period pooled percentages using period weights', async () => {
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([
        mockStudent(STUDENT_ID, 'Karen', 'Carroll'),
      ]);
      mockPrisma.assessment.findMany.mockResolvedValue([
        {
          id: 'a_s1',
          title: 'S1 Homework',
          max_score: 50,
          status: 'submitted_locked',
          academic_period_id: PERIOD_ID,
          subject: { id: SUBJECT_ID, name: 'English', code: null },
          category: { id: CATEGORY_ID, name: 'Homework' },
        },
        {
          id: 'a_s2',
          title: 'S2 Homework',
          max_score: 50,
          status: 'submitted_locked',
          academic_period_id: PERIOD_ID_2,
          subject: { id: SUBJECT_ID, name: 'English', code: null },
          category: { id: CATEGORY_ID, name: 'Homework' },
        },
      ]);
      mockPrisma.grade.findMany.mockResolvedValue([
        { student_id: STUDENT_ID, assessment_id: 'a_s1', raw_score: 19, is_missing: false },
        { student_id: STUDENT_ID, assessment_id: 'a_s2', raw_score: 18, is_missing: false },
      ]);
      // S1 = 60%, S2 = 40%
      mockWeightConfig.resolvePeriodWeightsForClass.mockResolvedValue(
        new Map<string, number>([
          [PERIOD_ID, 60],
          [PERIOD_ID_2, 40],
        ]),
      );

      const result = await service.getMatrix(TENANT_ID, CLASS_ID);

      // S1 pooled: 19/50 = 38.00%
      // S2 pooled: 18/50 = 36.00%
      // Weighted: (38 × 60 + 36 × 40) / 100 = (2280 + 1440) / 100 = 37.20%
      const cell = result.cells[STUDENT_ID]?.[SUBJECT_ID]?.[CATEGORY_ID];
      expect(cell?.percentage).toBeCloseTo(37.2, 4);
      expect(cell?.assessment_count).toBe(2);
    });

    it('should fall back to equal weights when no period weights are configured', async () => {
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([
        mockStudent(STUDENT_ID, 'Karen', 'Carroll'),
      ]);
      mockPrisma.assessment.findMany.mockResolvedValue([
        {
          id: 'a_s1',
          title: 'S1 Homework',
          max_score: 50,
          status: 'submitted_locked',
          academic_period_id: PERIOD_ID,
          subject: { id: SUBJECT_ID, name: 'English', code: null },
          category: { id: CATEGORY_ID, name: 'Homework' },
        },
        {
          id: 'a_s2',
          title: 'S2 Homework',
          max_score: 50,
          status: 'submitted_locked',
          academic_period_id: PERIOD_ID_2,
          subject: { id: SUBJECT_ID, name: 'English', code: null },
          category: { id: CATEGORY_ID, name: 'Homework' },
        },
      ]);
      mockPrisma.grade.findMany.mockResolvedValue([
        { student_id: STUDENT_ID, assessment_id: 'a_s1', raw_score: 20, is_missing: false },
        { student_id: STUDENT_ID, assessment_id: 'a_s2', raw_score: 30, is_missing: false },
      ]);
      // empty map → equal fallback
      mockWeightConfig.resolvePeriodWeightsForClass.mockResolvedValue(new Map<string, number>());

      const result = await service.getMatrix(TENANT_ID, CLASS_ID);

      // S1: 20/50 = 40%, S2: 30/50 = 60% → average = 50%
      const cell = result.cells[STUDENT_ID]?.[SUBJECT_ID]?.[CATEGORY_ID];
      expect(cell?.percentage).toBeCloseTo(50.0, 4);
    });

    it('should drop periods with no data and renormalise remaining weights', async () => {
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([
        mockStudent(STUDENT_ID, 'Alice', 'Smith'),
      ]);
      mockPrisma.assessment.findMany.mockResolvedValue([
        {
          id: 'a_s1',
          title: 'S1 Homework',
          max_score: 50,
          status: 'submitted_locked',
          academic_period_id: PERIOD_ID,
          subject: { id: SUBJECT_ID, name: 'English', code: null },
          category: { id: CATEGORY_ID, name: 'Homework' },
        },
        {
          id: 'a_s2',
          title: 'S2 Homework',
          max_score: 50,
          status: 'submitted_locked',
          academic_period_id: PERIOD_ID_2,
          subject: { id: SUBJECT_ID, name: 'English', code: null },
          category: { id: CATEGORY_ID, name: 'Homework' },
        },
      ]);
      // Only S1 has a grade; S2 is ungraded
      mockPrisma.grade.findMany.mockResolvedValue([
        { student_id: STUDENT_ID, assessment_id: 'a_s1', raw_score: 25, is_missing: false },
      ]);
      mockWeightConfig.resolvePeriodWeightsForClass.mockResolvedValue(
        new Map<string, number>([
          [PERIOD_ID, 60],
          [PERIOD_ID_2, 40],
        ]),
      );

      const result = await service.getMatrix(TENANT_ID, CLASS_ID);

      // Only S1 contributes: 25/50 = 50%. S2 dropped → cell = 50.00%
      const cell = result.cells[STUDENT_ID]?.[SUBJECT_ID]?.[CATEGORY_ID];
      expect(cell?.percentage).toBeCloseTo(50.0, 4);
      expect(cell?.assessment_count).toBe(1);
    });
  });

  // ─── saveMatrix ────────────────────────────────────────────────────────────

  describe('saveMatrix', () => {
    it('should return saved=0 when no grades are provided', async () => {
      const result = await service.saveMatrix(TENANT_ID, CLASS_ID, USER_ID, []);

      expect(result).toEqual({ saved: 0 });
    });

    it('should return saved=0 when all assessments are invalid or locked', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([]);

      const result = await service.saveMatrix(TENANT_ID, CLASS_ID, USER_ID, [
        {
          student_id: STUDENT_ID,
          assessment_id: ASSESSMENT_ID,
          raw_score: 85,
          is_missing: false,
        },
      ]);

      expect(result).toEqual({ saved: 0 });
    });

    it('should only save grades for enrolled students', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([{ id: ASSESSMENT_ID, max_score: 100 }]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([]);

      const result = await service.saveMatrix(TENANT_ID, CLASS_ID, USER_ID, [
        {
          student_id: STUDENT_ID,
          assessment_id: ASSESSMENT_ID,
          raw_score: 85,
          is_missing: false,
        },
      ]);

      expect(result).toEqual({ saved: 0 });
      expect(mockRlsTx.grade.upsert).not.toHaveBeenCalled();
    });

    it('should clamp score to max_score when score exceeds maximum', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([{ id: ASSESSMENT_ID, max_score: 50 }]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockRlsTx.grade.upsert.mockResolvedValue({ id: 'grade-1' });

      await service.saveMatrix(TENANT_ID, CLASS_ID, USER_ID, [
        {
          student_id: STUDENT_ID,
          assessment_id: ASSESSMENT_ID,
          raw_score: 999,
          is_missing: false,
        },
      ]);

      expect(mockRlsTx.grade.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ raw_score: 50 }),
        }),
      );
    });

    it('should save grades and return the correct saved count', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([{ id: ASSESSMENT_ID, max_score: 100 }]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockRlsTx.grade.upsert.mockResolvedValue({ id: 'grade-1' });

      const result = await service.saveMatrix(TENANT_ID, CLASS_ID, USER_ID, [
        {
          student_id: STUDENT_ID,
          assessment_id: ASSESSMENT_ID,
          raw_score: 85,
          is_missing: false,
        },
      ]);

      expect(result.saved).toBe(1);
      expect(mockRlsTx.grade.upsert).toHaveBeenCalledTimes(1);
    });

    it('should handle null raw_score in saveMatrix without setting entered_at', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([{ id: ASSESSMENT_ID, max_score: 100 }]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockRlsTx.grade.upsert.mockResolvedValue({ id: 'grade-1' });

      await service.saveMatrix(TENANT_ID, CLASS_ID, USER_ID, [
        {
          student_id: STUDENT_ID,
          assessment_id: ASSESSMENT_ID,
          raw_score: null,
          is_missing: true,
        },
      ]);

      expect(mockRlsTx.grade.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            raw_score: null,
            entered_at: null,
          }),
        }),
      );
    });

    it('should clamp negative scores to 0', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([{ id: ASSESSMENT_ID, max_score: 100 }]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockRlsTx.grade.upsert.mockResolvedValue({ id: 'grade-1' });

      await service.saveMatrix(TENANT_ID, CLASS_ID, USER_ID, [
        {
          student_id: STUDENT_ID,
          assessment_id: ASSESSMENT_ID,
          raw_score: -10,
          is_missing: false,
        },
      ]);

      expect(mockRlsTx.grade.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ raw_score: 0 }),
        }),
      );
    });
  });
});
