import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RegulatoryDesMappingsService } from './regulatory-des-mappings.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const MAPPING_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SUBJECT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

describe('RegulatoryDesMappingsService', () => {
  let service: RegulatoryDesMappingsService;
  let mockPrisma: {
    desSubjectCodeMapping: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      desSubjectCodeMapping: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: MAPPING_ID, des_code: 'MA01' }),
        delete: jest.fn().mockResolvedValue({ id: MAPPING_ID }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryDesMappingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RegulatoryDesMappingsService>(RegulatoryDesMappingsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create/upsert a DES subject code mapping', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      desSubjectCodeMapping: {
        upsert: jest.fn().mockResolvedValue({ id: MAPPING_ID, des_code: 'MA01', des_name: 'Mathematics' }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.create(TENANT_ID, {
      subject_id: SUBJECT_ID,
      des_code: 'MA01',
      des_name: 'Mathematics',
      is_verified: true,
    });

    expect(result).toEqual({ id: MAPPING_ID, des_code: 'MA01', des_name: 'Mathematics' });
  });

  it('should return all DES mappings for a tenant with subject info', async () => {
    mockPrisma.desSubjectCodeMapping.findMany.mockResolvedValue([
      { id: MAPPING_ID, des_code: 'MA01', subject: { id: SUBJECT_ID, name: 'Maths' } },
    ]);

    const result = await service.findAll(TENANT_ID);

    expect(result).toHaveLength(1);
    expect(mockPrisma.desSubjectCodeMapping.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID },
      orderBy: { created_at: 'asc' },
      include: { subject: { select: { id: true, name: true } } },
    });
  });

  it('should remove a DES mapping', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    mockPrisma.desSubjectCodeMapping.findFirst.mockResolvedValue({ id: MAPPING_ID });
    const mockTx = {
      desSubjectCodeMapping: {
        delete: jest.fn().mockResolvedValue({ id: MAPPING_ID }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    await service.remove(TENANT_ID, MAPPING_ID);

    expect(mockTx.desSubjectCodeMapping.delete).toHaveBeenCalledWith({ where: { id: MAPPING_ID } });
  });

  it('should throw NotFoundException when removing non-existent DES mapping', async () => {
    mockPrisma.desSubjectCodeMapping.findFirst.mockResolvedValue(null);

    await expect(service.remove(TENANT_ID, MAPPING_ID)).rejects.toThrow(NotFoundException);
  });
});
