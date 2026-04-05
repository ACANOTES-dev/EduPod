import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RegulatorySubmissionService } from './regulatory-submission.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SUBMISSION_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

describe('RegulatorySubmissionService', () => {
  let service: RegulatorySubmissionService;
  let mockPrisma: {
    regulatorySubmission: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      regulatorySubmission: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: SUBMISSION_ID }),
        update: jest.fn().mockResolvedValue({ id: SUBMISSION_ID }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RegulatorySubmissionService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<RegulatorySubmissionService>(RegulatorySubmissionService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a submission', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      regulatorySubmission: {
        create: jest
          .fn()
          .mockResolvedValue({ id: SUBMISSION_ID, submission_type: 'tusla_sar_period_1' }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.create(TENANT_ID, USER_ID, {
      domain: 'tusla_attendance',
      submission_type: 'tusla_sar_period_1',
      academic_year: '2025-2026',
      status: 'in_progress',
    });

    expect(result).toEqual({ id: SUBMISSION_ID, submission_type: 'tusla_sar_period_1' });
  });

  it('should return paginated submissions', async () => {
    mockPrisma.regulatorySubmission.findMany.mockResolvedValue([{ id: SUBMISSION_ID }]);
    mockPrisma.regulatorySubmission.count.mockResolvedValue(1);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it('should return a single submission', async () => {
    mockPrisma.regulatorySubmission.findFirst.mockResolvedValue({
      id: SUBMISSION_ID,
      submission_type: 'tusla_sar_period_1',
    });

    const result = await service.findOne(TENANT_ID, SUBMISSION_ID);

    expect(result.submission_type).toBe('tusla_sar_period_1');
  });

  it('should throw NotFoundException when submission does not exist', async () => {
    mockPrisma.regulatorySubmission.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, SUBMISSION_ID)).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when updating non-existent submission', async () => {
    mockPrisma.regulatorySubmission.findFirst.mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, SUBMISSION_ID, USER_ID, { status: 'submitted' }),
    ).rejects.toThrow(NotFoundException);
  });

  // ─── findAll — filter branches ─────────────────────────────────────────────

  describe('RegulatorySubmissionService — findAll filters', () => {
    it('should apply domain filter', async () => {
      mockPrisma.regulatorySubmission.findMany.mockResolvedValue([]);
      mockPrisma.regulatorySubmission.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        domain: 'tusla_attendance',
      });

      expect(mockPrisma.regulatorySubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            domain: 'tusla_attendance',
          }),
        }),
      );
    });

    it('should apply status filter mapped to Prisma enum', async () => {
      mockPrisma.regulatorySubmission.findMany.mockResolvedValue([]);
      mockPrisma.regulatorySubmission.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'submitted',
      });

      expect(mockPrisma.regulatorySubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: expect.anything(),
          }),
        }),
      );
    });

    it('should apply academic_year filter', async () => {
      mockPrisma.regulatorySubmission.findMany.mockResolvedValue([]);
      mockPrisma.regulatorySubmission.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        academic_year: '2025-2026',
      });

      expect(mockPrisma.regulatorySubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            academic_year: '2025-2026',
          }),
        }),
      );
    });
  });

  // ─── update — field branches ───────────────────────────────────────────────

  describe('RegulatorySubmissionService — update branches', () => {
    it('should set submitted_at and submitted_by_id when status is submitted', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.regulatorySubmission.findFirst.mockResolvedValue({ id: SUBMISSION_ID });
      const mockTx = {
        regulatorySubmission: {
          update: jest.fn().mockResolvedValue({ id: SUBMISSION_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, SUBMISSION_ID, USER_ID, { status: 'submitted' });

      expect(mockTx.regulatorySubmission.update).toHaveBeenCalledWith({
        where: { id: SUBMISSION_ID },
        data: expect.objectContaining({
          submitted_at: expect.any(Date),
          submitted_by_id: USER_ID,
        }),
      });
    });

    it('should update file_key when provided', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.regulatorySubmission.findFirst.mockResolvedValue({ id: SUBMISSION_ID });
      const mockTx = {
        regulatorySubmission: {
          update: jest.fn().mockResolvedValue({ id: SUBMISSION_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, SUBMISSION_ID, USER_ID, { file_key: 'uploads/test.csv' });

      expect(mockTx.regulatorySubmission.update).toHaveBeenCalledWith({
        where: { id: SUBMISSION_ID },
        data: expect.objectContaining({
          file_key: 'uploads/test.csv',
        }),
      });
    });

    it('should update file_hash when provided', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.regulatorySubmission.findFirst.mockResolvedValue({ id: SUBMISSION_ID });
      const mockTx = {
        regulatorySubmission: {
          update: jest.fn().mockResolvedValue({ id: SUBMISSION_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, SUBMISSION_ID, USER_ID, { file_hash: 'abc123' });

      expect(mockTx.regulatorySubmission.update).toHaveBeenCalledWith({
        where: { id: SUBMISSION_ID },
        data: expect.objectContaining({
          file_hash: 'abc123',
        }),
      });
    });

    it('should update record_count when provided', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.regulatorySubmission.findFirst.mockResolvedValue({ id: SUBMISSION_ID });
      const mockTx = {
        regulatorySubmission: {
          update: jest.fn().mockResolvedValue({ id: SUBMISSION_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, SUBMISSION_ID, USER_ID, { record_count: 42 });

      expect(mockTx.regulatorySubmission.update).toHaveBeenCalledWith({
        where: { id: SUBMISSION_ID },
        data: expect.objectContaining({
          record_count: 42,
        }),
      });
    });

    it('should update notes when provided', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.regulatorySubmission.findFirst.mockResolvedValue({ id: SUBMISSION_ID });
      const mockTx = {
        regulatorySubmission: {
          update: jest.fn().mockResolvedValue({ id: SUBMISSION_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, SUBMISSION_ID, USER_ID, { notes: 'Updated notes' });

      expect(mockTx.regulatorySubmission.update).toHaveBeenCalledWith({
        where: { id: SUBMISSION_ID },
        data: expect.objectContaining({
          notes: 'Updated notes',
        }),
      });
    });

    it('should convert submitted_at string to Date', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.regulatorySubmission.findFirst.mockResolvedValue({ id: SUBMISSION_ID });
      const mockTx = {
        regulatorySubmission: {
          update: jest.fn().mockResolvedValue({ id: SUBMISSION_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, SUBMISSION_ID, USER_ID, {
        submitted_at: '2026-06-15T12:00:00Z',
      });

      expect(mockTx.regulatorySubmission.update).toHaveBeenCalledWith({
        where: { id: SUBMISSION_ID },
        data: expect.objectContaining({
          submitted_at: expect.any(Date),
        }),
      });
    });

    it('should set submitted_at to null when provided as null string', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.regulatorySubmission.findFirst.mockResolvedValue({ id: SUBMISSION_ID });
      const mockTx = {
        regulatorySubmission: {
          update: jest.fn().mockResolvedValue({ id: SUBMISSION_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, SUBMISSION_ID, USER_ID, {
        submitted_at: null as unknown as string,
      });

      expect(mockTx.regulatorySubmission.update).toHaveBeenCalledWith({
        where: { id: SUBMISSION_ID },
        data: expect.objectContaining({
          submitted_at: null,
        }),
      });
    });

    it('should set validation_errors to DbNull when null', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.regulatorySubmission.findFirst.mockResolvedValue({ id: SUBMISSION_ID });
      const mockTx = {
        regulatorySubmission: {
          update: jest.fn().mockResolvedValue({ id: SUBMISSION_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, SUBMISSION_ID, USER_ID, {
        validation_errors: null,
      });

      expect(mockTx.regulatorySubmission.update).toHaveBeenCalledWith({
        where: { id: SUBMISSION_ID },
        data: expect.objectContaining({
          validation_errors: expect.anything(),
        }),
      });
    });
  });
});
