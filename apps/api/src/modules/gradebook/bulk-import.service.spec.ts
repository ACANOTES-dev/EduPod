import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  StudentReadFacade,
  AcademicReadFacade,
  ClassesReadFacade,
} from '../../common/tests/mock-facades';
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
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: typeof mockRlsTx) => Promise<unknown>) => fn(mockRlsTx)),
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
  const mockStudentFacade = { findManyGeneric: jest.fn() };
  const mockAcademicFacade = { findAllSubjects: jest.fn() };
  const mockClassesFacade = { findEnrolmentsGeneric: jest.fn() };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.grade.upsert.mockReset();
    mockStudentFacade.findManyGeneric.mockResolvedValue([]);
    mockAcademicFacade.findAllSubjects.mockResolvedValue([]);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: StudentReadFacade, useValue: mockStudentFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
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
      mockStudentFacade.findManyGeneric.mockResolvedValue([]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
      ]);

      const csv = makeCsvBuffer(['S001,MATH,Quiz 1,85']);
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.valid).toBe(false);
      expect(result.rows[0]?.errors).toContain('Student not found: "S001"');
    });

    it('should return validation result with error when subject is not found', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([
        { id: STUDENT_ID, student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([]);

      const csv = makeCsvBuffer(['S001,MATH,Quiz 1,85']);
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.valid).toBe(false);
      expect(result.rows[0]?.errors).toContain('Subject not found: "MATH"');
    });

    it('should return valid result when all identifiers match and score is within max', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([
        { id: STUDENT_ID, student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
      ]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
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
      mockStudentFacade.findManyGeneric.mockResolvedValue([
        { id: STUDENT_ID, student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
      ]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        max_score: 50,
      });

      const csv = makeCsvBuffer(['S001,MATH,Quiz 1,85']);
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.valid).toBe(false);
      expect(result.rows[0]?.errors.some((e: string) => e.includes('exceeds max score'))).toBe(
        true,
      );
    });

    it('should report error when score is invalid (non-numeric)', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([
        { id: STUDENT_ID, student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
      ]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        max_score: 100,
      });

      const csv = makeCsvBuffer(['S001,MATH,Quiz 1,abc']);
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.valid).toBe(false);
      expect(result.rows[0]?.errors.some((e: string) => e.includes('Invalid score value'))).toBe(
        true,
      );
    });
  });

  // ─── processImport ────────────────────────────────────────────────────────

  describe('processImport', () => {
    it('should throw BadRequestException when no rows are provided', async () => {
      await expect(service.processImport(TENANT_ID, USER_ID, [])).rejects.toThrow(
        BadRequestException,
      );
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
      mockStudentFacade.findManyGeneric.mockResolvedValue([]);
      mockPrisma.assessment.findMany.mockResolvedValue([]);

      const result = await service.generateTemplate(TENANT_ID);

      expect(result.data.headers).toEqual([
        'student_identifier',
        'subject_code',
        'assessment_title',
        'score',
      ]);
      expect(result.data.rows).toHaveLength(0);
    });

    it('should include student-assessment rows in the template', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([
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
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockStudentFacade.findManyGeneric.mockResolvedValue([
        { student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockPrisma.assessment.findMany.mockResolvedValue([]);

      await service.generateTemplate(TENANT_ID, CLASS_ID);

      expect(mockClassesFacade.findEnrolmentsGeneric).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ class_id: CLASS_ID }),
        expect.anything(),
      );
    });

    it('should filter assessments by periodId when provided', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([]);
      mockPrisma.assessment.findMany.mockResolvedValue([]);

      await service.generateTemplate(TENANT_ID, undefined, 'period-1');

      expect(mockPrisma.assessment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ academic_period_id: 'period-1' }),
        }),
      );
    });

    it('should use full name as identifier when student_number is null', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([
        { student_number: null, first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockPrisma.assessment.findMany.mockResolvedValue([
        { title: 'Quiz 1', subject: { code: null, name: 'Math' } },
      ]);

      const result = await service.generateTemplate(TENANT_ID);

      expect(result.data.rows[0]![0]).toBe('Alice Smith');
    });

    it('should use subject name when subject code is null', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([
        { student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockPrisma.assessment.findMany.mockResolvedValue([
        { title: 'Quiz 1', subject: { code: null, name: 'Mathematics' } },
      ]);

      const result = await service.generateTemplate(TENANT_ID);

      expect(result.data.rows[0]![1]).toBe('Mathematics');
    });
  });

  // ─── validateCsv — additional branches ─────────────────────────────────────

  describe('validateCsv — additional branches', () => {
    it('should report error when student is not enrolled in any class', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([
        { id: STUDENT_ID, student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
      ]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([]);

      const csv = makeCsvBuffer(['S001,MATH,Quiz 1,85']);
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.rows[0]?.errors).toContain('Student is not enrolled in any class');
    });

    it('should report error when assessment is not found in enrolled classes', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([
        { id: STUDENT_ID, student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
      ]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockPrisma.assessment.findFirst.mockResolvedValue(null);

      const csv = makeCsvBuffer(['S001,MATH,Quiz 1,85']);
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.rows[0]?.errors.some((e: string) => e.includes('Assessment not found'))).toBe(
        true,
      );
    });

    it('should report error for negative score', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([
        { id: STUDENT_ID, student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
      ]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockPrisma.assessment.findFirst.mockResolvedValue({
        id: ASSESSMENT_ID,
        max_score: 100,
      });

      const csv = makeCsvBuffer(['S001,MATH,Quiz 1,-5']);
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.rows[0]?.errors.some((e: string) => e.includes('negative'))).toBe(true);
    });

    it('should match student by name when student_number does not match', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([
        { id: STUDENT_ID, student_number: null, first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
      ]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockPrisma.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID, max_score: 100 });

      const csv = makeCsvBuffer(['Alice Smith,MATH,Quiz 1,85']);
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.rows[0]?.matched_student_id).toBe(STUDENT_ID);
    });

    it('should match subject by name when code does not match', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([
        { id: STUDENT_ID, student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Mathematics', code: null },
      ]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockPrisma.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID, max_score: 100 });

      const csv = makeCsvBuffer(['S001,Mathematics,Quiz 1,85']);
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.rows[0]?.matched_subject_id).toBe(SUBJECT_ID);
    });

    it('should skip empty lines in CSV', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([]);

      const csv = Buffer.from(
        'student_identifier,subject_code,assessment_title,score\n\nS001,MATH,Quiz 1,85\n\n',
        'utf-8',
      );
      const result = await service.validateCsv(TENANT_ID, csv);

      // Only the non-empty data line should be processed
      expect(result.rows).toHaveLength(1);
    });

    it('should report missing fields when values are empty', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([]);

      const csv = makeCsvBuffer([',,,']);
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.rows[0]?.errors).toContain('Missing student_identifier');
      expect(result.rows[0]?.errors).toContain('Missing subject_code');
      expect(result.rows[0]?.errors).toContain('Missing assessment_title');
      expect(result.rows[0]?.errors).toContain('Missing score');
    });

    it('should handle quoted CSV fields correctly', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([
        { id: STUDENT_ID, student_number: null, first_name: 'Alice', last_name: "O'Brien" },
      ]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
      ]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockPrisma.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID, max_score: 100 });

      const csv = Buffer.from(
        'student_identifier,subject_code,assessment_title,score\n"Alice O\'Brien",MATH,"Quiz 1",85',
        'utf-8',
      );
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.rows[0]?.student_identifier).toBe("Alice O'Brien");
    });
  });

  // ─── validateCsv — CSV parsing edge cases ──────────────────────────────────

  describe('validateCsv — CSV parsing edge cases', () => {
    it('should handle escaped double quotes within quoted fields', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([
        { id: STUDENT_ID, student_number: null, first_name: 'He said', last_name: '"Hello"' },
      ]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
      ]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockPrisma.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID, max_score: 100 });

      // CSV with escaped quote: ""Hello"" inside quotes
      const csv = Buffer.from(
        'student_identifier,subject_code,assessment_title,score\n"He said ""Hello""",MATH,Quiz 1,85',
        'utf-8',
      );
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.rows[0]?.student_identifier).toBe('He said "Hello"');
    });

    it('should handle CSV row with fewer columns than expected', async () => {
      mockStudentFacade.findManyGeneric.mockResolvedValue([]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([]);

      // Row with only 2 columns instead of 4
      const csv = Buffer.from(
        'student_identifier,subject_code,assessment_title,score\nS001,MATH',
        'utf-8',
      );
      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.errors).toContain('Missing assessment_title');
      expect(result.rows[0]?.errors).toContain('Missing score');
    });

    it('edge: should handle CSV with only header and empty lines', async () => {
      const csv = Buffer.from('student_identifier,subject_code,assessment_title,score\n', 'utf-8');

      // The only data "row" is empty, so it gets skipped.
      // lines.length >= 2 is satisfied, but all rows are empty.
      mockStudentFacade.findManyGeneric.mockResolvedValue([]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([]);

      const result = await service.validateCsv(TENANT_ID, csv);

      expect(result.rows).toHaveLength(0);
      expect(result.valid).toBe(true);
    });
  });

  // ─── validateXlsx ──────────────────────────────────────────────────────────

  describe('validateXlsx', () => {
    it('should throw BadRequestException when XLSX contains no data rows', async () => {
      // Create a workbook with only headers, no data
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([['student_id', 'assessment_id', 'score']]);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      await expect(service.validateXlsx(TENANT_ID, buffer)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when XLSX has no sheets', async () => {
      // Create a workbook with a sheet, write it, then manipulate to remove sheets
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([['dummy']]);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      // Re-read and remove sheets to trigger the empty check
      const wb2 = XLSX.read(buffer, { type: 'buffer' });
      wb2.SheetNames = [];
      wb2.Sheets = {};

      // Mock XLSX.read to return the modified workbook
      const origRead = XLSX.read;
      jest.spyOn(XLSX, 'read').mockReturnValueOnce(wb2);

      await expect(service.validateXlsx(TENANT_ID, buffer)).rejects.toThrow(BadRequestException);

      XLSX.read = origRead;
    });

    it('should convert XLSX to CSV and validate', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ['student_identifier', 'subject_code', 'assessment_title', 'score'],
        ['S001', 'MATH', 'Quiz 1', 85],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      mockStudentFacade.findManyGeneric.mockResolvedValue([
        { id: STUDENT_ID, student_number: 'S001', first_name: 'Alice', last_name: 'Smith' },
      ]);
      mockAcademicFacade.findAllSubjects.mockResolvedValue([
        { id: SUBJECT_ID, name: 'Math', code: 'MATH' },
      ]);
      mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([{ class_id: CLASS_ID }]);
      mockPrisma.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID, max_score: 100 });

      const result = await service.validateXlsx(TENANT_ID, buffer);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]?.matched_student_id).toBe(STUDENT_ID);
    });
  });

  // ─── processImport — additional branches ───────────────────────────────────

  describe('processImport — additional branches', () => {
    it('should throw BadRequestException when score is negative', async () => {
      mockPrisma.assessment.findMany.mockResolvedValue([
        { id: ASSESSMENT_ID, status: 'open', max_score: 100 },
      ]);

      await expect(
        service.processImport(TENANT_ID, USER_ID, [
          { assessment_id: ASSESSMENT_ID, student_id: STUDENT_ID, score: -5 },
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('should process multiple rows across different assessments', async () => {
      const ASSESSMENT_ID_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02';
      mockPrisma.assessment.findMany.mockResolvedValue([
        { id: ASSESSMENT_ID, status: 'draft', max_score: 100 },
        { id: ASSESSMENT_ID_2, status: 'open', max_score: 50 },
      ]);
      mockRlsTx.grade.upsert
        .mockResolvedValueOnce({ id: 'g1' })
        .mockResolvedValueOnce({ id: 'g2' });

      const result = await service.processImport(TENANT_ID, USER_ID, [
        { assessment_id: ASSESSMENT_ID, student_id: STUDENT_ID, score: 85 },
        { assessment_id: ASSESSMENT_ID_2, student_id: STUDENT_ID, score: 40 },
      ]);

      expect(result.summary.total_imported).toBe(2);
      expect(result.summary.assessments_affected).toBe(2);
    });
  });
});
