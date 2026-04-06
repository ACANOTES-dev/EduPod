import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  ClassesReadFacade,
  ConfigurationReadFacade,
  StudentReadFacade,
} from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import type { BulkUpsertGradesDto } from './dto/gradebook.dto';
import { GradesService } from './grades.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ASSESSMENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CLASS_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

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
    assessment: { findFirst: jest.fn() },
    classEnrolment: { findMany: jest.fn() },
    tenantSetting: { findFirst: jest.fn() },
    grade: { findMany: jest.fn(), upsert: jest.fn() },
    student: { findFirst: jest.fn() },
  };
}

function buildValidDto(overrides: Partial<BulkUpsertGradesDto> = {}): BulkUpsertGradesDto {
  return {
    grades: [{ student_id: STUDENT_ID, raw_score: 85, is_missing: false, comment: undefined }],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GradesService', () => {
  let service: GradesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  const mockClassesFacade = { findEnrolledStudentIds: jest.fn() };
  const mockConfigFacade = { findSettings: jest.fn() };
  const mockStudentFacade = { findById: jest.fn() };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.grade.upsert.mockReset();
    mockClassesFacade.findEnrolledStudentIds.mockResolvedValue([]);
    mockConfigFacade.findSettings.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
        GradesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GradesService>(GradesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── bulkUpsert ───────────────────────────────────────────────────────────

  describe('bulkUpsert', () => {
    it('should throw NotFoundException when assessment does not exist', async () => {
      mockPrisma.assessment.findFirst.mockResolvedValue(null);

      await expect(
        service.bulkUpsert(TENANT_ID, ASSESSMENT_ID, USER_ID, buildValidDto()),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when assessment status is closed', async () => {
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        status: 'closed',
        class_id: CLASS_ID,
        max_score: 100,
      });

      await expect(
        service.bulkUpsert(TENANT_ID, ASSESSMENT_ID, USER_ID, buildValidDto()),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when a student is not enrolled', async () => {
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        status: 'open',
        class_id: CLASS_ID,
        max_score: 100,
      });
      mockClassesFacade.findEnrolledStudentIds.mockResolvedValue([]);

      await expect(
        service.bulkUpsert(TENANT_ID, ASSESSMENT_ID, USER_ID, buildValidDto()),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when score exceeds max_score', async () => {
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        status: 'open',
        class_id: CLASS_ID,
        max_score: 50,
      });
      mockClassesFacade.findEnrolledStudentIds.mockResolvedValue([STUDENT_ID]);
      mockConfigFacade.findSettings.mockResolvedValue(null);

      await expect(
        service.bulkUpsert(TENANT_ID, ASSESSMENT_ID, USER_ID, buildValidDto()),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when comment is required but missing', async () => {
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        status: 'open',
        class_id: CLASS_ID,
        max_score: 100,
      });
      mockPrisma.classEnrolment.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: { gradebook: { requireGradeComment: true } },
      });

      await expect(
        service.bulkUpsert(
          TENANT_ID,
          ASSESSMENT_ID,
          USER_ID,
          buildValidDto({
            grades: [
              { student_id: STUDENT_ID, raw_score: 85, is_missing: false, comment: undefined },
            ],
          }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should upsert grades and return data when all validations pass', async () => {
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        status: 'open',
        class_id: CLASS_ID,
        max_score: 100,
      });
      mockClassesFacade.findEnrolledStudentIds.mockResolvedValue([STUDENT_ID]);
      mockConfigFacade.findSettings.mockResolvedValue(null);
      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockRlsTx.grade.upsert.mockResolvedValue({
        id: 'grade-1',
        student_id: STUDENT_ID,
        raw_score: 85,
      });

      const result = await service.bulkUpsert(TENANT_ID, ASSESSMENT_ID, USER_ID, buildValidDto());

      expect(result.data).toHaveLength(1);
      expect(mockRlsTx.grade.upsert).toHaveBeenCalledTimes(1);
    });

    it('should preserve original entered_by when grade already has a score', async () => {
      const originalUserId = 'original-user-id';
      const originalEnteredAt = new Date('2024-01-01');

      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        status: 'open',
        class_id: CLASS_ID,
        max_score: 100,
      });
      mockClassesFacade.findEnrolledStudentIds.mockResolvedValue([STUDENT_ID]);
      mockConfigFacade.findSettings.mockResolvedValue(null);
      mockPrisma.grade.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          raw_score: 70,
          entered_at: originalEnteredAt,
          entered_by_user_id: originalUserId,
        },
      ]);
      mockRlsTx.grade.upsert.mockResolvedValue({ id: 'grade-1' });

      await service.bulkUpsert(TENANT_ID, ASSESSMENT_ID, USER_ID, buildValidDto());

      expect(mockRlsTx.grade.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            entered_by_user_id: originalUserId,
            entered_at: originalEnteredAt,
          }),
        }),
      );
    });

    it('should keep enteredAt null when both existing and new raw_score are null', async () => {
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        status: 'open',
        class_id: CLASS_ID,
        max_score: 100,
      });
      mockClassesFacade.findEnrolledStudentIds.mockResolvedValue([STUDENT_ID]);
      mockConfigFacade.findSettings.mockResolvedValue(null);
      mockPrisma.grade.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          raw_score: null,
          entered_at: null,
          entered_by_user_id: null,
        },
      ]);
      mockRlsTx.grade.upsert.mockResolvedValue({ id: 'grade-1' });

      await service.bulkUpsert(
        TENANT_ID,
        ASSESSMENT_ID,
        USER_ID,
        buildValidDto({ grades: [{ student_id: STUDENT_ID, raw_score: null, is_missing: true }] }),
      );

      expect(mockRlsTx.grade.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            entered_at: null,
          }),
        }),
      );
    });

    it('should set enteredAt null for new records with null raw_score', async () => {
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        status: 'open',
        class_id: CLASS_ID,
        max_score: 100,
      });
      mockClassesFacade.findEnrolledStudentIds.mockResolvedValue([STUDENT_ID]);
      mockConfigFacade.findSettings.mockResolvedValue(null);
      mockPrisma.grade.findMany.mockResolvedValue([]); // no existing grades
      mockRlsTx.grade.upsert.mockResolvedValue({ id: 'grade-1' });

      await service.bulkUpsert(
        TENANT_ID,
        ASSESSMENT_ID,
        USER_ID,
        buildValidDto({ grades: [{ student_id: STUDENT_ID, raw_score: null, is_missing: true }] }),
      );

      expect(mockRlsTx.grade.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            entered_at: null,
          }),
        }),
      );
    });

    it('should not throw when comment is provided and requireGradeComment is true', async () => {
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        status: 'open',
        class_id: CLASS_ID,
        max_score: 100,
      });
      mockClassesFacade.findEnrolledStudentIds.mockResolvedValue([STUDENT_ID]);
      mockConfigFacade.findSettings.mockResolvedValue({
        settings: { gradebook: { requireGradeComment: true } },
      });
      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockRlsTx.grade.upsert.mockResolvedValue({ id: 'grade-1' });

      const result = await service.bulkUpsert(
        TENANT_ID,
        ASSESSMENT_ID,
        USER_ID,
        buildValidDto({
          grades: [
            { student_id: STUDENT_ID, raw_score: 85, is_missing: false, comment: 'Good work' },
          ],
        }),
      );

      expect(result.data).toHaveLength(1);
    });

    it('should skip comment validation when raw_score is null even with requireGradeComment', async () => {
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        status: 'open',
        class_id: CLASS_ID,
        max_score: 100,
      });
      mockClassesFacade.findEnrolledStudentIds.mockResolvedValue([STUDENT_ID]);
      mockConfigFacade.findSettings.mockResolvedValue({
        settings: { gradebook: { requireGradeComment: true } },
      });
      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockRlsTx.grade.upsert.mockResolvedValue({ id: 'grade-1' });

      const result = await service.bulkUpsert(
        TENANT_ID,
        ASSESSMENT_ID,
        USER_ID,
        buildValidDto({ grades: [{ student_id: STUDENT_ID, raw_score: null, is_missing: true }] }),
      );

      expect(result.data).toHaveLength(1);
    });

    it('edge: should throw BadRequestException when score is negative', async () => {
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        status: 'open',
        class_id: CLASS_ID,
        max_score: 100,
      });
      mockClassesFacade.findEnrolledStudentIds.mockResolvedValue([STUDENT_ID]);
      mockConfigFacade.findSettings.mockResolvedValue(null);

      await expect(
        service.bulkUpsert(
          TENANT_ID,
          ASSESSMENT_ID,
          USER_ID,
          buildValidDto({ grades: [{ student_id: STUDENT_ID, raw_score: -5, is_missing: false }] }),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── findByAssessment ─────────────────────────────────────────────────────

  describe('findByAssessment', () => {
    it('should throw NotFoundException when assessment does not exist', async () => {
      mockPrisma.assessment.findFirst.mockResolvedValue(null);

      await expect(service.findByAssessment(TENANT_ID, ASSESSMENT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return grades with student info when assessment exists', async () => {
      mockPrisma.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID });
      mockPrisma.grade.findMany.mockResolvedValue([
        {
          id: 'grade-1',
          student: {
            id: STUDENT_ID,
            first_name: 'Alice',
            last_name: 'Smith',
            student_number: 'S001',
          },
          entered_by: null,
          raw_score: 85,
          is_missing: false,
        },
      ]);

      const result = await service.findByAssessment(TENANT_ID, ASSESSMENT_ID);

      expect(result.data).toHaveLength(1);
    });
  });

  // ─── findByStudent ────────────────────────────────────────────────────────

  describe('findByStudent', () => {
    it('should throw NotFoundException when student does not exist', async () => {
      mockStudentFacade.findById.mockResolvedValue(null);

      await expect(service.findByStudent(TENANT_ID, STUDENT_ID, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return grades with assessment info when student exists', async () => {
      mockStudentFacade.findById.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });
      mockPrisma.grade.findMany.mockResolvedValue([
        {
          id: 'grade-1',
          raw_score: 85,
          is_missing: false,
          assessment: {
            id: ASSESSMENT_ID,
            title: 'Quiz 1',
            max_score: 100,
            status: 'open',
            class_entity: { id: CLASS_ID, name: 'Class A' },
            subject: { id: 'sub-1', name: 'Math', code: 'MATH' },
            academic_period: { id: 'period-1', name: 'Term 1' },
            category: { id: 'cat-1', name: 'Quizzes' },
          },
        },
      ]);

      const result = await service.findByStudent(TENANT_ID, STUDENT_ID, {});

      expect(result.student.id).toBe(STUDENT_ID);
      expect(result.data).toHaveLength(1);
    });

    it('should pass class_id filter to grade query when provided', async () => {
      mockStudentFacade.findById.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });
      mockPrisma.grade.findMany.mockResolvedValue([]);

      await service.findByStudent(TENANT_ID, STUDENT_ID, { class_id: CLASS_ID });

      expect(mockPrisma.grade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assessment: expect.objectContaining({ class_id: CLASS_ID }),
          }),
        }),
      );
    });

    it('should pass subject_id filter to grade query when provided', async () => {
      mockStudentFacade.findById.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });
      mockPrisma.grade.findMany.mockResolvedValue([]);

      await service.findByStudent(TENANT_ID, STUDENT_ID, { subject_id: 'sub-1' });

      expect(mockPrisma.grade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assessment: expect.objectContaining({ subject_id: 'sub-1' }),
          }),
        }),
      );
    });

    it('should pass academic_period_id filter to grade query when provided', async () => {
      mockStudentFacade.findById.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
      });
      mockPrisma.grade.findMany.mockResolvedValue([]);

      await service.findByStudent(TENANT_ID, STUDENT_ID, { academic_period_id: 'period-1' });

      expect(mockPrisma.grade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assessment: expect.objectContaining({ academic_period_id: 'period-1' }),
          }),
        }),
      );
    });
  });
});
