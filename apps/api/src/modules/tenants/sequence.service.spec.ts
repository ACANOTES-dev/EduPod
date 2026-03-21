import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { SequenceService } from './sequence.service';

describe('SequenceService', () => {
  let service: SequenceService;
  let mockTx: {
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
  };
  let mockPrisma: {
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    $extends: jest.Mock;
  };

  beforeEach(async () => {
    mockTx = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    };
    mockPrisma = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      $extends: jest.fn().mockReturnValue({
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SequenceService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SequenceService>(SequenceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';

  it('should generate application number', async () => {
    mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(0) }]);
    mockTx.$executeRaw.mockResolvedValue(1);

    const result = await service.nextNumber(TENANT_ID, 'application');

    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(result).toBe(`APP-${yearMonth}-000001`);
    expect(mockTx.$queryRaw).toHaveBeenCalled();
    expect(mockTx.$executeRaw).toHaveBeenCalled();
  });

  it('should increment sequentially', async () => {
    mockTx.$queryRaw.mockResolvedValueOnce([{ current_value: BigInt(0) }]);
    mockTx.$executeRaw.mockResolvedValueOnce(1);

    const first = await service.nextNumber(TENANT_ID, 'application');

    mockTx.$queryRaw.mockResolvedValueOnce([{ current_value: BigInt(1) }]);
    mockTx.$executeRaw.mockResolvedValueOnce(1);

    const second = await service.nextNumber(TENANT_ID, 'application');

    expect(first).toMatch(/000001$/);
    expect(second).toMatch(/000002$/);
  });

  it('should throw for missing sequence type', async () => {
    mockTx.$queryRaw.mockResolvedValue([]);

    await expect(
      service.nextNumber(TENANT_ID, 'nonexistent'),
    ).rejects.toThrow('Sequence type "nonexistent" not found');
  });

  it('should format correctly at high numbers', async () => {
    mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(999999) }]);
    mockTx.$executeRaw.mockResolvedValue(1);

    const result = await service.nextNumber(TENANT_ID, 'application');

    expect(result).toMatch(/1000000$/);
  });

  it('should use provided transaction client when given', async () => {
    const mockTx = {
      $queryRaw: jest.fn().mockResolvedValue([{ current_value: BigInt(5) }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };

    const result = await service.nextNumber(TENANT_ID, 'application', mockTx);

    expect(result).toMatch(/000006$/);
    expect(mockTx.$queryRaw).toHaveBeenCalled();
    // Original prisma should NOT have been called
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
  });
});
