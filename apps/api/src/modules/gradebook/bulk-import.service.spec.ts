import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BulkImportService } from './bulk-import.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ASSESSMENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const CLASS_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const SUBJECT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  grade: {
    upsert: jest.fn(),
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
    student: { findMany: jest.fn() },
    subject: { findMany: jest.fn() },
    classEnrolment: { findMany: jest.fn() },
    assessment: { findMany: jest.fn(), findFirst: jest.fn() },
  };
}

function makeCsvBuffer(rows: string[]): Buffer {
  const lines = ['student_identifier,subject_code,assessment_title,score', ...rows];
  return Buffer.from(lines.join('\n'), 'utf-8');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BulkImportService', () => {
  let service: BulkImportService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.grade.upsert.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkImportService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BulkImportService>(BulkImportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── validateCsv ─────────────────────────────────────────────────────────

  describe('validateCsv', () => {
    it('should throw BadRequestException when csv has only a header row and no data rows', async () => {
      const csv = Buffer.from('student_identifier,subject_code,assessment_title,score', 'utf-8');

      await expect(service.validateCsv(TENANT_ID, csv)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when a required column is missing from the header', async () => {
      const csv = Buffer.from('student_identifier,subject_code,score\nS001,MATH,85', 'utf-8');

      await expect(service.validateCsv(TENANT_ID, csv)).rejects.toThrow(BadRequestException);
    });

    it('should return validation result with error when student is not found', async () => {
      mockPrisma.student.findMany.mockResolvedValue([]);
      mockPrisma.subject.findMany.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
      ]);

      const csv = makeCsvBuffer(['S001,MATH,Quiz 1,85']);
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.valid).toBe(false);
      expect(result.rows[0]?.errors).toContain('Student not found: "S001"');
    });

    it('should return validation result with error when subject is not found', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        { id: STUDENT_ID, student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockPrisma.subject.findMany.mockResolvedValue([]);

      const csv = makeCsvBuffer(['S001,MATH,Quiz 1,85']);
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.valid).toBe(false);
      expect(result.rows[0]?.errors).toContain('Subject not found: "MATH"');
    });

    it('should return valid result when all identifiers match and score is within max', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        { id: STUDENT_ID, student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockPrisma.subject.findMany.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
      ]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        max_score: 100,
      });

      const csv = makeCsvBuffer(['S001,MATH,Quiz 1,85']);
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.valid).toBe(true);
      expect(result.rows[0]?.matched_student_id).toBe(STUDENT_ID);
      expect(result.rows[0]?.matched_assessment_id).toBe(ASSESSMENT_ID);
      expect(result.summary.valid_rows).toBe(1);
      expect(result.summary.error_rows).toBe(0);
    });

    it('should report error when score exceeds assessment max_score', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        { id: STUDENT_ID, student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockPrisma.subject.findMany.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
      ]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        max_score: 50,
      });

      const csv = makeCsvBuffer(['S001,MATH,Quiz 1,85']);
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.valid).toBe(false);
      expect(result.rows[0]?.errors.some((e: string) => e.includes('exceeds max score'))).toBe(true);
    });

    it('should report error when score is invalid (non-numeric)', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        { id: STUDENT_ID, student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockPrisma.subject.findMany.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
      ]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        max_score: 100,
      });

      const csv = makeCsvBuffer(['S001,MATH,Quiz 1,abc']);
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.valid).toBe(false);
      expect(result.rows[0]?.errors.some((e: string) => e.includes('Invalid score value'))).toBe(true);
    });
  });

  // ─── processImport ────────────────────────────────────────────────────────

  describe('processImport', () => {
    it('should throw BadRequestException when no rows are provided', async () => {
      await expect(
        service.processImport(TENANT_ID, USER_ID, []),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when assessment does not exist', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([]);

      await expect(
        service.processImport(TENANT_ID, USER_ID, [
          { assessment_id: ASSESSMENT_ID, student_id: STUDENT_ID, score: 85 },
        ]),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when assessment status is not draft or open', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([
        { id: ASSESSMENT_ID, status: 'closed', max_score: 100 },
      ]);

      await expect(
        service.processImport(TENANT_ID, USER_ID, [
          { assessment_id: ASSESSMENT_ID, student_id: STUDENT_ID, score: 85 },
        ]),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException when score exceeds max_score', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([
        { id: ASSESSMENT_ID, status: 'open', max_score: 50 },
      ]);

      await expect(
        service.processImport(TENANT_ID, USER_ID, [
          { assessment_id: ASSESSMENT_ID, student_id: STUDENT_ID, score: 85 },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('should upsert grades and return summary when import is valid', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([
        { id: ASSESSMENT_ID, status: 'open', max_score: 100 },
      ]);
      mockRlsTx.grade.upsert.mockResolvedValue({ id: 'grade-1' });

      const result = await service.processImport(TENANT_ID, USER_ID, [
        { assessment_id: ASSESSMENT_ID, student_id: STUDENT_ID, score: 85 },
      ]);

      expect(result.summary.total_imported).toBe(1);
      expect(result.summary.assessments_affected).toBe(1);
      expect(mockRlsTx.grade.upsert).toHaveBeenCalledTimes(1);
    });
  });

  // ─── generateTemplate ─────────────────────────────────────────────────────

  describe('generateTemplate', () => {
    it('should return a CSV template with header row when no students or assessments exist', async () => {
      mockPrisma.student.findMany.mockResolvedValue([]);
      mockPrisma.assessment.findMany.mockResolvedValue([]);

      const result = await service.generateTemplate(TENANT_ID);

      expect(result.data.headers).toEqual(['student_identifier', 'subject_code', 'assessment_title', 'score']);
      expect(result.data.rows).toHaveLength(0);
    });

    it('should include student-assessment rows in the template', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        { student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockPrisma.assessment.findMany.mockResolvedValue([
        {
          title: 'Quiz 1',
          subject: { code: 'MATH', name: 'Math' },
        },
      ]);

      const result = await service.generateTemplate(TENANT_ID);

      expect(result.data.rows).toHaveLength(1);
      expect(result.data.rows[0]).toEqual(['S001', 'MATH', 'Quiz 1', '']);
    });

    it('should filter students by classId when provided', async () => {
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        { student_id: STUDENT_ID },
      ]);
      mockPrisma.student.findMany.mockResolvedValue([
        { student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockPrisma.assessment.findMany.mockResolvedValue([]);

      await service.generateTemplate(TENANT_ID, CLASS_ID);

      expect(mockPrisma.classEnrolment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ class_id: CLASS_ID }),
        }),
      );
    });
  });
});
