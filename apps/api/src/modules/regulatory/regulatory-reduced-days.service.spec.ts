import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RegulatoryReducedDaysService } from './regulatory-reduced-days.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RECORD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

describe('RegulatoryReducedDaysService', () => {
  let service: RegulatoryReducedDaysService;
  let mockPrisma: {
    reducedSchoolDay: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      reducedSchoolDay: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: RECORD_ID, student_id: STUDENT_ID }),
        update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        delete: jest.fn().mockResolvedValue({ id: RECORD_ID }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryReducedDaysService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RegulatoryReducedDaysService>(RegulatoryReducedDaysService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a reduced school day record', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      reducedSchoolDay: {
        create: jest.fn().mockResolvedValue({ id: RECORD_ID, student_id: STUDENT_ID }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.create(TENANT_ID, USER_ID, {
      student_id: STUDENT_ID,
      start_date: '2026-01-15',
      hours_per_day: 3.5,
      reason: 'medical_needs',
    });

    expect(result).toEqual({ id: RECORD_ID, student_id: STUDENT_ID });
  });

  it('should return paginated reduced school days', async () => {
    mockPrisma.reducedSchoolDay.findMany.mockResolvedValue([{ id: RECORD_ID }]);
    mockPrisma.reducedSchoolDay.count.mockResolvedValue(1);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it('should filter by student_id and is_active', async () => {
    mockPrisma.reducedSchoolDay.findMany.mockResolvedValue([]);
    mockPrisma.reducedSchoolDay.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, student_id: STUDENT_ID, is_active: true });

    expect(mockPrisma.reducedSchoolDay.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT_ID, student_id: STUDENT_ID, is_active: true },
      }),
    );
  });

  it('should return a single reduced school day', async () => {
    mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID, student_id: STUDENT_ID });

    const result = await service.findOne(TENANT_ID, RECORD_ID);

    expect(result.id).toBe(RECORD_ID);
  });

  it('should throw NotFoundException when record does not exist', async () => {
    mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, RECORD_ID)).rejects.toThrow(NotFoundException);
  });

  it('should update a reduced school day', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID });
    const mockTx = {
      reducedSchoolDay: {
        update: jest.fn().mockResolvedValue({ id: RECORD_ID, is_active: false }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.update(TENANT_ID, RECORD_ID, { is_active: false });

    expect(result).toEqual({ id: RECORD_ID, is_active: false });
  });

  it('should throw NotFoundException when updating non-existent record', async () => {
    mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue(null);

    await expect(service.update(TENANT_ID, RECORD_ID, { is_active: false })).rejects.toThrow(NotFoundException);
  });

  it('should remove a reduced school day', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID });
    const mockTx = {
      reducedSchoolDay: {
        delete: jest.fn().mockResolvedValue({ id: RECORD_ID }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    await service.remove(TENANT_ID, RECORD_ID);

    expect(mockTx.reducedSchoolDay.delete).toHaveBeenCalledWith({ where: { id: RECORD_ID } });
  });

  it('should throw NotFoundException when removing non-existent record', async () => {
    mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue(null);

    await expect(service.remove(TENANT_ID, RECORD_ID)).rejects.toThrow(NotFoundException);
  });
});
