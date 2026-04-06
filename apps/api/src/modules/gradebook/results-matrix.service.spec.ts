import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ClassesReadFacade, MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { ResultsMatrixService } from './results-matrix.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PERIOD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SUBJECT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ASSESSMENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ResultsMatrixService', () => {
  let service: ResultsMatrixService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockClassesFacade: { existsOrThrow: jest.Mock; findEnrolmentsGeneric: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.grade.upsert.mockReset();
    mockClassesFacade = {
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      findEnrolmentsGeneric: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ResultsMatrixService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
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
      expect(result.grades).toEqual({});
    });

    it('should return students from active enrolments', async () => {
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([
        {
          student: {
            id: STUDENT_ID,
            first_name: 'Alice',
            last_name: 'Smith',
            student_number: 'S001',
          },
        },
      ]);
      mockPrisma.assessment.findMany.mockResolvedValue([]);

      const result = await service.getMatrix(TENANT_ID, CLASS_ID, PERIOD_ID);

      expect(result.students).toHaveLength(1);
      expect(result.students[0]?.id).toBe(STUDENT_ID);
    });

    it('should group assessments by subject and include grades', async () => {
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([
        {
          student: {
            id: STUDENT_ID,
            first_name: 'Alice',
            last_name: 'Smith',
            student_number: 'S001',
          },
        },
      ]);
      mockPrisma.assessment.findMany.mockResolvedValue([
        {
          id: ASSESSMENT_ID,
          title: 'Quiz 1',
          max_score: 100,
          status: 'open',
          subject: { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
          category: { id: 'cat-1', name: 'Quizzes' },
        },
      ]);
      mockPrisma.grade.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          assessment_id: ASSESSMENT_ID,
          raw_score: 85,
          is_missing: false,
        },
      ]);

      const result = await service.getMatrix(TENANT_ID, CLASS_ID, PERIOD_ID);

      expect(result.subjects).toHaveLength(1);
      expect(result.subjects[0]?.id).toBe(SUBJECT_ID);
      expect(result.subjects[0]?.assessments).toHaveLength(1);
      expect(result.grades[STUDENT_ID]?.[ASSESSMENT_ID]?.raw_score).toBe(85);
    });

    it('should not query grades when there are no assessments', async () => {
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([
        {
          student: {
            id: STUDENT_ID,
            first_name: 'Alice',
            last_name: 'Smith',
            student_number: 'S001',
          },
        },
      ]);
      mockPrisma.assessment.findMany.mockResolvedValue([]);

      await service.getMatrix(TENANT_ID, CLASS_ID, PERIOD_ID);

      expect(mockPrisma.grade.findMany).not.toHaveBeenCalled();
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
      // No active enrolments
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

  // ─── getMatrix with null grades ──────────────────────────────────────────

  describe('getMatrix — null raw_score handling', () => {
    it('should convert null raw_score to null in grades lookup', async () => {
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([
        {
          student: {
            id: STUDENT_ID,
            first_name: 'Alice',
            last_name: 'Smith',
            student_number: 'S001',
          },
        },
      ]);
      mockPrisma.assessment.findMany.mockResolvedValue([
        {
          id: ASSESSMENT_ID,
          subject_id: SUBJECT_ID,
          title: 'Quiz 1',
          max_score: 100,
          status: 'open',
          subject: { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
          category: { id: 'cat-1', name: 'Quizzes' },
        },
      ]);
      mockPrisma.grade.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          assessment_id: ASSESSMENT_ID,
          raw_score: null,
          is_missing: true,
        },
      ]);

      const result = await service.getMatrix(TENANT_ID, CLASS_ID, PERIOD_ID);

      expect(result.grades[STUDENT_ID]?.[ASSESSMENT_ID]?.raw_score).toBeNull();
      expect(result.grades[STUDENT_ID]?.[ASSESSMENT_ID]?.is_missing).toBe(true);
    });
  });
});
