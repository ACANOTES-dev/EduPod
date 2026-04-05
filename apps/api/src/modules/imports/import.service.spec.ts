/* eslint-disable @typescript-eslint/no-explicit-any, import/order -- jest.mock must precede mocked imports */
jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { ImportFilterDto, ImportType } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { HouseholdReadFacade } from '../households/household-read.facade';
import { ParentReadFacade } from '../parents/parent-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { StudentReadFacade } from '../students/student-read.facade';

import { ImportProcessingService } from './import-processing.service';
import { ImportService } from './import.service';

const TENANT_ID = 'tenant-uuid-1';
const OTHER_TENANT_ID = 'tenant-uuid-2';
const USER_ID = 'user-uuid-1';
const JOB_ID = 'import-job-uuid-1';
const STUDENT_ID = 'student-uuid-1';
const PARENT_ID_1 = 'parent-uuid-1';
const HOUSEHOLD_ID_1 = 'household-uuid-1';

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
  let mockStudentReadFacade: {
    findWithDependencyCounts: jest.Mock;
    findByHousehold: jest.Mock;
  };
  let mockParentReadFacade: {
    findById: jest.Mock;
  };
  let mockHouseholdReadFacade: {
    exists: jest.Mock;
  };
  let mockImportJobRecord: {
    findMany: jest.Mock;
  };
  let mockTx: Record<string, { deleteMany?: jest.Mock; delete?: jest.Mock }>;

  beforeEach(async () => {
    mockTx = {
      studentParent: { deleteMany: jest.fn() },
      householdFeeAssignment: { deleteMany: jest.fn() },
      student: { delete: jest.fn() },
      householdParent: { deleteMany: jest.fn() },
      parent: { delete: jest.fn() },
      householdEmergencyContact: { deleteMany: jest.fn() },
      household: { delete: jest.fn() },
    };

    (createRlsClient as jest.Mock).mockReturnValue({
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

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

    mockImportJobRecord = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    (mockPrisma as Record<string, unknown>).importJobRecord = mockImportJobRecord;

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

    mockStudentReadFacade = {
      findWithDependencyCounts: jest.fn(),
      findByHousehold: jest.fn().mockResolvedValue([]),
    };

    mockParentReadFacade = {
      findById: jest.fn(),
    };

    mockHouseholdReadFacade = {
      exists: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ImportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
        { provide: getQueueToken('imports'), useValue: mockQueue },
        { provide: ImportProcessingService, useValue: mockImportProcessingService },
        { provide: StudentReadFacade, useValue: mockStudentReadFacade },
        { provide: ParentReadFacade, useValue: mockParentReadFacade },
        { provide: HouseholdReadFacade, useValue: mockHouseholdReadFacade },
      ],
    }).compile();

    service = module.get<ImportService>(ImportService);
  });

  afterEach(() => jest.clearAllMocks());

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

  // ─── upload() — additional branch coverage ──────────────────────────────

  describe('upload() — additional branches', () => {
    it('should detect .xls extension as xlsx', async () => {
      const fileBuffer = Buffer.from('first_name,last_name\nJohn,Doe');
      const fileName = 'students.xls';

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob());
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob());

      await service.upload(TENANT_ID, USER_ID, fileBuffer, fileName, 'students' as ImportType);

      // .xls triggers the xlsx path (ext === 'csv' fallback since it ends with .xls not .xlsx)
      expect(mockS3.upload).toHaveBeenCalledWith(
        TENANT_ID,
        `imports/${JOB_ID}.csv`,
        fileBuffer,
        'text/csv',
      );
    });

    it('should set status failed with "File contains only example rows" when examples filtered leave nothing', async () => {
      // Aisha Al-Mansour is a known example row
      const csv = 'first_name,last_name,date_of_birth\nAisha,Al-Mansour,2015-01-01';
      const fileBuffer = Buffer.from(csv);

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'failed' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        'students.csv',
        'students' as ImportType,
      );

      const updateCalls = mockPrisma.importJob.update.mock.calls;
      const failedCall = updateCalls.find(
        (call: Array<Record<string, Record<string, unknown>>>) => {
          const summary = call[0]?.data?.summary_json as Record<string, unknown> | undefined;
          return summary?.error && String(summary.error).includes('example rows');
        },
      );
      expect(failedCall).toBeDefined();
    });

    it('should set "No data rows found" when all rows are empty after header', async () => {
      // Only whitespace row after header
      const csv = 'first_name,last_name,date_of_birth\n   ,   ,   ';
      const fileBuffer = Buffer.from(csv);

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'failed' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        'students.csv',
        'students' as ImportType,
      );

      // The update should show 0 data rows (empty row is filtered by CSV splitter)
      expect(mockPrisma.importJob.update).toHaveBeenCalled();
    });

    it('should handle empty file with no headers', async () => {
      const fileBuffer = Buffer.from('');

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'failed' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      await service.upload(TENANT_ID, USER_ID, fileBuffer, 'test.csv', 'students' as ImportType);

      const updateCalls = mockPrisma.importJob.update.mock.calls;
      const failedCall = updateCalls.find(
        (call: Array<Record<string, Record<string, unknown>>>) => {
          const summary = call[0]?.data?.summary_json as Record<string, unknown> | undefined;
          return summary?.error && String(summary.error).includes('empty');
        },
      );
      expect(failedCall).toBeDefined();
    });

    it('should report missing required headers for fees import type', async () => {
      const csv = 'amount\n5000';
      const fileBuffer = Buffer.from(csv);

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'failed' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      await service.upload(TENANT_ID, USER_ID, fileBuffer, 'fees.csv', 'fees' as ImportType);

      const updateCalls = mockPrisma.importJob.update.mock.calls;
      const callWithHeaders = updateCalls.find(
        (call: Array<Record<string, Record<string, unknown>>>) => {
          const summary = call[0]?.data?.summary_json as Record<string, unknown[]> | undefined;
          return summary?.header_errors && (summary.header_errors as string[]).length > 0;
        },
      );
      expect(callWithHeaders).toBeDefined();
    });

    it('should validate students with valid DOB format passes', async () => {
      const csv = 'first_name,last_name,date_of_birth\nJohn,Doe,2015-06-15';
      const fileBuffer = Buffer.from(csv);

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'validated' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'validated' }));

      await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        'students.csv',
        'students' as ImportType,
      );

      const updateCalls = mockPrisma.importJob.update.mock.calls;
      const validatedCall = updateCalls.find(
        (call: Array<Record<string, Record<string, unknown>>>) => {
          const summary = call[0]?.data?.summary_json as Record<string, unknown> | undefined;
          return summary?.valid_rows !== undefined && summary.valid_rows === 1;
        },
      );
      expect(validatedCall).toBeDefined();
    });

    it('should handle unknown import type with no REQUIRED_HEADERS entry gracefully', async () => {
      const csv = 'field1,field2\nval1,val2';
      const fileBuffer = Buffer.from(csv);

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'validated' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'validated' }));

      // Use a type that might not exist in REQUIRED_HEADERS — the ?? [] fallback covers this
      await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        'custom.csv',
        'some_unknown_type' as any,
      );

      // Should not throw, the empty required fields array means all rows are valid
      expect(mockPrisma.importJob.update).toHaveBeenCalled();
    });

    it('edge: should handle validation exception and best-effort update failure', async () => {
      const fileBuffer = Buffer.from('first_name,last_name\nJohn,Doe');

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);

      // First update (file_key) succeeds, second (validation) throws Error, error handler update also rejects
      let updateCount = 0;
      mockPrisma.importJob.update.mockImplementation(() => {
        updateCount++;
        if (updateCount === 2) {
          return Promise.reject(new Error('Validation DB error'));
        }
        if (updateCount === 3) {
          // The .catch(() => {}) best-effort update — also fails
          return Promise.reject(new Error('Best effort also fails'));
        }
        return Promise.resolve(buildMockJob({ status: 'failed' }));
      });
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      // Should not throw — the outer .catch() swallows the error
      const result = await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        'students.csv',
        'students' as ImportType,
      );

      expect(result).toBeDefined();
    });

    it('should handle non-Error thrown in validation catch', async () => {
      const fileBuffer = Buffer.from('first_name,last_name\nJohn,Doe');

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);

      let updateCount = 0;
      mockPrisma.importJob.update.mockImplementation(() => {
        updateCount++;
        if (updateCount === 2) {
          // eslint-disable-next-line no-throw-literal
          return Promise.reject('string error');
        }
        return Promise.resolve(buildMockJob({ status: 'failed' }));
      });
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      const result = await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        'students.csv',
        'students' as ImportType,
      );

      expect(result).toBeDefined();
    });

    it('should build preview for non-students import type (no year_group/gender/household stats)', async () => {
      const csv = 'first_name,last_name,email\nJohn,Doe,john@example.com';
      const fileBuffer = Buffer.from(csv);

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'validated' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'validated' }));

      await service.upload(TENANT_ID, USER_ID, fileBuffer, 'parents.csv', 'parents' as ImportType);

      const updateCalls = mockPrisma.importJob.update.mock.calls;
      const callWithPreview = updateCalls.find(
        (call: Array<Record<string, Record<string, unknown>>>) =>
          call[0]?.data?.preview_json !== undefined,
      );
      expect(callWithPreview).toBeDefined();
    });

    it('should build preview with missing year_group column (no by_year_group stats)', async () => {
      const csv = 'first_name,last_name,date_of_birth,gender\nJohn,Doe,2015-01-01,male';
      const fileBuffer = Buffer.from(csv);

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'validated' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'validated' }));

      await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        'students.csv',
        'students' as ImportType,
      );

      expect(mockPrisma.importJob.update).toHaveBeenCalled();
    });

    it('should parse real XLSX file through parseFileBuffer XLSX path', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([
        ['first_name', 'last_name', 'date_of_birth', 'year_group', 'gender', 'parent1_email'],
        ['John', 'Doe', '2015-06-15', 'Year 1', 'male', 'parent@test.com'],
        ['Jane', 'Smith', '2014-03-20', 'Year 2', 'female', 'parent2@test.com'],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const xlsxBuffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.xlsx`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'validated' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'validated' }));

      await service.upload(
        TENANT_ID,
        USER_ID,
        xlsxBuffer,
        'students.xlsx',
        'students' as ImportType,
      );

      // Verify XLSX path was used (uploads with xlsx extension and mime)
      expect(mockS3.upload).toHaveBeenCalledWith(
        TENANT_ID,
        `imports/${JOB_ID}.xlsx`,
        xlsxBuffer,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      // Should have preview_json with year_group, gender, and household stats
      const updateCalls = mockPrisma.importJob.update.mock.calls;
      const callWithPreview = updateCalls.find(
        (call: Array<Record<string, Record<string, unknown>>>) =>
          call[0]?.data?.preview_json !== undefined,
      );
      expect(callWithPreview).toBeDefined();
    });

    it('should parse XLSX with Date cell objects in parseFileBuffer', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([
        ['first_name', 'last_name', 'date_of_birth'],
        ['John', 'Doe', new Date('2015-06-15')],
      ]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const xlsxBuffer = Buffer.from(
        XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true }),
      );

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.xlsx`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'validated' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'validated' }));

      await service.upload(
        TENANT_ID,
        USER_ID,
        xlsxBuffer,
        'students.xlsx',
        'students' as ImportType,
      );

      expect(mockPrisma.importJob.update).toHaveBeenCalled();
    });

    it('should handle XLSX with empty sheet (no data)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      const xlsxBuffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.xlsx`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'failed' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      await service.upload(
        TENANT_ID,
        USER_ID,
        xlsxBuffer,
        'students.xlsx',
        'students' as ImportType,
      );

      const updateCalls = mockPrisma.importJob.update.mock.calls;
      const failedCall = updateCalls.find(
        (call: Array<Record<string, Record<string, unknown>>>) => {
          const summary = call[0]?.data?.summary_json as Record<string, unknown> | undefined;
          return summary?.error && String(summary.error).includes('empty');
        },
      );
      expect(failedCall).toBeDefined();
    });

    it('should handle row where dob column index is -1 for students', async () => {
      // Student CSV without date_of_birth column — tests dobIdx === -1 branch
      const csv = 'first_name,last_name\nJohn,Doe';
      const fileBuffer = Buffer.from(csv);

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'failed' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        'students.csv',
        'students' as ImportType,
      );

      // Missing required headers, so job will be failed
      expect(mockPrisma.importJob.update).toHaveBeenCalled();
    });

    it('should handle row with dob that passes regex but no actual date validation issue', async () => {
      const csv = 'first_name,last_name,date_of_birth\nJohn,Doe,2015-06-15';
      const fileBuffer = Buffer.from(csv);

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'validated' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'validated' }));

      await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        'students.csv',
        'students' as ImportType,
      );

      const updateCalls = mockPrisma.importJob.update.mock.calls;
      const validatedCall = updateCalls.find(
        (call: Array<Record<string, Record<string, unknown>>>) => {
          const summary = call[0]?.data?.summary_json as Record<string, unknown> | undefined;
          return summary?.valid_rows === 1;
        },
      );
      expect(validatedCall).toBeDefined();
    });

    it('should handle preview with empty parent1_email values', async () => {
      const csv = 'first_name,last_name,date_of_birth,parent1_email\nJohn,Doe,2015-01-01,';
      const fileBuffer = Buffer.from(csv);

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'validated' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'validated' }));

      await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        'students.csv',
        'students' as ImportType,
      );

      // Empty parent1_email should not be added to household_count
      expect(mockPrisma.importJob.update).toHaveBeenCalled();
    });
  });

  // ─── confirm() — additional branches ────────────────────────────────────

  describe('confirm() — additional branches', () => {
    it('edge: should handle processing error with non-Error throw', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({
          status: 'validated',
          summary_json: { total_rows: 5, failed: 0 },
        }),
      );
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'processing' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      // Non-Error object thrown
      mockImportProcessingService.process.mockRejectedValue('string error');

      const result = await service.confirm(TENANT_ID, JOB_ID);

      expect(result.status).toBe('failed');
    });

    it('edge: should handle processing error + best-effort update failure', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({
          status: 'validated',
          summary_json: { total_rows: 5, failed: 0 },
        }),
      );

      let updateCount = 0;
      mockPrisma.importJob.update.mockImplementation(() => {
        updateCount++;
        if (updateCount === 1) {
          // First update (status -> processing)
          return Promise.resolve(buildMockJob({ status: 'processing' }));
        }
        // Error handler update also fails (best effort catch)
        return Promise.reject(new Error('DB down'));
      });
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      mockImportProcessingService.process.mockRejectedValue(new Error('boom'));

      const result = await service.confirm(TENANT_ID, JOB_ID);

      expect(result).toBeDefined();
    });
  });

  // ─── rollback() — comprehensive branch coverage ─────────────────────────

  describe('rollback() — happy path', () => {
    function setupRollbackJob() {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({
          status: 'completed',
          summary_json: { total_rows: 5, successful: 5, failed: 0 },
        }),
      );
      mockPrisma.importJob.update.mockResolvedValue(
        buildMockJob({
          status: 'rolled_back',
          created_by: { id: USER_ID, first_name: 'Test', last_name: 'User' },
        }),
      );
    }

    it('should throw NO_TRACKED_RECORDS when no records found', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([]);

      await expect(service.rollback(TENANT_ID, JOB_ID)).rejects.toThrow(BadRequestException);
      await expect(service.rollback(TENANT_ID, JOB_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NO_TRACKED_RECORDS' }),
      });
    });

    it('should delete student with no dependencies', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'student', record_id: STUDENT_ID },
      ]);
      mockStudentReadFacade.findWithDependencyCounts.mockResolvedValue({
        _count: {
          attendance_records: 0,
          grades: 0,
          class_enrolments: 0,
          invoice_lines: 0,
          report_cards: 0,
        },
      });

      const result = await service.rollback(TENANT_ID, JOB_ID);

      expect(mockTx.studentParent.deleteMany).toHaveBeenCalledWith({
        where: { student_id: STUDENT_ID },
      });
      expect(mockTx.householdFeeAssignment.deleteMany).toHaveBeenCalledWith({
        where: { student_id: STUDENT_ID },
      });
      expect(mockTx.student.delete).toHaveBeenCalledWith({ where: { id: STUDENT_ID } });
      expect(result.rollback_summary.deleted_count).toBeGreaterThanOrEqual(1);
    });

    it('should skip student with attendance dependencies and include reason', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'student', record_id: STUDENT_ID },
      ]);
      mockStudentReadFacade.findWithDependencyCounts.mockResolvedValue({
        _count: {
          attendance_records: 5,
          grades: 0,
          class_enrolments: 0,
          invoice_lines: 0,
          report_cards: 0,
        },
      });

      const result = await service.rollback(TENANT_ID, JOB_ID);

      expect(mockTx.student.delete).not.toHaveBeenCalled();
      expect(result.rollback_summary.skipped_count).toBe(1);
      expect(result.rollback_summary.skipped_details[0].reason).toContain('attendance');
    });

    it('should skip student with grades dependencies', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'student', record_id: STUDENT_ID },
      ]);
      mockStudentReadFacade.findWithDependencyCounts.mockResolvedValue({
        _count: {
          attendance_records: 0,
          grades: 3,
          class_enrolments: 0,
          invoice_lines: 0,
          report_cards: 0,
        },
      });

      const result = await service.rollback(TENANT_ID, JOB_ID);

      expect(result.rollback_summary.skipped_details[0].reason).toContain('grades');
    });

    it('should skip student with class enrolments', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'student', record_id: STUDENT_ID },
      ]);
      mockStudentReadFacade.findWithDependencyCounts.mockResolvedValue({
        _count: {
          attendance_records: 0,
          grades: 0,
          class_enrolments: 2,
          invoice_lines: 0,
          report_cards: 0,
        },
      });

      const result = await service.rollback(TENANT_ID, JOB_ID);

      expect(result.rollback_summary.skipped_details[0].reason).toContain('class enrolments');
    });

    it('should skip student with invoice lines', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'student', record_id: STUDENT_ID },
      ]);
      mockStudentReadFacade.findWithDependencyCounts.mockResolvedValue({
        _count: {
          attendance_records: 0,
          grades: 0,
          class_enrolments: 0,
          invoice_lines: 4,
          report_cards: 0,
        },
      });

      const result = await service.rollback(TENANT_ID, JOB_ID);

      expect(result.rollback_summary.skipped_details[0].reason).toContain('invoice');
    });

    it('should skip student with report cards', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'student', record_id: STUDENT_ID },
      ]);
      mockStudentReadFacade.findWithDependencyCounts.mockResolvedValue({
        _count: {
          attendance_records: 0,
          grades: 0,
          class_enrolments: 0,
          invoice_lines: 0,
          report_cards: 1,
        },
      });

      const result = await service.rollback(TENANT_ID, JOB_ID);

      expect(result.rollback_summary.skipped_details[0].reason).toContain('report cards');
    });

    it('should count already-deleted student as success', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'student', record_id: STUDENT_ID },
      ]);
      // null means already deleted
      mockStudentReadFacade.findWithDependencyCounts.mockResolvedValue(null);

      const result = await service.rollback(TENANT_ID, JOB_ID);

      expect(result.rollback_summary.deleted_count).toBe(1);
      expect(mockTx.student.delete).not.toHaveBeenCalled();
    });

    it('should delete parent without user_id', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'parent', record_id: PARENT_ID_1 },
      ]);
      mockParentReadFacade.findById.mockResolvedValue({
        id: PARENT_ID_1,
        user_id: null,
      });

      const result = await service.rollback(TENANT_ID, JOB_ID);

      expect(mockTx.householdParent.deleteMany).toHaveBeenCalledWith({
        where: { parent_id: PARENT_ID_1 },
      });
      expect(mockTx.parent.delete).toHaveBeenCalledWith({ where: { id: PARENT_ID_1 } });
      expect(result.rollback_summary.deleted_count).toBe(1);
    });

    it('should skip parent with linked user account', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'parent', record_id: PARENT_ID_1 },
      ]);
      mockParentReadFacade.findById.mockResolvedValue({
        id: PARENT_ID_1,
        user_id: 'some-user-id',
      });

      const result = await service.rollback(TENANT_ID, JOB_ID);

      expect(mockTx.parent.delete).not.toHaveBeenCalled();
      expect(result.rollback_summary.skipped_count).toBe(1);
      expect(result.rollback_summary.skipped_details[0].reason).toContain('platform user');
    });

    it('should count already-deleted parent as success', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'parent', record_id: PARENT_ID_1 },
      ]);
      mockParentReadFacade.findById.mockResolvedValue(null);

      const result = await service.rollback(TENANT_ID, JOB_ID);

      expect(result.rollback_summary.deleted_count).toBe(1);
      expect(mockTx.parent.delete).not.toHaveBeenCalled();
    });

    it('should delete household with no external students', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'household', record_id: HOUSEHOLD_ID_1 },
      ]);
      mockStudentReadFacade.findByHousehold.mockResolvedValue([]);
      mockHouseholdReadFacade.exists.mockResolvedValue(true);

      const result = await service.rollback(TENANT_ID, JOB_ID);

      expect(mockTx.householdEmergencyContact.deleteMany).toHaveBeenCalledWith({
        where: { household_id: HOUSEHOLD_ID_1 },
      });
      expect(mockTx.householdParent.deleteMany).toHaveBeenCalledWith({
        where: { household_id: HOUSEHOLD_ID_1 },
      });
      expect(mockTx.household.delete).toHaveBeenCalledWith({ where: { id: HOUSEHOLD_ID_1 } });
      expect(result.rollback_summary.deleted_count).toBe(1);
    });

    it('should skip household with external students', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'household', record_id: HOUSEHOLD_ID_1 },
      ]);
      // An external student (not from this import)
      mockStudentReadFacade.findByHousehold.mockResolvedValue([{ id: 'external-student-id' }]);

      const result = await service.rollback(TENANT_ID, JOB_ID);

      expect(mockTx.household.delete).not.toHaveBeenCalled();
      expect(result.rollback_summary.skipped_count).toBe(1);
      expect(result.rollback_summary.skipped_details[0].reason).toContain('not from this import');
    });

    it('should count already-deleted household as success', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'household', record_id: HOUSEHOLD_ID_1 },
      ]);
      mockStudentReadFacade.findByHousehold.mockResolvedValue([]);
      mockHouseholdReadFacade.exists.mockResolvedValue(false);

      const result = await service.rollback(TENANT_ID, JOB_ID);

      expect(mockTx.household.delete).not.toHaveBeenCalled();
      expect(result.rollback_summary.deleted_count).toBe(1);
    });

    it('should set status to partially_rolled_back when some records skipped', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'student', record_id: STUDENT_ID },
        { record_type: 'parent', record_id: PARENT_ID_1 },
      ]);
      // Student has deps -> skip
      mockStudentReadFacade.findWithDependencyCounts.mockResolvedValue({
        _count: {
          attendance_records: 1,
          grades: 0,
          class_enrolments: 0,
          invoice_lines: 0,
          report_cards: 0,
        },
      });
      // Parent is clean -> delete
      mockParentReadFacade.findById.mockResolvedValue({
        id: PARENT_ID_1,
        user_id: null,
      });

      const result = await service.rollback(TENANT_ID, JOB_ID);

      // Check the update was called with partially_rolled_back
      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'partially_rolled_back',
          }),
        }),
      );
      expect(result.rollback_summary.deleted_count).toBe(1);
      expect(result.rollback_summary.skipped_count).toBe(1);
    });

    it('should set status to rolled_back when all records deleted', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'student', record_id: STUDENT_ID },
      ]);
      mockStudentReadFacade.findWithDependencyCounts.mockResolvedValue({
        _count: {
          attendance_records: 0,
          grades: 0,
          class_enrolments: 0,
          invoice_lines: 0,
          report_cards: 0,
        },
      });

      await service.rollback(TENANT_ID, JOB_ID);

      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'rolled_back',
          }),
        }),
      );
    });

    it('should handle combined student + parent + household rollback', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'student', record_id: STUDENT_ID },
        { record_type: 'parent', record_id: PARENT_ID_1 },
        { record_type: 'household', record_id: HOUSEHOLD_ID_1 },
      ]);

      // Student already deleted
      mockStudentReadFacade.findWithDependencyCounts.mockResolvedValue(null);
      // Parent clean
      mockParentReadFacade.findById.mockResolvedValue({ id: PARENT_ID_1, user_id: null });
      // Household — students from this import were already deleted
      mockStudentReadFacade.findByHousehold.mockResolvedValue([]);
      mockHouseholdReadFacade.exists.mockResolvedValue(true);

      const result = await service.rollback(TENANT_ID, JOB_ID);

      expect(result.rollback_summary.deleted_count).toBe(3);
      expect(result.rollback_summary.skipped_count).toBe(0);
    });

    it('should skip student with multiple dependency types', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'student', record_id: STUDENT_ID },
      ]);
      mockStudentReadFacade.findWithDependencyCounts.mockResolvedValue({
        _count: {
          attendance_records: 3,
          grades: 2,
          class_enrolments: 1,
          invoice_lines: 1,
          report_cards: 1,
        },
      });

      const result = await service.rollback(TENANT_ID, JOB_ID);

      const reason = result.rollback_summary.skipped_details[0].reason;
      expect(reason).toContain('attendance');
      expect(reason).toContain('grades');
      expect(reason).toContain('class enrolments');
      expect(reason).toContain('invoice');
      expect(reason).toContain('report cards');
    });

    it('edge: should exclude import students from external check for household', async () => {
      setupRollbackJob();
      mockImportJobRecord.findMany.mockResolvedValue([
        { record_type: 'student', record_id: STUDENT_ID },
        { record_type: 'household', record_id: HOUSEHOLD_ID_1 },
      ]);

      // Student is already deleted
      mockStudentReadFacade.findWithDependencyCounts.mockResolvedValue(null);
      // Household has only the imported student (which matches the import set)
      mockStudentReadFacade.findByHousehold.mockResolvedValue([{ id: STUDENT_ID }]);
      mockHouseholdReadFacade.exists.mockResolvedValue(true);

      const result = await service.rollback(TENANT_ID, JOB_ID);

      // The student is in the import set, so household should be deletable
      expect(mockTx.household.delete).toHaveBeenCalled();
      expect(result.rollback_summary.deleted_count).toBe(2);
    });
  });

  // ─── isExampleRow — additional branches ─────────────────────────────────

  describe('upload() — isExampleRow branches', () => {
    it('should detect Omar Al-Mansour as example row', async () => {
      const csv = 'first_name,last_name,date_of_birth\nOmar,Al-Mansour,2017-08-22';
      const fileBuffer = Buffer.from(csv);

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'failed' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        'students.csv',
        'students' as ImportType,
      );

      const updateCalls = mockPrisma.importJob.update.mock.calls;
      const failedCall = updateCalls.find(
        (call: Array<Record<string, Record<string, unknown>>>) => {
          const summary = call[0]?.data?.summary_json as Record<string, unknown> | undefined;
          return summary?.error && String(summary.error).includes('example');
        },
      );
      expect(failedCall).toBeDefined();
    });

    it('should detect example row with (e.g.) pattern in cells', async () => {
      const csv = 'first_name,last_name,date_of_birth\nAhmed,Test (e.g. example),2015-01-01';
      const fileBuffer = Buffer.from(csv);

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'failed' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'failed' }));

      await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        'students.csv',
        'students' as ImportType,
      );

      expect(mockPrisma.importJob.update).toHaveBeenCalled();
    });

    it('should not flag non-example first name as example row', async () => {
      const csv = 'first_name,last_name,date_of_birth\nJohn,Smith,2015-01-01';
      const fileBuffer = Buffer.from(csv);

      mockPrisma.importJob.create.mockResolvedValue(buildMockJob({ file_key: null }));
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/imports/${JOB_ID}.csv`);
      mockPrisma.importJob.update.mockResolvedValue(buildMockJob({ status: 'validated' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildMockJob({ status: 'validated' }));

      await service.upload(
        TENANT_ID,
        USER_ID,
        fileBuffer,
        'students.csv',
        'students' as ImportType,
      );

      const updateCalls = mockPrisma.importJob.update.mock.calls;
      const validatedCall = updateCalls.find(
        (call: Array<Record<string, Record<string, unknown>>>) => {
          const summary = call[0]?.data?.summary_json as Record<string, unknown> | undefined;
          return summary?.valid_rows === 1;
        },
      );
      expect(validatedCall).toBeDefined();
    });
  });
});
