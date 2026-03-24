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
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'parents' }),
      );
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
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'parents' }),
      );
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
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'parents' }),
      );
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
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'parents' }),
      );
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
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'staff' }),
      );
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
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'staff' }),
      );
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
      const csv = [
        'fee_structure_name,household_name,amount',
        'Tuition,Johnson Family,5000',
      ].join('\n');
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'fees' }),
      );
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
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'fees' }),
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
            error: expect.stringContaining('number'),
          }),
        ]),
      );
    });
  });

  // ─── validate() — exam_results ────────────────────────────────────────────

  describe('validate() — exam_results', () => {
    it('should validate correct exam_results CSV', async () => {
      const csv = [
        'student_number,subject,score,grade',
        'STU001,Math,95,A',
      ].join('\n');
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
      const csv = [
        'student_number,subject,score,grade',
        'STU001,Math,excellent,A',
      ].join('\n');
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
      const csv = [
        'staff_number,compensation_type,amount',
        'STF001,salaried,50000',
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
    });

    it('should fail row with invalid compensation_type -> "compensation_type must be one of: salaried, per_class, hourly"', async () => {
      const csv = [
        'staff_number,compensation_type,amount',
        'STF001,monthly,50000',
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
            field: 'compensation_type',
            error: 'compensation_type must be one of: salaried, per_class, hourly',
          }),
        ]),
      );
    });

    it('should fail row when amount is not a number', async () => {
      const csv = [
        'staff_number,compensation_type,amount',
        'STF001,salaried,not_num',
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
            field: 'amount',
            error: 'amount must be a valid number',
          }),
        ]),
      );
    });

    it('should validate per_class compensation type', async () => {
      const csv = [
        'staff_number,compensation_type,amount',
        'STF001,per_class,100',
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
      const csv = 'first_name,last_name,student_number,date_of_birth,year_group_name,gender,nationality';
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
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ file_key: null }),
      );

      await service.validate(TENANT_ID, JOB_ID);

      // Should not attempt S3 download or update the job
      expect(mockS3.download).not.toHaveBeenCalled();
      expect(mockPrisma.importJob.update).not.toHaveBeenCalled();
    });
  });
});
