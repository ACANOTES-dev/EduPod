import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

import { ImportValidationService } from './import-validation.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const JOB_ID = 'job-uuid-1';

function csvBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8');
}

function buildMockJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: JOB_ID,
    tenant_id: TENANT_ID,
    import_type: 'students',
    status: 'uploaded',
    file_key: 'imports/test.csv',
    summary_json: {},
    ...overrides,
  };
}

describe('ImportValidationService — extra branches', () => {
  let service: ImportValidationService;
  let mockPrisma: {
    importJob: { findFirst: jest.Mock; update: jest.Mock };
  };
  let mockS3: { download: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      importJob: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    mockS3 = { download: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportValidationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<ImportValidationService>(ImportValidationService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── validate — XLSX file detection via file_key extension ──────────────
  describe('ImportValidationService — validate — xlsx extension', () => {
    it('should detect and process .xlsx files', async () => {
      // The xlsx parser requires a real XLSX buffer; we test the branch by
      // triggering the path and catching the error (invalid buffer).
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ file_key: 'imports/test.xlsx' }),
      );
      mockS3.download.mockResolvedValue(Buffer.from('not-a-real-xlsx'));

      await service.validate(TENANT_ID, JOB_ID);

      // Should have caught the XLSX parse error and written 'failed' status
      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'failed' }),
        }),
      );
    });
  });

  // ─── validate — all rows are example rows ───────────────────────────────
  describe('ImportValidationService — validate — example row filtering', () => {
    it('should fail when all rows are example rows (students with aisha/al-mansour)', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'students' }));
      const csv = 'first_name,last_name,date_of_birth,gender\naisha,al-mansour,2010-01-01,female';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({ error: expect.stringContaining('example rows') }),
              ]),
            }),
          }),
        }),
      );
    });

    it('should filter example rows with parentheses (template hints)', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'students' }));
      const csv =
        'first_name,last_name,date_of_birth,gender\naisha,(example),2010-01-01,female\nJohn,Smith,2012-05-15,male';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      // Should have processed 1 real row (John Smith), 1 filtered example row
      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      expect(summary.total_rows).toBe(1);
    });
  });

  // ─── validate — parents import type ─────────────────────────────────────
  describe('ImportValidationService — validate — parents', () => {
    it('should validate email in parent import rows', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'parents' }));
      const csv = 'first_name,last_name,email\nJohn,Doe,invalid-email';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const errors = summary.errors as Array<{ field: string; error: string }>;
      expect(errors.some((e) => e.field === 'email')).toBe(true);
    });

    it('should detect duplicate emails in parent rows', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'parents' }));
      const csv = 'first_name,last_name,email\nJohn,Doe,john@test.com\nJane,Smith,john@test.com';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const warnings = summary.warnings_list as Array<{ field: string; warning: string }>;
      expect(warnings.some((w) => w.field === 'email')).toBe(true);
    });

    it('should filter ahmed/al-mansour example row for parents', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'parents' }));
      const csv =
        'first_name,last_name,email\nahmed,al-mansour,ahmed@example.com\nJane,Smith,jane@test.com';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      expect(summary.total_rows).toBe(1);
    });
  });

  // ─── validate — staff import type ───────────────────────────────────────
  describe('ImportValidationService — validate — staff', () => {
    it('should validate email in staff import rows', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'staff' }));
      const csv = 'first_name,last_name,email\nAlice,Jones,not-an-email';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const errors = summary.errors as Array<{ field: string; error: string }>;
      expect(errors.some((e) => e.field === 'email')).toBe(true);
    });

    it('should filter sarah/johnson example row for staff', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'staff' }));
      const csv =
        'first_name,last_name,email\nsarah,johnson,sarah@example.com\nAlice,Jones,alice@test.com';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      expect(summary.total_rows).toBe(1);
    });
  });

  // ─── validate — fees import type ────────────────────────────────────────
  describe('ImportValidationService — validate — fees', () => {
    it('should error when amount is not a number', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'fees' }));
      const csv = 'fee_structure_name,household_name,amount\nTuition,Smith,abc';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const errors = summary.errors as Array<{ field: string; error: string }>;
      expect(errors.some((e) => e.field === 'amount')).toBe(true);
    });

    it('should accept valid numeric amount', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'fees' }));
      const csv = 'fee_structure_name,household_name,amount\nTuition,Smith,500.00';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      expect(data.status).toBe('validated');
    });
  });

  // ─── validate — exam_results import type ────────────────────────────────
  describe('ImportValidationService — validate — exam_results', () => {
    it('should error when score is not a number', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'exam_results' }),
      );
      const csv = 'student_number,subject,score\nSTU-001,Math,abc';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const errors = summary.errors as Array<{ field: string; error: string }>;
      expect(errors.some((e) => e.field === 'score')).toBe(true);
    });
  });

  // ─── validate — staff_compensation import type ──────────────────────────
  describe('ImportValidationService — validate — staff_compensation', () => {
    it('should validate compensation_type, amount, base_salary, per_class_rate', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'staff_compensation' }),
      );
      const csv =
        'staff_number,compensation_type,amount,base_salary,per_class_rate\nSTF-001,invalid,abc,def,ghi';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const errors = summary.errors as Array<{ field: string; error: string }>;
      expect(errors.some((e) => e.field === 'compensation_type')).toBe(true);
      expect(errors.some((e) => e.field === 'amount')).toBe(true);
      expect(errors.some((e) => e.field === 'base_salary')).toBe(true);
      expect(errors.some((e) => e.field === 'per_class_rate')).toBe(true);
    });

    it('should accept valid compensation types', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ import_type: 'staff_compensation' }),
      );
      const csv = 'staff_number,compensation_type,amount\nSTF-001,salaried,5000';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      expect(data.status).toBe('validated');
    });
  });

  // ─── validate — student row validations ─────────────────────────────────
  describe('ImportValidationService — validate — student rows', () => {
    it('should error when first_name exceeds 100 characters', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'students' }));
      const longName = 'a'.repeat(101);
      const csv = `first_name,last_name,date_of_birth,gender\n${longName},Smith,2012-05-15,male`;
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const errors = summary.errors as Array<{ field: string; error: string }>;
      expect(errors.some((e) => e.field === 'first_name')).toBe(true);
    });

    it('should error when last_name exceeds 100 characters', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'students' }));
      const longName = 'b'.repeat(101);
      const csv = `first_name,last_name,date_of_birth,gender\nJohn,${longName},2012-05-15,male`;
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const errors = summary.errors as Array<{ field: string; error: string }>;
      expect(errors.some((e) => e.field === 'last_name')).toBe(true);
    });

    it('should error on DD/MM/YYYY invalid date', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'students' }));
      const csv = 'first_name,last_name,date_of_birth,gender\nJohn,Smith,99/99/9999,male';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const errors = summary.errors as Array<{ field: string; error: string }>;
      expect(errors.some((e) => e.field === 'date_of_birth')).toBe(true);
    });

    it('should accept DD/MM/YYYY valid date', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'students' }));
      const csv = 'first_name,last_name,date_of_birth,gender\nJohn,Smith,15/05/2012,male';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      expect(data.status).toBe('validated');
    });

    it('should accept DD-MM-YYYY date format', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'students' }));
      const csv = 'first_name,last_name,date_of_birth,gender\nJohn,Smith,15-05-2012,male';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      expect(data.status).toBe('validated');
    });

    it('should error when age is out of range (too young)', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'students' }));
      const csv = 'first_name,last_name,date_of_birth,gender\nJohn,Smith,2025-01-01,male';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const errors = summary.errors as Array<{ error: string }>;
      expect(errors.some((e) => e.error.includes('age must be between'))).toBe(true);
    });

    it('should error on invalid gender', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'students' }));
      const csv = 'first_name,last_name,date_of_birth,gender\nJohn,Smith,2012-05-15,other';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const errors = summary.errors as Array<{ field: string }>;
      expect(errors.some((e) => e.field === 'gender')).toBe(true);
    });

    it('should accept m/f gender abbreviations', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'students' }));
      const csv =
        'first_name,last_name,date_of_birth,gender\nJohn,Smith,2012-05-15,m\nJane,Doe,2013-03-10,f';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      expect(data.status).toBe('validated');
    });

    it('should error on invalid parent1_email', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'students' }));
      const csv =
        'first_name,last_name,date_of_birth,gender,parent1_email\nJohn,Smith,2012-05-15,male,bad-email';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const errors = summary.errors as Array<{ field: string }>;
      expect(errors.some((e) => e.field === 'parent1_email')).toBe(true);
    });

    it('should error on invalid parent1_phone', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'students' }));
      const csv =
        'first_name,last_name,date_of_birth,gender,parent1_phone\nJohn,Smith,2012-05-15,male,abc';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const errors = summary.errors as Array<{ field: string }>;
      expect(errors.some((e) => e.field === 'parent1_phone')).toBe(true);
    });

    it('should error on invalid parent1_relationship', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'students' }));
      const csv =
        'first_name,last_name,date_of_birth,gender,parent1_relationship\nJohn,Smith,2012-05-15,male,cousin';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const errors = summary.errors as Array<{ field: string }>;
      expect(errors.some((e) => e.field === 'parent1_relationship')).toBe(true);
    });

    it('should accept valid parent1_relationship values', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'students' }));
      const csv =
        'first_name,last_name,date_of_birth,gender,parent1_relationship\nJohn,Smith,2012-05-15,male,father\nJane,Doe,2013-03-10,female,guardian';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      expect(data.status).toBe('validated');
    });

    it('should detect duplicate students (same first_name + last_name + dob)', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ import_type: 'students' }));
      const csv =
        'first_name,last_name,date_of_birth,gender\nJohn,Smith,2012-05-15,male\nJohn,Smith,2012-05-15,female';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const warnings = summary.warnings_list as Array<{ field: string }>;
      expect(warnings.some((w) => w.field === 'first_name')).toBe(true);
    });
  });

  // ─── validate — S3 download error (catch block) ────────────────────────
  describe('ImportValidationService — validate — error handling', () => {
    it('should catch and store S3 download errors', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      mockS3.download.mockRejectedValue(new Error('S3 connection timeout'));

      await service.validate(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            summary_json: expect.objectContaining({
              errors: expect.arrayContaining([
                expect.objectContaining({
                  error: expect.stringContaining('S3 connection timeout'),
                }),
              ]),
            }),
          }),
        }),
      );
    });
  });

  // ─── validate — CSV with no data rows (only headers) ───────────────────
  describe('ImportValidationService — validate — empty data', () => {
    it('should fail when only header row exists', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      const csv = 'first_name,last_name,date_of_birth,gender';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      const summary = data.summary_json as Record<string, unknown>;
      const errors = summary.errors as Array<{ error: string }>;
      expect(
        errors.some((e) => e.error.includes('no data rows') || e.error.includes('no header')),
      ).toBe(true);
    });
  });

  // ─── validate — all rows fail → status 'failed' ────────────────────────
  describe('ImportValidationService — validate — all rows fail', () => {
    it('should set status to failed when all data rows have errors', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());
      const csv = 'first_name,last_name,date_of_birth,gender\n,,2012-05-15,male\n,,,';
      mockS3.download.mockResolvedValue(csvBuffer(csv));

      await service.validate(TENANT_ID, JOB_ID);

      const updateCall = mockPrisma.importJob.update.mock.calls[0]![0] as Record<string, unknown>;
      const data = updateCall.data as Record<string, unknown>;
      expect(data.status).toBe('failed');
    });
  });
});
