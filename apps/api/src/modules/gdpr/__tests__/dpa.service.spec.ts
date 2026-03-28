/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { DpaService } from '../dpa.service';
import { PlatformLegalService } from '../platform-legal.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function buildMockPrisma() {
  return {
    dpaVersion: {
      findFirst: jest.fn(),
    },
    dataProcessingAgreement: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };
}

describe('DpaService', () => {
  let service: DpaService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  const mockCreateRlsClient = createRlsClient as jest.Mock;
  const mockPlatformLegalService = {
    ensureSeeded: jest.fn(),
  };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockCreateRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(
        async (fn: (tx: ReturnType<typeof buildMockPrisma>) => Promise<unknown>) => fn(mockPrisma),
      ),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DpaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PlatformLegalService, useValue: mockPlatformLegalService },
      ],
    }).compile();

    service = module.get<DpaService>(DpaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should treat acceptance of an older DPA version as not accepted for the current version', async () => {
    mockPrisma.dpaVersion.findFirst.mockResolvedValue({
      id: 'version-id',
      version: '2026.04',
      content_html: '<section>Current DPA</section>',
      content_hash: 'hash-current',
      effective_date: new Date('2026-04-01'),
      superseded_at: null,
      created_at: new Date('2026-04-01T00:00:00Z'),
    });
    mockPrisma.dataProcessingAgreement.findFirst.mockResolvedValue(null);
    mockPrisma.dataProcessingAgreement.findMany.mockResolvedValue([
      {
        id: 'old-acceptance',
        tenant_id: TENANT_ID,
        dpa_version: '2026.03',
        accepted_by_user_id: USER_ID,
        accepted_at: new Date('2026-03-27T09:00:00Z'),
        dpa_content_hash: 'hash-old',
        ip_address: null,
        created_at: new Date('2026-03-27T09:00:00Z'),
      },
    ]);

    const result = await service.getStatus(TENANT_ID);

    expect(result.accepted).toBe(false);
    expect(result.accepted_version).toBeNull();
    expect(result.history).toHaveLength(1);
    expect(mockPrisma.dataProcessingAgreement.findFirst).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        dpa_version: '2026.04',
      },
      orderBy: { accepted_at: 'desc' },
    });
  });

  it('should report acceptance when the current version has already been accepted', async () => {
    mockPrisma.dataProcessingAgreement.findFirst.mockResolvedValue({ id: 'acceptance-id' });

    const accepted = await service.hasAccepted(TENANT_ID, '2026.03');

    expect(accepted).toBe(true);
    expect(mockPrisma.dataProcessingAgreement.findFirst).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        dpa_version: '2026.03',
      },
      select: { id: true },
    });
  });

  it('should create an acceptance record for the current version when one does not already exist', async () => {
    mockPrisma.dpaVersion.findFirst.mockResolvedValue({
      id: 'version-id',
      version: '2026.03',
      content_html: '<section>DPA</section>',
      content_hash: 'hash-current',
      effective_date: new Date('2026-03-27'),
      superseded_at: null,
      created_at: new Date('2026-03-27T00:00:00Z'),
    });
    mockPrisma.dataProcessingAgreement.findFirst.mockResolvedValue(null);
    mockPrisma.dataProcessingAgreement.create.mockResolvedValue({
      id: 'acceptance-id',
      dpa_version: '2026.03',
    });

    const result = await service.acceptCurrentVersion(TENANT_ID, USER_ID, '127.0.0.1');

    expect(result).toEqual({
      id: 'acceptance-id',
      dpa_version: '2026.03',
    });
    expect(mockCreateRlsClient).toHaveBeenCalledWith(mockPrisma, {
      tenant_id: TENANT_ID,
      user_id: USER_ID,
    });
    expect(mockPrisma.dataProcessingAgreement.create).toHaveBeenCalledWith({
      data: {
        tenant_id: TENANT_ID,
        dpa_version: '2026.03',
        accepted_by_user_id: USER_ID,
        dpa_content_hash: 'hash-current',
        ip_address: '127.0.0.1',
      },
    });
  });
});
