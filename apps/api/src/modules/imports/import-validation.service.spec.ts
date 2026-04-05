import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

import { ImportValidationService } from './import-validation.service';

const TENANT_ID = 'tenant-uuid-1';
const JOB_ID = 'import-job-uuid-1';
const FILE_KEY = `${TENANT_ID}/imports/${JOB_ID}.csv`;

function buildMockJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: JOB_ID,
    tenant_id: TENANT_ID,
    import_type: 'students',
    status: 'uploaded',
    file_key: FILE_KEY,
    summary_json: {},
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function csvBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8');
}

describe('ImportValidationService', () => {
  let service: ImportValidationService;
  let mockPrisma: {
    importJob: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
  let mockS3: {
    upload: jest.Mock;
    download: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      importJob: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    mockS3 = {
      upload: jest.fn(),
      download: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportValidationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<ImportValidationService>(ImportValidationService);

    jest.clearAllMocks();
  });

  /** Helper to extract the summary_json passed to the final importJob.update call */
  function getUpdateSummary(): Record<string, unknown> {
    const calls = mockPrisma.importJob.update.mock.calls;
    const lastCall = calls[calls.length - 1];
    return (lastCall?.[0]?.data?.summary_json ?? {}) as Record<string, unknown>;
  }

  function getUpdateStatus(): string {
    const calls = mockPrisma.importJob.update.mock.calls;
    const lastCall = calls[calls.length - 1];
    return (lastCall?.[0]?.data?.status ?? '') as string;
  }

  // ─── validate() — students ────────────────────────────────────────────────

  describe('validate() — students', () => {
    const VALID_STUDENTS_CSV = [
      'first_name,last_name,student_number,date_of_birth,year_group_name,gender,nationality',
      'John,Doe,STU001,2010-05-15,Year 5,male,British',
      'Jane,Smith,STU002,2011-03-20,Year 4,female,American',
    ].join('\n');

    it('should validate a correct students CSV -> status=validated, successful > 0', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(VALID_STUDENTS_CSV));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
      const summary = getUpdateSummary();
      expect(summary['total_rows']).toBe(2);
      expect(summary['successful']).toBe(2);
      expect(summary['failed']).toBe(0);
    });

    it('should fail when required headers missing -> status=failed, error "Missing required headers"', async () => {
      const csv = 'first_name,last_name\nJohn,Doe';
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('failed');
      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ error: expect.stringContaining('Missing required headers') }),
        ]),
      );
    });

    it('should fail row when required field is empty -> error references field', async () => {
      const csv = [
        'first_name,last_name,student_number,date_of_birth,year_group_name,gender,nationality',
        ',Doe,STU001,2010-05-15,Year 5,male,British',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'first_name',
            error: expect.stringContaining('first_name'),
          }),
        ]),
      );
      expect(summary['failed']).toBe(1);
    });

    it('should accept DD/MM/YYYY date format (flexible parsing)', async () => {
      const csv = [
        'first_name,last_name,student_number,date_of_birth,year_group_name,gender,nationality',
        'John,Doe,STU001,15/05/2010,Year 5,male,British',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      // DD/MM/YYYY is now accepted as a valid format
      expect(getUpdateStatus()).toBe('validated');
      const summary = getUpdateSummary();
      expect(summary['successful']).toBe(1);
    });

    it('should fail row with invalid gender value -> "Gender must be one of: male, female, m, f"', async () => {
      const csv = [
        'first_name,last_name,student_number,date_of_birth,year_group_name,gender,nationality',
        'John,Doe,STU001,2010-05-15,Year 5,unknown,British',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'gender',
            error: 'Gender must be one of: male, female, m, f',
          }),
        ]),
      );
    });

    it('should warn on duplicate student (same first_name + last_name + dob)', async () => {
      const csv = [
        'first_name,last_name,student_number,date_of_birth,year_group_name,gender,nationality',
        'John,Doe,STU001,2010-05-15,Year 5,male,British',
        'John,Doe,STU002,2010-05-15,Year 5,male,British',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const warnings = summary['warnings_list'] as Array<Record<string, unknown>>;
      expect(warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            warning: expect.stringContaining('duplicate'),
          }),
        ]),
      );
      expect(summary['warnings']).toBeGreaterThanOrEqual(1);
    });

    it('should set status to failed when all rows fail', async () => {
      const csv = [
        'first_name,last_name,student_number,date_of_birth,year_group_name,gender,nationality',
        ',Doe,STU001,,Year 5,male,British',
        ',Smith,STU002,,Year 4,female,American',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('failed');
      const summary = getUpdateSummary();
      expect(summary['failed']).toBe(2);
      expect(summary['successful']).toBe(0);
    });
  });

  // ─── validate() — parents ────────────────────────────────────────────────

  describe('validate() — parents', () => {
    it('should validate correct parents CSV', async () => {
      const csv = [
        'first_name,last_name,email,phone,household_name',
        'Alice,Johnson,alice@example.com,+1234567890,Johnson Family',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'parents' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
      const summary = getUpdateSummary();
      expect(summary['successful']).toBe(1);
    });

    it('should fail row with invalid email format -> "Invalid email format"', async () => {
      const csv = [
        'first_name,last_name,email,phone,household_name',
        'Alice,Johnson,not-an-email,+1234567890,Johnson Family',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'parents' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            error: 'Invalid email format',
          }),
        ]),
      );
    });

    it('should warn on duplicate email', async () => {
      const csv = [
        'first_name,last_name,email,phone,household_name',
        'Alice,Johnson,alice@example.com,+1234567890,Johnson Family',
        'Bob,Johnson,alice@example.com,+0987654321,Johnson Family',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'parents' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const warnings = summary['warnings_list'] as Array<Record<string, unknown>>;
      expect(warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            warning: expect.stringContaining('Duplicate email'),
          }),
        ]),
      );
    });

    it('should fail row with missing required email', async () => {
      const csv = [
        'first_name,last_name,email,phone,household_name',
        'Alice,Johnson,,+1234567890,Johnson Family',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'parents' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            error: expect.stringContaining('email'),
          }),
        ]),
      );
      expect(summary['failed']).toBe(1);
    });
  });

  // ─── validate() — staff ───────────────────────────────────────────────────

  describe('validate() — staff', () => {
    it('should validate correct staff CSV', async () => {
      const csv = [
        'first_name,last_name,email,job_title,department,employment_type',
        'Jane,Smith,jane@school.com,Teacher,Math,full_time',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'staff' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
      const summary = getUpdateSummary();
      expect(summary['successful']).toBe(1);
    });

    it('should fail row with invalid email', async () => {
      const csv = [
        'first_name,last_name,email,job_title,department,employment_type',
        'Jane,Smith,bad-email,Teacher,Math,full_time',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'staff' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            error: 'Invalid email format',
          }),
        ]),
      );
    });
  });

  // ─── validate() — fees ────────────────────────────────────────────────────

  describe('validate() — fees', () => {
    it('should validate correct fees CSV', async () => {
      const csv = ['fee_structure_name,household_name,amount', 'Tuition,Johnson Family,5000'].join(
        '\n',
      );
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'fees' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
      const summary = getUpdateSummary();
      expect(summary['successful']).toBe(1);
    });

    it('should fail row when amount is not a number', async () => {
      const csv = [
        'fee_structure_name,household_name,amount',
        'Tuition,Johnson Family,not_a_number',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'fees' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'amount',
            error: expect.stringContaining('number'),
          }),
        ]),
      );
    });
  });

  // ─── validate() — exam_results ────────────────────────────────────────────

  describe('validate() — exam_results', () => {
    it('should validate correct exam_results CSV', async () => {
      const csv = ['student_number,subject,score,grade', 'STU001,Math,95,A'].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'exam_results' }),
      );
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
      const summary = getUpdateSummary();
      expect(summary['successful']).toBe(1);
    });

    it('should fail row when score is not a number', async () => {
      const csv = ['student_number,subject,score,grade', 'STU001,Math,excellent,A'].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'exam_results' }),
      );
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'score',
            error: expect.stringContaining('number'),
          }),
        ]),
      );
    });
  });

  // ─── validate() — staff_compensation ──────────────────────────────────────

  describe('validate() — staff_compensation', () => {
    it('should validate correct staff_compensation CSV', async () => {
      const csv = ['staff_number,compensation_type,amount', 'STF001,salaried,50000'].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'staff_compensation' }),
      );
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
      const summary = getUpdateSummary();
      expect(summary['successful']).toBe(1);
    });

    it('should fail row with invalid compensation_type -> "compensation_type must be one of: salaried, per_class, hourly"', async () => {
      const csv = ['staff_number,compensation_type,amount', 'STF001,monthly,50000'].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'staff_compensation' }),
      );
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'compensation_type',
            error: 'compensation_type must be one of: salaried, per_class, hourly',
          }),
        ]),
      );
    });

    it('should fail row when amount is not a number', async () => {
      const csv = ['staff_number,compensation_type,amount', 'STF001,salaried,not_num'].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'staff_compensation' }),
      );
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'amount',
            error: 'amount must be a valid number',
          }),
        ]),
      );
    });

    it('should validate per_class compensation type', async () => {
      const csv = ['staff_number,compensation_type,amount', 'STF001,per_class,100'].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'staff_compensation' }),
      );
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
      const summary = getUpdateSummary();
      expect(summary['successful']).toBe(1);
    });

    it('should allow optional base_salary and per_class_rate fields (not in required schema)', async () => {
      const csv = [
        'staff_number,compensation_type,amount,base_salary,per_class_rate',
        'STF001,salaried,50000,,',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'staff_compensation' }),
      );
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
      const summary = getUpdateSummary();
      expect(summary['successful']).toBe(1);
      expect(summary['failed']).toBe(0);
    });
  });

  // ─── validate() — edge cases ──────────────────────────────────────────────

  describe('validate() — edge cases', () => {
    it('edge: should handle empty CSV file -> status=failed, error about no header row', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(''));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('failed');
      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors.length).toBeGreaterThan(0);
    });

    it('edge: should handle CSV with only headers -> status=failed, error about no data rows', async () => {
      const csv =
        'first_name,last_name,student_number,date_of_birth,year_group_name,gender,nationality';
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('failed');
    });

    it('edge: should handle quoted CSV fields with commas', async () => {
      const csv = [
        'first_name,last_name,student_number,date_of_birth,year_group_name,gender,nationality',
        '"John, Jr.",Doe,STU001,2010-05-15,Year 5,male,British',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
      const summary = getUpdateSummary();
      expect(summary['successful']).toBe(1);
      expect(summary['failed']).toBe(0);
    });

    it('edge: should handle escaped quotes in CSV', async () => {
      const csv = [
        'first_name,last_name,student_number,date_of_birth,year_group_name,gender,nationality',
        '"John ""Johnny""",Doe,STU001,2010-05-15,Year 5,male,British',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
      const summary = getUpdateSummary();
      expect(summary['successful']).toBe(1);
    });

    it('edge: should handle S3 download failure -> status=failed, error includes "Validation error"', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockRejectedValue(new Error('S3 access denied'));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('failed');
      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            error: expect.stringContaining('Validation error'),
          }),
        ]),
      );
    });

    it('edge: should handle job with missing file_key -> returns early', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ file_key: null }));

      await service.validate(TENANT_ID, JOB_ID);

      // Should not attempt S3 download or update the job
      expect(mockS3.download).not.toHaveBeenCalled();
      expect(mockPrisma.importJob.update).not.toHaveBeenCalled();
    });

    it('edge: should handle job not found -> returns early', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(null);

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockS3.download).not.toHaveBeenCalled();
      expect(mockPrisma.importJob.update).not.toHaveBeenCalled();
    });

    it('edge: should filter out example rows and fail when only examples remain', async () => {
      const csv = [
        'first_name,last_name,date_of_birth,gender',
        'Aisha,Al-Mansour,2015-01-01,female',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('failed');
      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ error: expect.stringContaining('example rows') }),
        ]),
      );
    });

    it('edge: should handle CSV with Windows-style CRLF line endings', async () => {
      const csv = ['first_name,last_name,date_of_birth,gender', 'John,Doe,2010-05-15,male'].join(
        '\r\n',
      );
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
    });
  });

  // ─── validate() — XLSX file handling ────────────────────────────────────

  describe('validate() — XLSX file detection', () => {
    it('should detect xlsx file from file_key extension', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ file_key: `${TENANT_ID}/imports/${JOB_ID}.xlsx` }),
      );
      // Empty buffer will cause xlsx parse to produce empty headers
      mockS3.download.mockResolvedValue(Buffer.alloc(0));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      // Should have been called with failed and no header row error
      expect(getUpdateStatus()).toBe('failed');
    });
  });

  // ─── validate() — student-specific validators ──────────────────────────

  describe('validate() — student row validators', () => {
    it('should fail row with invalid date format (not YYYY-MM-DD, DD/MM/YYYY, or DD-MM-YYYY)', async () => {
      const csv = [
        'first_name,last_name,date_of_birth,gender',
        'John,Doe,March 15th 2010,male',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'date_of_birth',
            error: expect.stringContaining('Invalid date format'),
          }),
        ]),
      );
    });

    it('should fail row with age out of range (too old, >25)', async () => {
      const csv = ['first_name,last_name,date_of_birth,gender', 'John,Doe,1990-01-01,male'].join(
        '\n',
      );
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'date_of_birth',
            error: expect.stringContaining('between 3 and 25'),
          }),
        ]),
      );
    });

    it('should fail row with too young student (< 3 years)', async () => {
      const csv = ['first_name,last_name,date_of_birth,gender', 'John,Doe,2025-01-01,male'].join(
        '\n',
      );
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'date_of_birth',
            error: expect.stringContaining('between 3 and 25'),
          }),
        ]),
      );
    });

    it('should fail row with first_name exceeding 100 characters', async () => {
      const longName = 'A'.repeat(101);
      const csv = [
        'first_name,last_name,date_of_birth,gender',
        `${longName},Doe,2010-05-15,male`,
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'first_name',
            error: expect.stringContaining('100 characters'),
          }),
        ]),
      );
    });

    it('should fail row with last_name exceeding 100 characters', async () => {
      const longName = 'B'.repeat(101);
      const csv = [
        'first_name,last_name,date_of_birth,gender',
        `John,${longName},2010-05-15,male`,
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'last_name',
            error: expect.stringContaining('100 characters'),
          }),
        ]),
      );
    });

    it('should fail row with invalid parent1_email format', async () => {
      const csv = [
        'first_name,last_name,date_of_birth,gender,parent1_email',
        'John,Doe,2010-05-15,male,not-valid-email',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'parent1_email',
            error: expect.stringContaining('email'),
          }),
        ]),
      );
    });

    it('should fail row with invalid parent1_phone format', async () => {
      const csv = [
        'first_name,last_name,date_of_birth,gender,parent1_phone',
        'John,Doe,2010-05-15,male,abc-invalid',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'parent1_phone',
            error: expect.stringContaining('Phone'),
          }),
        ]),
      );
    });

    it('should fail row with invalid parent1_relationship', async () => {
      const csv = [
        'first_name,last_name,date_of_birth,gender,parent1_relationship',
        'John,Doe,2010-05-15,male,uncle',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'parent1_relationship',
            error: expect.stringContaining('father, mother, guardian, other'),
          }),
        ]),
      );
    });

    it('should accept valid DD-MM-YYYY date format', async () => {
      const csv = ['first_name,last_name,date_of_birth,gender', 'John,Doe,15-05-2010,male'].join(
        '\n',
      );
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
    });

    it('should accept m/f as valid gender abbreviations', async () => {
      const csv = [
        'first_name,last_name,date_of_birth,gender',
        'John,Doe,2010-05-15,m',
        'Jane,Doe,2011-03-20,f',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
      const summary = getUpdateSummary();
      expect(summary['successful']).toBe(2);
    });
  });

  // ─── validate() — staff_compensation additional branches ────────────────

  describe('validate() — staff_compensation additional', () => {
    it('should fail row when base_salary is not a number', async () => {
      const csv = [
        'staff_number,compensation_type,amount,base_salary,per_class_rate',
        'STF001,salaried,50000,abc,',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'staff_compensation' }),
      );
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'base_salary',
            error: expect.stringContaining('number'),
          }),
        ]),
      );
    });

    it('should fail row when per_class_rate is not a number', async () => {
      const csv = [
        'staff_number,compensation_type,amount,base_salary,per_class_rate',
        'STF001,per_class,100,,xyz',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'staff_compensation' }),
      );
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'per_class_rate',
            error: expect.stringContaining('number'),
          }),
        ]),
      );
    });
  });

  // ─── validate() — staff duplicate email ──────────────────────────────────

  describe('validate() — staff duplicate email', () => {
    it('should warn on duplicate email in staff import', async () => {
      const csv = [
        'first_name,last_name,email',
        'John,Doe,john@school.com',
        'Jane,Doe,john@school.com',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'staff' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const warnings = summary['warnings_list'] as Array<Record<string, unknown>>;
      expect(warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            warning: expect.stringContaining('Duplicate email'),
          }),
        ]),
      );
    });
  });

  // ─── validate() — XLSX parsing branches ───────────────────────────────────

  describe('validate() — XLSX parsing additional', () => {
    it('should parse XLSX with date cells and detect file from .xlsx extension', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([
        ['first_name', 'last_name', 'date_of_birth', 'gender'],
        ['John', 'Doe', new Date('2010-05-15'), 'male'],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const xlsxBuffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ file_key: `${TENANT_ID}/imports/${JOB_ID}.xlsx` }),
      );
      mockS3.download.mockResolvedValue(xlsxBuffer);
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
      const summary = getUpdateSummary();
      expect(summary['successful']).toBe(1);
    });
  });

  // ─── validate() — example row detection ────────────────────────────────

  describe('validate() — example row detection additional', () => {
    it('should not false-positive for fees with non-example household name', async () => {
      const csv = ['fee_structure_name,household_name,amount', 'Tuition,Real Family,5000'].join(
        '\n',
      );
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'fees' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
      const summary = getUpdateSummary();
      expect(summary['successful']).toBe(1);
    });

    it('should detect staff_compensation example with stf-001 and parentheses hint', async () => {
      const csv = [
        'staff_number,compensation_type,amount',
        'stf-001,salaried (example),50000',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'staff_compensation' }),
      );
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      // stf-001 is in EXAMPLE_FIRST_NAMES AND there are parentheses -> example row detected
      expect(getUpdateStatus()).toBe('failed');
      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ error: expect.stringContaining('example rows') }),
        ]),
      );
    });

    it('should detect parent example row Ahmed Al-Mansour', async () => {
      const csv = ['first_name,last_name,email', 'Ahmed,Al-Mansour,ahmed@example.com'].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'parents' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('failed');
      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ error: expect.stringContaining('example rows') }),
        ]),
      );
    });

    it('should detect staff example row Sarah Johnson', async () => {
      const csv = ['first_name,last_name,email', 'Sarah,Johnson,sarah@school.edu'].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'staff' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('failed');
      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ error: expect.stringContaining('example rows') }),
        ]),
      );
    });

    it('should detect student Aisha Al-Mansour as example row in validation', async () => {
      const csv = [
        'first_name,last_name,date_of_birth,gender',
        'Aisha,Al-Mansour,2015-03-15,female',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('failed');
    });
  });

  // ─── validate() — parseCsv edge cases ─────────────────────────────────

  describe('validate() — parseCsv edge cases', () => {
    it('should handle CSV with whitespace-only data cells (filtered as empty row)', async () => {
      const csv = ['first_name,last_name,date_of_birth,gender', '   ,   ,   ,   '].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      // Whitespace-only row is filtered out by parseCsv (hasData check) -> no data rows
      expect(getUpdateStatus()).toBe('failed');
      const summary = getUpdateSummary();
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ error: expect.stringContaining('no data rows') }),
        ]),
      );
    });

    it('should handle multiple rows with mixed valid and invalid data', async () => {
      const csv = [
        'first_name,last_name,date_of_birth,gender',
        'John,Doe,2010-05-15,male',
        ',,,',
        'Jane,Smith,2011-03-20,female',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      expect(summary['total_rows']).toBe(2);
      expect(summary['successful']).toBe(2);
    });
  });

  // ─── validate() — student valid optional fields ─────────────────────────

  describe('validate() — student valid optional fields', () => {
    it('should pass with valid parent1_email', async () => {
      const csv = [
        'first_name,last_name,date_of_birth,gender,parent1_email',
        'John,Doe,2010-05-15,male,parent@school.edu',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
    });

    it('should pass with valid parent1_phone starting with digit', async () => {
      const csv = [
        'first_name,last_name,date_of_birth,gender,parent1_phone',
        'John,Doe,2010-05-15,male,0501234567',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
    });

    it('should pass with valid parent1_relationship other', async () => {
      const csv = [
        'first_name,last_name,date_of_birth,gender,parent1_relationship',
        'John,Doe,2010-05-15,male,other',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
    });

    it('should pass when optional fields are all empty', async () => {
      const csv = [
        'first_name,last_name,date_of_birth,gender,parent1_email,parent1_phone,parent1_relationship',
        'John,Doe,2010-05-15,male,,,,',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
    });
  });

  // ─── defensive parser branches ───────────────────────────────────────────

  describe('defensive parser branches', () => {
    it('should count undefined rows returned by the parser as failures', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer('ignored'));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      jest
        .spyOn(service as unknown as { parseCsv: (buffer: Buffer) => unknown }, 'parseCsv')
        .mockReturnValue({
          headers: ['first_name', 'last_name', 'date_of_birth', 'gender'],
          rows: [undefined],
        });
      jest
        .spyOn(
          service as unknown as { isExampleRow: (row: unknown, type: unknown) => boolean },
          'isExampleRow',
        )
        .mockReturnValue(false);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      expect(summary['failed']).toBe(1);
      expect(summary['successful']).toBe(0);
    });

    it('should return empty headers when xlsx workbook has no sheets', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      jest.spyOn(XLSX, 'read').mockReturnValue({ SheetNames: [], Sheets: {} });

      const result = (
        service as unknown as {
          parseXlsx: (buffer: Buffer) => { headers: string[]; rows: unknown[] };
        }
      ).parseXlsx(Buffer.from('xlsx'));

      expect(result).toEqual({ headers: [], rows: [] });
    });

    it('should return empty headers when the first xlsx sheet is missing', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      jest.spyOn(XLSX, 'read').mockReturnValue({ SheetNames: ['Sheet1'], Sheets: {} });

      const result = (
        service as unknown as {
          parseXlsx: (buffer: Buffer) => { headers: string[]; rows: unknown[] };
        }
      ).parseXlsx(Buffer.from('xlsx'));

      expect(result).toEqual({ headers: [], rows: [] });
    });

    it('should return empty headers when xlsx raw rows are empty', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      jest.spyOn(XLSX, 'read').mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      });
      jest.spyOn(XLSX.utils, 'sheet_to_json').mockReturnValue([]);

      const result = (
        service as unknown as {
          parseXlsx: (buffer: Buffer) => { headers: string[]; rows: unknown[] };
        }
      ).parseXlsx(Buffer.from('xlsx'));

      expect(result).toEqual({ headers: [], rows: [] });
    });

    it('should return empty headers when xlsx header row is missing', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      jest.spyOn(XLSX, 'read').mockReturnValue({
        SheetNames: ['Sheet1'],
        Sheets: { Sheet1: {} },
      });
      jest.spyOn(XLSX.utils, 'sheet_to_json').mockReturnValue([undefined]);

      const result = (
        service as unknown as {
          parseXlsx: (buffer: Buffer) => { headers: string[]; rows: unknown[] };
        }
      ).parseXlsx(Buffer.from('xlsx'));

      expect(result).toEqual({ headers: [], rows: [] });
    });
  });

  // ─── validate() — staff_compensation hourly type ────────────────────────

  describe('validate() — staff_compensation hourly type', () => {
    it('should accept hourly as valid compensation type', async () => {
      const csv = ['staff_number,compensation_type,amount', 'STF001,hourly,25'].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'staff_compensation' }),
      );
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
    });

    it('should accept empty compensation_type (no error on empty, only if non-empty and invalid)', async () => {
      const csv = ['staff_number,compensation_type,amount', 'STF001,,50000'].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'staff_compensation' }),
      );
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      // compensation_type is required, so it fails the required field check
      expect(summary['failed']).toBe(1);
      const errors = summary['errors'] as Array<Record<string, unknown>>;
      expect(
        errors.some(
          (e) =>
            String(e['field']) === 'compensation_type' && String(e['error']).includes('Required'),
        ),
      ).toBe(true);
    });
  });

  // ─── validate() — parents with empty email duplicate ────────────────────

  describe('validate() — parent/staff email edge cases', () => {
    it('should not add to duplicate set when email is empty', async () => {
      const csv = ['first_name,last_name,email', 'Alice,Johnson,', 'Bob,Johnson,'].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'parents' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      expect(summary['failed']).toBe(2);
      const warnings = summary['warnings_list'] as Array<Record<string, unknown>>;
      expect(warnings.filter((w) => String(w['warning']).includes('Duplicate'))).toHaveLength(0);
    });

    it('should not warn when emails are valid but different', async () => {
      const csv = [
        'first_name,last_name,email',
        'Alice,Johnson,alice@test.com',
        'Bob,Johnson,bob@test.com',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'parents' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      expect(summary['warnings']).toBe(0);
    });
  });

  // ─── validate() — student duplicate with empty dob ──────────────────────

  describe('validate() — student duplicate detection edge', () => {
    it('should detect duplicate when both dob fields are empty', async () => {
      const csv = [
        'first_name,last_name,date_of_birth,gender',
        'John,Doe,,male',
        'John,Doe,,male',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      const warnings = summary['warnings_list'] as Array<Record<string, unknown>>;
      expect(warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            warning: expect.stringContaining('duplicate'),
          }),
        ]),
      );
    });
  });

  // ─── validate() — exam_results amount edge ──────────────────────────────

  describe('validate() — exam_results valid score', () => {
    it('should accept decimal score', async () => {
      const csv = ['student_number,subject,score', 'STU001,Math,95.5'].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'exam_results' }),
      );
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
    });

    it('should not trigger number error for empty score (fails required field instead)', async () => {
      const csv = ['student_number,subject,score', 'STU001,Math,'].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'exam_results' }),
      );
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      expect(summary['failed']).toBe(1);
    });
  });

  // ─── validate() — fees valid amount ────────────────────────────────────

  describe('validate() — fees amount edge', () => {
    it('should not trigger number error for empty amount (fails required)', async () => {
      const csv = ['fee_structure_name,household_name,amount', 'Tuition,Smith Family,'].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'fees' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      const summary = getUpdateSummary();
      expect(summary['failed']).toBe(1);
    });

    it('should accept valid decimal amount', async () => {
      const csv = ['fee_structure_name,household_name,amount', 'Tuition,Smith Family,1500.50'].join(
        '\n',
      );
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'fees' }));
      mockS3.download.mockResolvedValue(csvBuffer(csv));
      mockPrisma.importJob.update.mockResolvedValue(undefined);

      await service.validate(TENANT_ID, JOB_ID);

      expect(getUpdateStatus()).toBe('validated');
    });
  });
});
