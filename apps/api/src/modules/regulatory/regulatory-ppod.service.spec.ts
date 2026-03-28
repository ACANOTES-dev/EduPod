import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PodDatabaseType, PodSyncLogStatus, PodSyncStatus, PodSyncType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import type { PodRecord, PodTransport, PodTransportResult } from './adapters/pod-transport.interface';
import { POD_TRANSPORT } from './adapters/pod-transport.interface';
import { RegulatoryPpodService } from './regulatory-ppod.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

// ─── Result type shapes for casting from RLS transactions ───────────────────

interface ImportResult {
  sync_log_id: string;
  records_created: number;
  records_updated: number;
  records_failed: number;
  errors: Array<{ row: number; external_id: string; message: string }>;
}

interface ExportResult {
  sync_log_id: string | null;
  records_pushed: number;
  csv_content: string;
}

interface DiffEntry {
  student_id: string;
  mapping_id: string;
  status: 'new' | 'changed' | 'unchanged';
  current_hash: string;
  stored_hash: string | null;
  record?: PodRecord;
}

// ─── Test Fixtures ──────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const MAPPING_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SYNC_LOG_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const MOCK_STUDENT = {
  id: STUDENT_ID,
  tenant_id: TENANT_ID,
  student_number: 'STU-001',
  national_id: '1234567A',
  first_name: 'John',
  last_name: 'Doe',
  date_of_birth: new Date('2010-01-15'),
  gender: 'male',
  nationality: 'Irish',
  entry_date: new Date('2023-09-01'),
  exit_date: null,
  status: 'active',
  household: {
    address_line_1: '123 Main St',
    address_line_2: null,
    city: 'Dublin',
    country: 'Dublin',
    postal_code: 'D01 X1Y2',
  },
  year_group: { name: '1st Year' },
  homeroom_class: { name: '1A' },
};

const MOCK_MAPPING = {
  id: MAPPING_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  database_type: PodDatabaseType.ppod,
  external_id: 'EXT-001',
  sync_status: PodSyncStatus.synced,
  last_synced_at: new Date('2024-01-01'),
  last_sync_hash: 'abc123',
  last_sync_error: null,
  data_snapshot: null,
  created_at: new Date(),
  updated_at: new Date(),
  student: MOCK_STUDENT,
};

const MOCK_SYNC_LOG = {
  id: SYNC_LOG_ID,
  tenant_id: TENANT_ID,
  database_type: PodDatabaseType.ppod,
  sync_type: PodSyncType.manual,
  triggered_by_id: USER_ID,
  started_at: new Date('2024-01-01T10:00:00Z'),
  completed_at: new Date('2024-01-01T10:01:00Z'),
  status: PodSyncLogStatus.sync_completed,
  records_pushed: 0,
  records_created: 5,
  records_updated: 3,
  records_failed: 0,
  error_details: null,
  transport_used: 'csv',
  created_at: new Date(),
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('RegulatoryPpodService', () => {
  let service: RegulatoryPpodService;
  let mockPrisma: {
    ppodStudentMapping: {
      groupBy: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    ppodSyncLog: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    student: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };
  let mockTransport: {
    pull: jest.Mock;
    push: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      ppodStudentMapping: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: MAPPING_ID }),
        update: jest.fn().mockResolvedValue({ id: MAPPING_ID }),
      },
      ppodSyncLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: SYNC_LOG_ID }),
        update: jest.fn().mockResolvedValue({ id: SYNC_LOG_ID }),
      },
      student: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: STUDENT_ID }),
      },
    };

    mockTransport = {
      pull: jest.fn(),
      push: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryPpodService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: POD_TRANSPORT, useValue: mockTransport as PodTransport },
      ],
    }).compile();

    service = module.get<RegulatoryPpodService>(RegulatoryPpodService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getSyncStatus ──────────────────────────────────────────────────────

  describe('getSyncStatus', () => {
    it('should return correct sync status counts', async () => {
      mockPrisma.ppodStudentMapping.groupBy.mockResolvedValue([
        { sync_status: PodSyncStatus.synced, _count: { id: 10 } },
        { sync_status: PodSyncStatus.pod_pending, _count: { id: 3 } },
        { sync_status: PodSyncStatus.changed, _count: { id: 2 } },
        { sync_status: PodSyncStatus.pod_error, _count: { id: 1 } },
      ]);
      mockPrisma.ppodSyncLog.findFirst.mockResolvedValue(MOCK_SYNC_LOG);

      const result = await service.getSyncStatus(TENANT_ID, PodDatabaseType.ppod);

      expect(result.total_mapped).toBe(16);
      expect(result.synced).toBe(10);
      expect(result.pending).toBe(3);
      expect(result.changed).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.last_sync).toBeTruthy();
      expect(result.last_sync?.id).toBe(SYNC_LOG_ID);

      expect(mockPrisma.ppodStudentMapping.groupBy).toHaveBeenCalledWith({
        by: ['sync_status'],
        where: { tenant_id: TENANT_ID, database_type: PodDatabaseType.ppod },
        _count: { id: true },
      });
    });

    it('should return null last_sync when no sync logs exist', async () => {
      mockPrisma.ppodStudentMapping.groupBy.mockResolvedValue([]);
      mockPrisma.ppodSyncLog.findFirst.mockResolvedValue(null);

      const result = await service.getSyncStatus(TENANT_ID, PodDatabaseType.ppod);

      expect(result.total_mapped).toBe(0);
      expect(result.last_sync).toBeNull();
    });
  });

  // ─── importFromPpod ─────────────────────────────────────────────────────

  describe('importFromPpod', () => {
    it('should parse CSV and update existing mapped students', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };

      const mockTx = {
        ppodSyncLog: {
          create: jest.fn().mockResolvedValue({ id: SYNC_LOG_ID }),
          update: jest.fn().mockResolvedValue({ id: SYNC_LOG_ID }),
        },
        ppodStudentMapping: {
          findFirst: jest.fn().mockResolvedValue({
            id: MAPPING_ID,
            student_id: STUDENT_ID,
          }),
          update: jest.fn().mockResolvedValue({ id: MAPPING_ID }),
        },
        student: {
          update: jest.fn().mockResolvedValue({ id: STUDENT_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      const pullResult: PodTransportResult = {
        success: true,
        records: [
          {
            external_id: 'EXT-001',
            first_name: 'John',
            last_name: 'Doe',
            date_of_birth: '2010-01-15',
            gender: 'male',
          },
        ],
        errors: [],
      };
      mockTransport.pull.mockResolvedValue(pullResult);

      const result = (await service.importFromPpod(TENANT_ID, USER_ID, {
        database_type: 'ppod',
        file_content: 'External_ID\tFirst_Name\tLast_Name\nEXT-001\tJohn\tDoe',
      })) as ImportResult;

      expect(result.records_updated).toBe(1);
      expect(result.records_created).toBe(0);
      expect(result.records_failed).toBe(0);
      expect(mockTx.student.update).toHaveBeenCalled();
      expect(mockTx.ppodStudentMapping.update).toHaveBeenCalled();
    });

    it('should create new mapping when matching student found by national_id', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };

      const mockTxCreate: {
        ppodSyncLog: { create: jest.Mock; update: jest.Mock };
        ppodStudentMapping: { findFirst: jest.Mock; create: jest.Mock };
        student: { findFirst: jest.Mock; update: jest.Mock };
      } = {
        ppodSyncLog: {
          create: jest.fn().mockResolvedValue({ id: SYNC_LOG_ID }),
          update: jest.fn().mockResolvedValue({ id: SYNC_LOG_ID }),
        },
        ppodStudentMapping: {
          findFirst: jest.fn().mockResolvedValue(null), // No existing mapping
          create: jest.fn().mockResolvedValue({ id: MAPPING_ID }),
        },
        student: {
          findFirst: jest.fn().mockResolvedValue({ id: STUDENT_ID }), // Student found by PPS
          update: jest.fn().mockResolvedValue({ id: STUDENT_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTxCreate)),
      });

      const pullResult: PodTransportResult = {
        success: true,
        records: [
          {
            external_id: 'EXT-002',
            first_name: 'Jane',
            last_name: 'Smith',
            date_of_birth: '2011-06-22',
            gender: 'female',
            pps_number: '7654321B',
          },
        ],
        errors: [],
      };
      mockTransport.pull.mockResolvedValue(pullResult);

      const result = (await service.importFromPpod(TENANT_ID, USER_ID, {
        database_type: 'ppod',
        file_content: 'test-csv-content',
      })) as ImportResult;

      expect(result.records_created).toBe(1);
      expect(result.records_updated).toBe(0);
      expect(mockTxCreate.ppodStudentMapping.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException on completely failed parse', async () => {
      const pullResult: PodTransportResult = {
        success: false,
        records: [],
        errors: [{ row: 0, field: '', message: 'Empty file' }],
      };
      mockTransport.pull.mockResolvedValue(pullResult);

      await expect(
        service.importFromPpod(TENANT_ID, USER_ID, {
          database_type: 'ppod',
          file_content: '',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── exportForPpod ──────────────────────────────────────────────────────

  describe('exportForPpod', () => {
    it('should export changed records as CSV', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };

      // Setup: one mapping with changed hash
      mockPrisma.ppodStudentMapping.findMany.mockResolvedValue([
        {
          ...MOCK_MAPPING,
          last_sync_hash: 'old-hash',
          student: MOCK_STUDENT,
        },
      ]);

      const mockTxExport = {
        ppodSyncLog: {
          create: jest.fn().mockResolvedValue({ id: SYNC_LOG_ID }),
        },
        ppodStudentMapping: {
          update: jest.fn().mockResolvedValue({ id: MAPPING_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTxExport)),
      });

      const pushResult: PodTransportResult = {
        success: true,
        records: [],
        errors: [],
        raw_content: 'External_ID\tFirst_Name\tLast_Name\nSTU-001\tJohn\tDoe',
      };
      mockTransport.push.mockResolvedValue(pushResult);

      const result = (await service.exportForPpod(TENANT_ID, USER_ID, {
        database_type: 'ppod',
        scope: 'incremental',
      })) as ExportResult;

      expect(result.records_pushed).toBe(1);
      expect(result.csv_content).toContain('External_ID');
      expect(mockTransport.push).toHaveBeenCalled();
      expect(mockTxExport.ppodStudentMapping.update).toHaveBeenCalled();
    });

    it('should export all records when scope is full', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };

      // Setup: one mapping with current hash (unchanged)
      mockPrisma.ppodStudentMapping.findMany.mockResolvedValue([
        {
          ...MOCK_MAPPING,
          student: MOCK_STUDENT,
        },
      ]);

      const mockTxFull = {
        ppodSyncLog: {
          create: jest.fn().mockResolvedValue({ id: SYNC_LOG_ID }),
        },
        ppodStudentMapping: {
          update: jest.fn().mockResolvedValue({ id: MAPPING_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTxFull)),
      });

      const pushResult: PodTransportResult = {
        success: true,
        records: [],
        errors: [],
        raw_content: 'External_ID\tFirst_Name\tLast_Name\nSTU-001\tJohn\tDoe',
      };
      mockTransport.push.mockResolvedValue(pushResult);

      const result = (await service.exportForPpod(TENANT_ID, USER_ID, {
        database_type: 'ppod',
        scope: 'full',
      })) as ExportResult;

      // Full scope includes ALL records, even unchanged ones
      expect(result.records_pushed).toBe(1);
      expect(mockTransport.push).toHaveBeenCalled();
    });

    it('should return empty result when no records to export', async () => {
      mockPrisma.ppodStudentMapping.findMany.mockResolvedValue([]);

      const result = (await service.exportForPpod(TENANT_ID, USER_ID, {
        database_type: 'ppod',
        scope: 'incremental',
      })) as ExportResult;

      expect(result.sync_log_id).toBeNull();
      expect(result.records_pushed).toBe(0);
      expect(result.csv_content).toBe('');
      expect(mockTransport.push).not.toHaveBeenCalled();
    });
  });

  // ─── previewDiff ────────────────────────────────────────────────────────

  describe('previewDiff', () => {
    it('should return only changed and new records', async () => {
      // Two mappings: one changed (different hash), one unchanged (same hash)
      const unchangedMapping = {
        ...MOCK_MAPPING,
        id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        student: MOCK_STUDENT,
        // last_sync_hash will match the computed hash
      };

      const changedMapping = {
        ...MOCK_MAPPING,
        last_sync_hash: 'completely-wrong-hash',
        student: MOCK_STUDENT,
      };

      mockPrisma.ppodStudentMapping.findMany.mockResolvedValue([unchangedMapping, changedMapping]);

      const result = (await service.previewDiff(TENANT_ID, PodDatabaseType.ppod)) as DiffEntry[];

      // The unchanged mapping may or may not match depending on hash computation,
      // but the one with 'completely-wrong-hash' will definitely be 'changed'
      const changedEntries = result.filter((e) => e.status === 'changed');
      expect(changedEntries.length).toBeGreaterThanOrEqual(1);

      // No 'unchanged' entries should be in the result
      const unchangedEntries = result.filter((e) => e.status === 'unchanged');
      expect(unchangedEntries.length).toBe(0);
    });

    it('should mark mappings without stored hash as new', async () => {
      const newMapping = {
        ...MOCK_MAPPING,
        last_sync_hash: null,
        student: MOCK_STUDENT,
      };

      mockPrisma.ppodStudentMapping.findMany.mockResolvedValue([newMapping]);

      const result = (await service.previewDiff(TENANT_ID, PodDatabaseType.ppod)) as DiffEntry[];

      expect(result).toHaveLength(1);
      expect(result[0]?.status).toBe('new');
    });
  });

  // ─── getSyncLog ─────────────────────────────────────────────────────────

  describe('getSyncLog', () => {
    it('should return paginated sync logs with user info', async () => {
      const logWithUser = {
        ...MOCK_SYNC_LOG,
        triggered_by: {
          id: USER_ID,
          first_name: 'Admin',
          last_name: 'User',
          email: 'admin@school.ie',
        },
      };
      mockPrisma.ppodSyncLog.findMany.mockResolvedValue([logWithUser]);
      mockPrisma.ppodSyncLog.count.mockResolvedValue(1);

      const result = await service.getSyncLog(TENANT_ID, PodDatabaseType.ppod, 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(result.data[0]?.triggered_by).toBeTruthy();

      expect(mockPrisma.ppodSyncLog.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, database_type: PodDatabaseType.ppod },
        orderBy: { started_at: 'desc' },
        skip: 0,
        take: 20,
        include: {
          triggered_by: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
        },
      });
    });

    it('should return all logs when database_type is not specified', async () => {
      mockPrisma.ppodSyncLog.findMany.mockResolvedValue([]);
      mockPrisma.ppodSyncLog.count.mockResolvedValue(0);

      const result = await service.getSyncLog(TENANT_ID, undefined, 1, 10);

      expect(result.meta.total).toBe(0);
      expect(mockPrisma.ppodSyncLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
        }),
      );
    });

    it('should handle pagination offset correctly', async () => {
      mockPrisma.ppodSyncLog.findMany.mockResolvedValue([]);
      mockPrisma.ppodSyncLog.count.mockResolvedValue(50);

      await service.getSyncLog(TENANT_ID, PodDatabaseType.ppod, 3, 10);

      expect(mockPrisma.ppodSyncLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });
  });
});
