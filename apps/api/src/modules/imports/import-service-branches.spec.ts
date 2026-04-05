import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { HouseholdReadFacade } from '../households/household-read.facade';
import { ParentReadFacade } from '../parents/parent-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { StudentReadFacade } from '../students/student-read.facade';

import { ImportProcessingService } from './import-processing.service';
import { ImportService } from './import.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(() => ({
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  })),
}));

const mockTx = {
  studentParent: { deleteMany: jest.fn() },
  householdFeeAssignment: { deleteMany: jest.fn() },
  student: { delete: jest.fn() },
  householdParent: { deleteMany: jest.fn() },
  householdEmergencyContact: { deleteMany: jest.fn() },
  household: { delete: jest.fn() },
  parent: { delete: jest.fn() },
};

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const JOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function buildJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: JOB_ID,
    tenant_id: TENANT_ID,
    import_type: 'students',
    status: 'uploaded',
    file_key: 'imports/test.csv',
    summary_json: { total_rows: 5, valid_rows: 5, invalid_rows: 0 },
    created_by_user_id: USER_ID,
    created_by: { id: USER_ID, first_name: 'Admin', last_name: 'User' },
    ...overrides,
  };
}

describe('ImportService — branches', () => {
  let service: ImportService;
  let mockPrisma: Record<string, Record<string, jest.Mock>>;
  let mockS3: Record<string, jest.Mock>;
  let mockQueue: Record<string, jest.Mock>;
  let mockProcessing: Record<string, jest.Mock>;
  let mockStudentFacade: Record<string, jest.Mock>;
  let mockParentFacade: Record<string, jest.Mock>;
  let mockHouseholdFacade: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockPrisma = {
      importJob: {
        create: jest.fn().mockResolvedValue({ id: JOB_ID }),
        update: jest.fn().mockResolvedValue(buildJob()),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      importJobRecord: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    mockS3 = {
      upload: jest.fn().mockResolvedValue('imports/test.csv'),
      download: jest.fn(),
      delete: jest.fn(),
    };
    mockQueue = { add: jest.fn() };
    mockProcessing = { process: jest.fn().mockResolvedValue(undefined) };
    mockStudentFacade = {
      findWithDependencyCounts: jest.fn(),
      findByHousehold: jest.fn().mockResolvedValue([]),
    };
    mockParentFacade = { findById: jest.fn() };
    mockHouseholdFacade = { exists: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
        { provide: getQueueToken('imports'), useValue: mockQueue },
        { provide: ImportProcessingService, useValue: mockProcessing },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
        { provide: ParentReadFacade, useValue: mockParentFacade },
        { provide: HouseholdReadFacade, useValue: mockHouseholdFacade },
      ],
    }).compile();

    service = module.get<ImportService>(ImportService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── get — not found ────────────────────────────────────────────────────
  describe('ImportService — get', () => {
    it('should throw NotFoundException when job not found', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(null);
      await expect(service.get(TENANT_ID, JOB_ID)).rejects.toThrow(NotFoundException);
    });

    it('should return serialized job when found', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildJob());
      const result = await service.get(TENANT_ID, JOB_ID);
      expect(result).toHaveProperty('id', JOB_ID);
    });
  });

  // ─── list — with and without status filter ──────────────────────────────
  describe('ImportService — list', () => {
    it('should filter by status when provided', async () => {
      mockPrisma.importJob.findMany.mockResolvedValue([buildJob()]);
      mockPrisma.importJob.count.mockResolvedValue(1);
      const result = await service.list(TENANT_ID, { page: 1, pageSize: 20, status: 'validated' });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should not filter by status when not provided', async () => {
      mockPrisma.importJob.findMany.mockResolvedValue([]);
      mockPrisma.importJob.count.mockResolvedValue(0);
      const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 } as never);
      expect(result.data).toEqual([]);
    });
  });

  // ─── confirm — not found, wrong status, all rows failed ────────────────
  describe('ImportService — confirm', () => {
    it('should throw NotFoundException when job not found', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(null);
      await expect(service.confirm(TENANT_ID, JOB_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when status is not validated', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildJob({ status: 'uploaded' }));
      await expect(service.confirm(TENANT_ID, JOB_ID)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when all rows failed', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildJob({
          status: 'validated',
          summary_json: { total_rows: 5, failed: 5 },
        }),
      );
      await expect(service.confirm(TENANT_ID, JOB_ID)).rejects.toThrow(BadRequestException);
    });

    it('should process inline and return final job state', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildJob({ status: 'validated' }));
      mockPrisma.importJob.update.mockResolvedValue(buildJob({ status: 'processing' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildJob({ status: 'completed' }));

      const result = await service.confirm(TENANT_ID, JOB_ID);
      expect(result).toHaveProperty('id', JOB_ID);
      expect(mockProcessing.process).toHaveBeenCalledWith(TENANT_ID, JOB_ID);
    });

    it('should handle processing failure gracefully', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildJob({ status: 'validated' }));
      mockPrisma.importJob.update.mockResolvedValue(buildJob({ status: 'processing' }));
      mockProcessing.process.mockRejectedValue(new Error('Processing error'));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildJob({ status: 'failed' }));

      const result = await service.confirm(TENANT_ID, JOB_ID);
      expect(result).toHaveProperty('id');
    });

    it('edge: should handle confirm with totalRows 0 and failedRows 0 (no rows)', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildJob({
          status: 'validated',
          summary_json: { total_rows: 0, failed: 0 },
        }),
      );
      mockPrisma.importJob.update.mockResolvedValue(buildJob({ status: 'processing' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildJob({ status: 'completed' }));

      const result = await service.confirm(TENANT_ID, JOB_ID);
      expect(result).toHaveProperty('id');
    });
  });

  // ─── rollback — not found, wrong status, no tracked records ─────────────
  describe('ImportService — rollback', () => {
    it('should throw NotFoundException when job not found', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(null);
      await expect(service.rollback(TENANT_ID, JOB_ID)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when status is not completed', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildJob({ status: 'validated' }));
      await expect(service.rollback(TENANT_ID, JOB_ID)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when no tracked records', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(buildJob({ status: 'completed' }));
      mockPrisma.importJobRecord.findMany.mockResolvedValue([]);
      await expect(service.rollback(TENANT_ID, JOB_ID)).rejects.toThrow(BadRequestException);
    });

    it('should skip students with dependencies and track reasons', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildJob({ status: 'completed', summary_json: {} }),
      );
      mockPrisma.importJobRecord.findMany.mockResolvedValue([
        { record_type: 'student', record_id: 'stu-1', created_at: new Date() },
      ]);
      mockStudentFacade.findWithDependencyCounts.mockResolvedValue({
        _count: {
          attendance_records: 3,
          grades: 0,
          class_enrolments: 0,
          invoice_lines: 0,
          report_cards: 0,
        },
      });
      mockPrisma.importJob.update.mockResolvedValue(buildJob({ status: 'partially_rolled_back' }));

      const result = await service.rollback(TENANT_ID, JOB_ID);
      expect(result.rollback_summary.skipped_count).toBe(1);
    });

    it('should handle already-deleted students gracefully', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildJob({ status: 'completed', summary_json: {} }),
      );
      mockPrisma.importJobRecord.findMany.mockResolvedValue([
        { record_type: 'student', record_id: 'stu-1', created_at: new Date() },
      ]);
      mockStudentFacade.findWithDependencyCounts.mockResolvedValue(null);
      mockPrisma.importJob.update.mockResolvedValue(buildJob({ status: 'rolled_back' }));

      const result = await service.rollback(TENANT_ID, JOB_ID);
      expect(result.rollback_summary.deleted_count).toBe(1);
    });

    it('should skip parents linked to user accounts', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildJob({ status: 'completed', summary_json: {} }),
      );
      mockPrisma.importJobRecord.findMany.mockResolvedValue([
        { record_type: 'parent', record_id: 'par-1', created_at: new Date() },
      ]);
      mockParentFacade.findById.mockResolvedValue({ id: 'par-1', user_id: 'usr-1' });
      mockPrisma.importJob.update.mockResolvedValue(buildJob({ status: 'partially_rolled_back' }));

      const result = await service.rollback(TENANT_ID, JOB_ID);
      expect(result.rollback_summary.skipped_count).toBe(1);
    });

    it('should handle already-deleted parents gracefully', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildJob({ status: 'completed', summary_json: {} }),
      );
      mockPrisma.importJobRecord.findMany.mockResolvedValue([
        { record_type: 'parent', record_id: 'par-1', created_at: new Date() },
      ]);
      mockParentFacade.findById.mockResolvedValue(null);
      mockPrisma.importJob.update.mockResolvedValue(buildJob({ status: 'rolled_back' }));

      const result = await service.rollback(TENANT_ID, JOB_ID);
      expect(result.rollback_summary.deleted_count).toBe(1);
    });

    it('should skip households with external students', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildJob({ status: 'completed', summary_json: {} }),
      );
      mockPrisma.importJobRecord.findMany.mockResolvedValue([
        { record_type: 'household', record_id: 'hh-1', created_at: new Date() },
      ]);
      mockStudentFacade.findByHousehold.mockResolvedValue([{ id: 'external-student-1' }]);
      mockPrisma.importJob.update.mockResolvedValue(buildJob({ status: 'partially_rolled_back' }));

      const result = await service.rollback(TENANT_ID, JOB_ID);
      expect(result.rollback_summary.skipped_count).toBe(1);
    });

    it('should handle already-deleted households', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildJob({ status: 'completed', summary_json: {} }),
      );
      mockPrisma.importJobRecord.findMany.mockResolvedValue([
        { record_type: 'household', record_id: 'hh-1', created_at: new Date() },
      ]);
      mockStudentFacade.findByHousehold.mockResolvedValue([]);
      mockHouseholdFacade.exists.mockResolvedValue(false);
      mockPrisma.importJob.update.mockResolvedValue(buildJob({ status: 'rolled_back' }));

      const result = await service.rollback(TENANT_ID, JOB_ID);
      expect(result.rollback_summary.deleted_count).toBe(1);
    });

    it('should delete parents without user_id', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue(
        buildJob({ status: 'completed', summary_json: {} }),
      );
      mockPrisma.importJobRecord.findMany.mockResolvedValue([
        { record_type: 'parent', record_id: 'par-1', created_at: new Date() },
      ]);
      mockParentFacade.findById.mockResolvedValue({ id: 'par-1', user_id: null });
      mockPrisma.importJob.update.mockResolvedValue(buildJob({ status: 'rolled_back' }));

      const result = await service.rollback(TENANT_ID, JOB_ID);
      expect(result.rollback_summary.deleted_count).toBe(1);
    });
  });

  // ─── upload — validation paths ──────────────────────────────────────────
  describe('ImportService — upload', () => {
    it('should handle .xlsx extension detection', async () => {
      mockPrisma.importJob.create.mockResolvedValue({ id: JOB_ID });
      mockS3.upload.mockResolvedValue('imports/test.xlsx');
      // The XLSX parse will fail on a CSV buffer which triggers the catch block
      mockPrisma.importJob.update.mockResolvedValue(buildJob());
      mockPrisma.importJob.findUnique.mockResolvedValue(buildJob());

      const result = await service.upload(
        TENANT_ID,
        USER_ID,
        Buffer.from('name,age\nJohn,10'),
        'test.xlsx',
        'students',
      );
      expect(result).toHaveProperty('id');
    });

    it('should handle empty file (no headers)', async () => {
      mockPrisma.importJob.create.mockResolvedValue({ id: JOB_ID });
      mockS3.upload.mockResolvedValue('imports/test.csv');
      mockPrisma.importJob.update.mockResolvedValue(buildJob({ status: 'failed' }));
      mockPrisma.importJob.findUnique.mockResolvedValue(buildJob({ status: 'failed' }));

      const result = await service.upload(
        TENANT_ID,
        USER_ID,
        Buffer.from(''),
        'test.csv',
        'students',
      );
      expect(result).toHaveProperty('id');
    });
  });

  // ─── serializeJob — various summary shapes ─────────────────────────────
  describe('ImportService — serializeJob — edge cases', () => {
    it('should handle null summary_json', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        tenant_id: TENANT_ID,
        summary_json: null,
        created_by: { id: USER_ID, first_name: 'A', last_name: 'B' },
      });
      const result = await service.get(TENANT_ID, JOB_ID);
      expect(result.total_rows).toBeNull();
      expect(result.errors).toEqual([]);
    });

    it('should serialize row_errors into flat error list', async () => {
      mockPrisma.importJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        tenant_id: TENANT_ID,
        summary_json: {
          header_errors: ['Missing: first_name'],
          row_errors: [{ row: 2, errors: ['Missing field A', 'Missing field B'] }],
        },
        created_by: { id: USER_ID, first_name: 'A', last_name: 'B' },
      });
      const result = await service.get(TENANT_ID, JOB_ID);
      const errors = result.errors as Array<{ row: number; message: string }>;
      expect(errors).toHaveLength(3); // 1 header + 2 row errors
    });
  });
});
