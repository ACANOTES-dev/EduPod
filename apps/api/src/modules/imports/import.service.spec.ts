/* eslint-disable @typescript-eslint/no-explicit-any */
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

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

  beforeEach(async () => {
    mockPrisma = {
      importJob: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
        { provide: getQueueToken('imports'), useValue: mockQueue },
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

    it('should enqueue imports:validate job after upload', async () => {
      await service.upload(TENANT_ID, USER_ID, fileBuffer, fileName, 'students' as any);

      expect(mockQueue.add).toHaveBeenCalledWith('imports:validate', {
        tenant_id: TENANT_ID,
        job_id: JOB_ID,
      });
    });

    it('should return serialised job with created_by user', async () => {
      const result = await service.upload(TENANT_ID, USER_ID, fileBuffer, fileName, 'students' as any);

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
    it('should transition validated to processing, enqueue imports:process', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({
          status: 'validated',
          summary_json: { total_rows: 10, failed: 2, successful: 8, warnings: 0 },
        }),
      );
      mockPrisma.importJob.update.mockResolvedValue(
        buildMockJob({ status: 'processing' }),
      );
      mockQueue.add.mockResolvedValue(undefined);

      const result = await service.confirm(TENANT_ID, JOB_ID);

      expect(result.status).toBe('processing');
      expect(mockPrisma.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: JOB_ID },
          data: { status: 'processing' },
        }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith('imports:process', {
        tenant_id: TENANT_ID,
        job_id: JOB_ID,
      });
    });

    it('should throw INVALID_IMPORT_STATUS when not validated', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ status: 'uploaded' }),
      );

      await expect(service.confirm(TENANT_ID, JOB_ID)).rejects.toThrow(BadRequestException);

      await expect(service.confirm(TENANT_ID, JOB_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_IMPORT_STATUS' }),
      });
    });

    it('should throw INVALID_IMPORT_STATUS when already processing', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({ status: 'processing' }),
      );

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
      mockPrisma.importJob.update.mockResolvedValue(
        buildMockJob({ status: 'processing' }),
      );
      mockQueue.add.mockResolvedValue(undefined);

      const result = await service.confirm(TENANT_ID, JOB_ID);

      expect(result.status).toBe('processing');
      expect(mockQueue.add).toHaveBeenCalledWith('imports:process', expect.any(Object));
    });

    it('edge: should handle summary_json with missing fields gracefully', async () => {
      // summary_json is an empty object — total_rows and failed default to 0
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildMockJob({
          status: 'validated',
          summary_json: {},
        }),
      );
      mockPrisma.importJob.update.mockResolvedValue(
        buildMockJob({ status: 'processing' }),
      );
      mockQueue.add.mockResolvedValue(undefined);

      // totalRows=0, failedRows=0 => the guard (totalRows > 0 && failed >= total) is false => proceeds
      const result = await service.confirm(TENANT_ID, JOB_ID);

      expect(result.status).toBe('processing');
    });
  });

});
