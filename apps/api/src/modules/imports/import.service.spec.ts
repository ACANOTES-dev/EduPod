/* eslint-disable @typescript-eslint/no-explicit-any */
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { ImportFilterDto, ImportType } from '@school/shared';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

import { ImportProcessingService } from './import-processing.service';
import { ImportService } from './import.service';

const TENANT_ID = 'tenant-uuid-1';
const OTHER_TENANT_ID = 'tenant-uuid-2';
const USER_ID = 'user-uuid-1';
const JOB_ID = 'import-job-uuid-1';

function buildMockJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: JOB_ID,
    tenant_id: TENANT_ID,
    import_type: 'students',
    status: 'uploaded',
    file_key: `${TENANT_ID}/imports/${JOB_ID}.csv`,
    summary_json: {},
    created_by_user_id: USER_ID,
    created_at: new Date(),
    updated_at: new Date(),
    created_by: {
      id: USER_ID,
      first_name: 'Test',
      last_name: 'User',
    },
    ...overrides,
  };
}

describe('ImportService', () => {
  let service: ImportService;
  let mockPrisma: {
    importJob: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
  };
  let mockS3: {
    upload: jest.Mock;
    download: jest.Mock;
    delete: jest.Mock;
  };
  let mockQueue: {
    add: jest.Mock;
  };
  let mockImportProcessingService: {
    process: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      importJob: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
    };

    mockS3 = {
      upload: jest.fn(),
      download: jest.fn(),
      delete: jest.fn(),
    };

    mockQueue = {
      add: jest.fn(),
    };

    mockImportProcessingService = {
      process: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ImportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
        { provide: getQueueToken('imports'), useValue: mockQueue },
        { provide: ImportProcessingService, useValue: mockImportProcessingService },
      ],
    }).compile();

    service = module.get<ImportService>(ImportService);

    jest.clearAllMocks();
  });

  // ─── upload() ─────────────────────────────────────────────────────────────

  describe('upload()', () => {
    const fileBuffer = Buffer.from('first_name,last_name\nJohn,Doe');
    const fileName = 'students.csv';

    beforeEach(() => {
      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob());
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob());
      mockQueue.add.mockResolvedValue(undefined);
    });

    it('should create import_job record with status uploaded', async () => {
      await service.upload(TENANT_ID, USER_ID, fileBuffer, fileName, 'students' as any);

      expect(mockPrisma.importJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            import_type: 'students',
            status: 'uploaded',
            created_by_user_id: USER_ID,
            summary_json: {},
          }),
        }),
      );
    });

    it('should upload CSV to S3 at imports/{jobId}.csv', async () => {
      await service.upload(TENANT_ID, USER_ID, fileBuffer, fileName, 'students' as any);

      expect(mockS3.upload).toHaveBeenCalledWith(
        TENANT_ID,
        `imports/${JOB_ID}.csv`,
        fileBuffer,
        'text/csv',
      );
    });

    it('should perform inline validation and update job status after upload', async () => {
      await service.upload(TENANT_ID, USER_ID, fileBuffer, fileName, 'students' as any);

      // Inline validation runs synchronously — no queue call for validate
      expect(mockQueue.add).not.toHaveBeenCalledWith('imports:validate', expect.any(Object));
      // The job record is updated with validation results
      expect(mockPrisma.importJob.update).toHaveBeenCalled();
    });

    it('should return serialised job with created_by user', async () => {
      const result = await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        fileName,
        'students' as any,
      );

      expect(result).toEqual(
        expect.objectContaining({
          id: JOB_ID,
          tenant_id: TENANT_ID,
          created_by: expect.objectContaining({
            id: USER_ID,
            first_name: 'Test',
            last_name: 'User',
          }),
        }),
      );
    });
  });

  // ─── list() ───────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('should return paginated import jobs', async () => {
      const jobs = [buildMockJob(), buildMockJob({ id: 'job-2' })];
      mockPrisma.importJob.findMany.mockResolvedValue(jobs);
      mockPrisma.importJob.count.mockResolvedValue(2);

      const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 } as any);

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(mockPrisma.importJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
          skip: 0,
          take: 20,
          orderBy: { created_at: 'desc' },
        }),
      );
    });

    it('should filter by status when provided', async () => {
      mockPrisma.importJob.findMany.mockResolvedValue([buildMockJob({ status: 'validated' })]);
      mockPrisma.importJob.count.mockResolvedValue(1);

      await service.list(TENANT_ID, { page: 1, pageSize: 20, status: 'validated' } as any);

      expect(mockPrisma.importJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: 'validated' },
        }),
      );
    });
  });

  // ─── get() ────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('should return a single import job', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob());

      const result = await service.get(TENANT_ID, JOB_ID);

      expect(result).toEqual(expect.objectContaining({ id: JOB_ID, tenant_id: TENANT_ID }));
      expect(mockPrisma.importJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: JOB_ID, tenant_id: TENANT_ID },
        }),
      );
    });

    it('should throw IMPORT_JOB_NOT_FOUND for invalid ID', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(null);

      await expect(service.get(TENANT_ID, 'nonexistent-id')).rejects.toThrow(NotFoundException);

      await expect(service.get(TENANT_ID, 'nonexistent-id')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'IMPORT_JOB_NOT_FOUND' }),
      });
    });

    it('should throw IMPORT_JOB_NOT_FOUND for wrong tenant', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(null);

      await expect(service.get(OTHER_TENANT_ID, JOB_ID)).rejects.toThrow(NotFoundException);

      await expect(service.get(OTHER_TENANT_ID, JOB_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'IMPORT_JOB_NOT_FOUND' }),
      });
    });
  });

  // ─── confirm() ────────────────────────────────────────────────────────────

  describe('confirm()', () => {
    it('should transition validated to processing and process inline', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({
          status: 'validated',
          summary_json: { total_rows: 10, failed: 2, successful: 8, warnings: 0 },
        }),
      );
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'processing' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'processing' }));

      const result = await service.confirm(TENANT_ID, JOB_ID);

      expect(result.status).toBe('processing');
      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: JOB_ID },
          data: { status: 'processing' },
        }),
      );
      // Inline processing — no queue enqueue, but ImportProcessingService.process is called
      expect(mockImportProcessingService.process).toHaveBeenCalledWith(TENANT_ID, JOB_ID);
    });

    it('should throw INVALID_IMPORT_STATUS when not validated', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ status: 'uploaded' }));

      await expect(service.confirm(TENANT_ID, JOB_ID)).rejects.toThrow(BadRequestException);

      await expect(service.confirm(TENANT_ID, JOB_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_IMPORT_STATUS' }),
      });
    });

    it('should throw INVALID_IMPORT_STATUS when already processing', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ status: 'processing' }));

      await expect(service.confirm(TENANT_ID, JOB_ID)).rejects.toThrow(BadRequestException);

      await expect(service.confirm(TENANT_ID, JOB_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_IMPORT_STATUS' }),
      });
    });

    it('should throw ALL_ROWS_FAILED when failed equals total_rows', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({
          status: 'validated',
          summary_json: { total_rows: 5, failed: 5, successful: 0, warnings: 0 },
        }),
      );

      await expect(service.confirm(TENANT_ID, JOB_ID)).rejects.toThrow(BadRequestException);

      await expect(service.confirm(TENANT_ID, JOB_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ALL_ROWS_FAILED' }),
      });
    });

    it('should allow confirm when some rows passed', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({
          status: 'validated',
          summary_json: { total_rows: 10, failed: 3, successful: 7, warnings: 1 },
        }),
      );
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'processing' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'processing' }));
      mockQueue.add.mockResolvedValue(undefined);

      const result = await service.confirm(TENANT_ID, JOB_ID);

      expect(result.status).toBe('processing');
      expect(mockImportProcessingService.process).toHaveBeenCalledWith(TENANT_ID, JOB_ID);
    });

    it('edge: should handle summary_json with missing fields gracefully', async () => {
      // summary_json is an empty object — total_rows and failed default to 0
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({
          status: 'validated',
          summary_json: {},
        }),
      );
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'processing' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'processing' }));
      mockQueue.add.mockResolvedValue(undefined);

      // totalRows=0, failedRows=0 => the guard (totalRows > 0 && failed >= total) is false => proceeds
      const result = await service.confirm(TENANT_ID, JOB_ID);

      expect(result.status).toBe('processing');
    });
  });

  // ──�� rollback() ──────────────────────────────────────────────────────────

  describe('rollback()', () => {
    it('should throw IMPORT_JOB_NOT_FOUND when job does not exist', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(null);

      await expect(service.rollback(TENANT_ID, JOB_ID)).rejects.toThrow(NotFoundException);
      await expect(service.rollback(TENANT_ID, JOB_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'IMPORT_JOB_NOT_FOUND' }),
      });
    });

    it('should throw INVALID_IMPORT_STATUS when job status is not completed', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ status: 'validated' }));

      await expect(service.rollback(TENANT_ID, JOB_ID)).rejects.toThrow(BadRequestException);
      await expect(service.rollback(TENANT_ID, JOB_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_IMPORT_STATUS' }),
      });
    });

    it('should throw INVALID_IMPORT_STATUS when status is processing', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ status: 'processing' }));

      await expect(service.rollback(TENANT_ID, JOB_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── confirm() — processing error handling ──────────────────────────────

  describe('confirm() — processing error handling', () => {
    it('should catch processing errors and update job to failed', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({
          status: 'validated',
          summary_json: { total_rows: 5, failed: 0 },
        }),
      );
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'processing' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      mockImportProcessingService.process.mockRejectedValue(new Error('Processing boom'));

      const result = await service.confirm(TENANT_ID, JOB_ID);

      // The second update call is the error handler setting failed
      expect(mockPrisma.importJob.update).toHaveBeenCalledTimes(2);
      expect(result.status).toBe('failed');
    });

    it('should throw IMPORT_JOB_NOT_FOUND when job not found on confirm', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(null);

      await expect(service.confirm(TENANT_ID, JOB_ID)).rejects.toThrow(NotFoundException);
      await expect(service.confirm(TENANT_ID, JOB_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'IMPORT_JOB_NOT_FOUND' }),
      });
    });

    it('edge: should use fallback job when findUnique returns null after confirm', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({
          status: 'validated',
          summary_json: { total_rows: 5, failed: 0 },
        }),
      );
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'processing' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(null);

      const result = await service.confirm(TENANT_ID, JOB_ID);

      expect(result).toEqual(expect.objectContaining({ id: JOB_ID }));
    });

    it('edge: should handle non-number total_rows and failed in summary_json', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({
          status: 'validated',
          summary_json: { total_rows: 'not-a-number', failed: 'nope' },
        }),
      );
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'processing' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'processing' }));

      const result = await service.confirm(TENANT_ID, JOB_ID);

      expect(result.status).toBe('processing');
    });
  });

  // ─── upload() — XLSX file ────────────────────────────────────────────────

  describe('upload() — XLSX file', () => {
    it('should upload XLSX file with correct mime type', async () => {
      const fileBuffer = Buffer.from('first_name,last_name\nJohn,Doe');
      const fileName = 'students.xlsx';

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.xlsx`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob());
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob());

      await service.upload(TENANT_ID, USER_ID, fileBuffer, fileName, 'students' as ImportType);

      expect(mockS3.upload).toHaveBeenCalledWith(
        TENANT_ID,
        `imports/${JOB_ID}.xlsx`,
        fileBuffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
    });
  });

  // ─── upload() — validation edge cases ────────────────────────────────────

  describe('upload() — validation edge cases', () => {
    it('should handle non-students import type without date validation', async () => {
      const csv = 'first_name,last_name,email\nJohn,Doe,john@test.com';
      const fileBuffer = Buffer.from(csv);
      const fileName = 'parents.csv';

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'validated' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'validated' }));

      const result = await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        fileName,
        'parents' as ImportType,
      );

      expect(result).toBeDefined();
    });

    it('should handle empty data rows after filtering example rows', async () => {
      const csv = 'first_name,last_name,date_of_birth\nAisha,Al-Mansour,2015-01-01';
      const fileBuffer = Buffer.from(csv);
      const fileName = 'students.csv';

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'failed' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      await service.upload(TENANT_ID, USER_ID, fileBuffer, fileName, 'students' as ImportType);

      expect(mockPrisma.importJob.update).toHaveBeenCalled();
    });

    it('should detect missing required fields in data rows', async () => {
      const csv = 'first_name,last_name,date_of_birth\n,Doe,2010-01-01';
      const fileBuffer = Buffer.from(csv);
      const fileName = 'students.csv';

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'failed' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      await service.upload(TENANT_ID, USER_ID, fileBuffer, fileName, 'students' as ImportType);

      expect(mockPrisma.importJob.update).toHaveBeenCalled();
    });

    it('should validate date_of_birth format for students', async () => {
      const csv = 'first_name,last_name,date_of_birth\nJohn,Doe,not-a-date';
      const fileBuffer = Buffer.from(csv);
      const fileName = 'students.csv';

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'failed' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      await service.upload(TENANT_ID, USER_ID, fileBuffer, fileName, 'students' as ImportType);

      expect(mockPrisma.importJob.update).toHaveBeenCalled();
    });

    it('edge: should catch validation error and try to update job to failed', async () => {
      const fileBuffer = Buffer.from('first_name,last_name\nJohn,Doe');
      const fileName = 'students.csv';

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      // First update for file_key works, second (validation) throws, error handler update also resolves
      let updateCallCount = 0;
      mockPrisma.importJob.update.mockImplementation(() => {
        updateCallCount++;
        if (updateCallCount === 2) {
          return Promise.reject(new Error('DB error during validation'));
        }
        return Promise.resolve(buildMockJob({ status: 'failed' }));
      });
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      const result = await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        fileName,
        'students' as ImportType,
      );

      expect(result).toBeDefined();
    });

    it('edge: should use fallback job when findUnique returns null after upload', async () => {
      const csv = 'first_name,last_name,date_of_birth\nJohn,Doe,2010-01-01';
      const fileBuffer = Buffer.from(csv);
      const fileName = 'students.csv';

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob());
      mockPrisma.importJob.findUnique.mockResolvedValue(null);

      const result = await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        fileName,
        'students' as ImportType,
      );

      expect(result).toEqual(expect.objectContaining({ id: JOB_ID }));
    });
  });

  // ─── upload() — buildPreview branches ─────────────────────────────────────

  describe('upload() — buildPreview for students', () => {
    it('should build preview with year_group, gender, and household_count', async () => {
      const csv =
        'first_name,last_name,date_of_birth,year_group,gender,parent1_email\nJohn,Doe,2010-01-01,Year 1,male,parent@test.com';
      const fileBuffer = Buffer.from(csv);
      const fileName = 'students.csv';

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'validated' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'validated' }));

      await service.upload(TENANT_ID, USER_ID, fileBuffer, fileName, 'students' as ImportType);

      const updateCalls = mockPrisma.importJob.update.mock.calls;
      const callWithPreview = updateCalls.find(
        (call: Array<Record<string, Record<string, unknown>>>) =>
          call[0]?.data?.preview_json !== undefined,
      );
      expect(callWithPreview).toBeDefined();
    });
  });

  // ─── serializeJob branches ────────────────────────────────────────────────

  describe('serializeJob — serialisation', () => {
    it('should serialize job with header_errors and row_errors', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({
          summary_json: {
            total_rows: 5,
            valid_rows: 3,
            invalid_rows: 2,
            header_errors: ['Missing: gender'],
            row_errors: [
              { row: 2, errors: ['Missing required field "first_name"'] },
              { row: 3, errors: ['Invalid date format', 'Missing required field "last_name"'] },
            ],
          },
        }),
      );

      const result = await service.get(TENANT_ID, JOB_ID);

      expect(result.total_rows).toBe(5);
      expect(result.valid_rows).toBe(3);
      expect(result.invalid_rows).toBe(2);
      const errors = result.errors as Array<{ row: number; field: string; message: string }>;
      expect(errors.length).toBe(4);
      expect(errors[0]).toEqual({ row: 0, field: '', message: 'Missing: gender' });
      expect(errors[1]).toEqual({
        row: 2,
        field: '',
        message: 'Missing required field "first_name"',
      });
    });

    it('should serialize job with null summary_json', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ summary_json: null }));

      const result = await service.get(TENANT_ID, JOB_ID);

      expect(result.total_rows).toBeNull();
      expect(result.valid_rows).toBeNull();
      expect(result.invalid_rows).toBeNull();
      expect(result.errors).toEqual([]);
    });

    it('should serialize job with empty summary_json', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildMockJob({ summary_json: {} }));

      const result = await service.get(TENANT_ID, JOB_ID);

      expect(result.total_rows).toBeNull();
      expect(result.errors).toEqual([]);
    });
  });

  // ─── list() — pagination ─────────────────────────────────────────────────

  describe('list() — pagination', () => {
    it('should calculate skip correctly for page > 1', async () => {
      mockPrisma.importJob.findMany.mockResolvedValue([]);
      mockPrisma.importJob.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 3, pageSize: 10 } as ImportFilterDto);

      expect(mockPrisma.importJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
    });
  });
});
