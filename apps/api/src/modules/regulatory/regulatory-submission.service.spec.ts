import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RegulatorySubmissionService } from './regulatory-submission.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
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
      providers: [
        RegulatorySubmissionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
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
        create: jest.fn().mockResolvedValue({ id: SUBMISSION_ID, submission_type: 'tusla_sar_period_1' }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
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
});
