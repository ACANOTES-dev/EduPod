import { Test, TestingModule } from '@nestjs/testing';
import { CbaSyncStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { RegulatoryCbaService } from './regulatory-cba.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SUBJECT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ASSESSMENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const RECORD_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

describe('RegulatoryCbaService', () => {
  let service: RegulatoryCbaService;
  let mockPrisma: {
    ppodCbaSyncRecord: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      groupBy: jest.Mock;
    };
    desSubjectCodeMapping: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      ppodCbaSyncRecord: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      desSubjectCodeMapping: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryCbaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RegulatoryCbaService>(RegulatoryCbaService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getCbaStatus ─────────────────────────────────────────────────────────────

  describe('getCbaStatus', () => {
    it('should return correct status counts', async () => {
      mockPrisma.ppodCbaSyncRecord.groupBy.mockResolvedValue([
        { sync_status: CbaSyncStatus.cba_pending, _count: 5 },
        { sync_status: CbaSyncStatus.cba_synced, _count: 10 },
        { sync_status: CbaSyncStatus.cba_error, _count: 2 },
      ]);
      mockPrisma.ppodCbaSyncRecord.findFirst.mockResolvedValue({
        synced_at: new Date('2026-03-15T10:00:00Z'),
      });

      const result = await service.getCbaStatus(TENANT_ID, '2025-2026');

      expect(result).toEqual({
        academic_year: '2025-2026',
        total: 17,
        pending: 5,
        synced: 10,
        errors: 2,
        last_synced_at: new Date('2026-03-15T10:00:00Z'),
      });
      expect(mockPrisma.ppodCbaSyncRecord.groupBy).toHaveBeenCalledWith({
        by: ['sync_status'],
        where: { tenant_id: TENANT_ID, academic_year: '2025-2026' },
        _count: true,
      });
    });

    it('should return zeroes when no records exist', async () => {
      const result = await service.getCbaStatus(TENANT_ID, '2025-2026');

      expect(result.total).toBe(0);
      expect(result.pending).toBe(0);
      expect(result.synced).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.last_synced_at).toBeNull();
    });
  });

  // ─── getPendingResults ────────────────────────────────────────────────────────

  describe('getPendingResults', () => {
    it('should return paginated pending records', async () => {
      const mockRecords = [
        {
          id: RECORD_ID,
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          subject_id: SUBJECT_ID,
          assessment_id: ASSESSMENT_ID,
          academic_year: '2025-2026',
          cba_type: 'CBA1',
          grade: 'Exceptional',
          sync_status: CbaSyncStatus.cba_pending,
          student: { id: STUDENT_ID, first_name: 'John', last_name: 'Doe', student_number: 'S001' },
        },
      ];

      mockPrisma.ppodCbaSyncRecord.findMany.mockResolvedValue(mockRecords);
      mockPrisma.ppodCbaSyncRecord.count.mockResolvedValue(1);

      const result = await service.getPendingResults(TENANT_ID, '2025-2026', 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(mockPrisma.ppodCbaSyncRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenant_id: TENANT_ID,
            academic_year: '2025-2026',
            sync_status: CbaSyncStatus.cba_pending,
          },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should apply correct pagination offset', async () => {
      mockPrisma.ppodCbaSyncRecord.count.mockResolvedValue(25);

      await service.getPendingResults(TENANT_ID, '2025-2026', 2, 10);

      expect(mockPrisma.ppodCbaSyncRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });
  });

  // ─── syncExport ───────────────────────────────────────────────────────────────

  describe('syncExport', () => {
    it('should sync pending records and return counts', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };

      const mockTx = {
        ppodCbaSyncRecord: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: RECORD_ID,
              tenant_id: TENANT_ID,
              student_id: STUDENT_ID,
              subject_id: SUBJECT_ID,
              assessment_id: ASSESSMENT_ID,
              grade: 'Exceptional',
            },
          ]),
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
        desSubjectCodeMapping: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'mapping-1',
            tenant_id: TENANT_ID,
            subject_id: SUBJECT_ID,
            des_code: 'MAT',
            des_name: 'Mathematics',
          }),
        },
      };

      createRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.syncExport(TENANT_ID, USER_ID, {
        academic_year: '2025-2026',
      });

      expect(result.synced_count).toBe(1);
      expect(result.error_count).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(mockTx.ppodCbaSyncRecord.update).toHaveBeenCalledWith({
        where: { id: RECORD_ID },
        data: {
          sync_status: CbaSyncStatus.cba_synced,
          synced_at: expect.any(Date),
          sync_error: null,
        },
      });
    });

    it('should handle errors gracefully when DES mapping is missing', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };

      const mockTx = {
        ppodCbaSyncRecord: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: RECORD_ID,
              tenant_id: TENANT_ID,
              student_id: STUDENT_ID,
              subject_id: SUBJECT_ID,
              assessment_id: ASSESSMENT_ID,
              grade: 'Exceptional',
            },
          ]),
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
        desSubjectCodeMapping: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };

      createRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.syncExport(TENANT_ID, USER_ID, {
        academic_year: '2025-2026',
      });

      expect(result.synced_count).toBe(0);
      expect(result.error_count).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error).toContain('No DES subject code mapping');
      expect(mockTx.ppodCbaSyncRecord.update).toHaveBeenCalledWith({
        where: { id: RECORD_ID },
        data: {
          sync_status: CbaSyncStatus.cba_error,
          sync_error: expect.stringContaining('No DES subject code mapping'),
        },
      });
    });

    it('should handle errors when grade cannot be mapped', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };

      const mockTx = {
        ppodCbaSyncRecord: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: RECORD_ID,
              tenant_id: TENANT_ID,
              student_id: STUDENT_ID,
              subject_id: SUBJECT_ID,
              assessment_id: ASSESSMENT_ID,
              grade: 'InvalidGrade',
            },
          ]),
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
        desSubjectCodeMapping: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'mapping-1',
            tenant_id: TENANT_ID,
            subject_id: SUBJECT_ID,
            des_code: 'MAT',
            des_name: 'Mathematics',
          }),
        },
      };

      createRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.syncExport(TENANT_ID, USER_ID, {
        academic_year: '2025-2026',
      });

      expect(result.synced_count).toBe(0);
      expect(result.error_count).toBe(1);
      expect(result.errors[0]!.error).toContain('Unable to map grade');
    });

    it('should filter by subject_id when provided', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };

      const mockTx = {
        ppodCbaSyncRecord: {
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
        },
        desSubjectCodeMapping: {
          findFirst: jest.fn(),
        },
      };

      createRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.syncExport(TENANT_ID, USER_ID, {
        academic_year: '2025-2026',
        subject_id: SUBJECT_ID,
      });

      expect(mockTx.ppodCbaSyncRecord.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ subject_id: SUBJECT_ID }),
      });
    });
  });

  // ─── syncStudent ──────────────────────────────────────────────────────────────

  describe('syncStudent', () => {
    it('should sync records for a single student', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };

      const mockTx = {
        ppodCbaSyncRecord: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: RECORD_ID,
              tenant_id: TENANT_ID,
              student_id: STUDENT_ID,
              subject_id: SUBJECT_ID,
              assessment_id: ASSESSMENT_ID,
              grade: 'AE',
            },
          ]),
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
        desSubjectCodeMapping: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'mapping-1',
            tenant_id: TENANT_ID,
            subject_id: SUBJECT_ID,
            des_code: 'ENG',
            des_name: 'English',
          }),
        },
      };

      createRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.syncStudent(
        TENANT_ID,
        STUDENT_ID,
        { academic_year: '2025-2026' },
        USER_ID,
      );

      expect(result.synced_count).toBe(1);
      expect(result.error_count).toBe(0);
      expect(mockTx.ppodCbaSyncRecord.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          academic_year: '2025-2026',
          sync_status: CbaSyncStatus.cba_pending,
        },
      });
    });

    it('should return zero counts when no pending records for student', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };

      const mockTx = {
        ppodCbaSyncRecord: {
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
        },
        desSubjectCodeMapping: {
          findFirst: jest.fn(),
        },
      };

      createRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.syncStudent(
        TENANT_ID,
        STUDENT_ID,
        { academic_year: '2025-2026' },
        USER_ID,
      );

      expect(result.synced_count).toBe(0);
      expect(result.error_count).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ─── mapGradeToDescriptor (via syncExport behaviour) ──────────────────────────

  describe('grade mapping', () => {
    it('should match grade by full name (case-insensitive)', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };

      const mockTx = {
        ppodCbaSyncRecord: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: RECORD_ID,
              tenant_id: TENANT_ID,
              student_id: STUDENT_ID,
              subject_id: SUBJECT_ID,
              assessment_id: ASSESSMENT_ID,
              grade: 'yet to meet expectations',
            },
          ]),
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
        desSubjectCodeMapping: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'mapping-1',
            tenant_id: TENANT_ID,
            subject_id: SUBJECT_ID,
            des_code: 'SCI',
            des_name: 'Science',
          }),
        },
      };

      createRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.syncExport(TENANT_ID, USER_ID, {
        academic_year: '2025-2026',
      });

      expect(result.synced_count).toBe(1);
      expect(result.error_count).toBe(0);
    });

    it('should match grade by code', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };

      const mockTx = {
        ppodCbaSyncRecord: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: RECORD_ID,
              tenant_id: TENANT_ID,
              student_id: STUDENT_ID,
              subject_id: SUBJECT_ID,
              assessment_id: ASSESSMENT_ID,
              grade: 'ILE',
            },
          ]),
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
        desSubjectCodeMapping: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'mapping-1',
            tenant_id: TENANT_ID,
            subject_id: SUBJECT_ID,
            des_code: 'HIS',
            des_name: 'History',
          }),
        },
      };

      createRlsClient.mockReturnValue({
        $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.syncExport(TENANT_ID, USER_ID, {
        academic_year: '2025-2026',
      });

      expect(result.synced_count).toBe(1);
      expect(result.error_count).toBe(0);
    });
  });
});
