import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RegulatoryTuslaMappingsService } from './regulatory-tusla-mappings.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MAPPING_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('RegulatoryTuslaMappingsService', () => {
  let service: RegulatoryTuslaMappingsService;
  let mockPrisma: {
    tuslaAbsenceCodeMapping: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      tuslaAbsenceCodeMapping: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: MAPPING_ID, display_label: 'Test' }),
        delete: jest.fn().mockResolvedValue({ id: MAPPING_ID }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryTuslaMappingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RegulatoryTuslaMappingsService>(RegulatoryTuslaMappingsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a tusla absence code mapping', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      tuslaAbsenceCodeMapping: {
        create: jest.fn().mockResolvedValue({ id: MAPPING_ID, display_label: 'Illness' }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.create(TENANT_ID, {
      attendance_status: 'absent_excused',
      tusla_category: 'illness',
      display_label: 'Illness',
      is_default: true,
    });

    expect(result).toEqual({ id: MAPPING_ID, display_label: 'Illness' });
  });

  it('should return all tusla mappings for a tenant', async () => {
    mockPrisma.tuslaAbsenceCodeMapping.findMany.mockResolvedValue([
      { id: MAPPING_ID, display_label: 'Illness' },
    ]);

    const result = await service.findAll(TENANT_ID);

    expect(result).toHaveLength(1);
    expect(mockPrisma.tuslaAbsenceCodeMapping.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID },
      orderBy: { created_at: 'asc' },
    });
  });

  it('should remove a tusla mapping', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    mockPrisma.tuslaAbsenceCodeMapping.findFirst.mockResolvedValue({ id: MAPPING_ID });
    const mockTx = {
      tuslaAbsenceCodeMapping: {
        delete: jest.fn().mockResolvedValue({ id: MAPPING_ID }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    await service.remove(TENANT_ID, MAPPING_ID);

    expect(mockTx.tuslaAbsenceCodeMapping.delete).toHaveBeenCalledWith({ where: { id: MAPPING_ID } });
  });

  it('should throw NotFoundException when removing non-existent mapping', async () => {
    mockPrisma.tuslaAbsenceCodeMapping.findFirst.mockResolvedValue(null);

    await expect(service.remove(TENANT_ID, MAPPING_ID)).rejects.toThrow(NotFoundException);
  });
});
