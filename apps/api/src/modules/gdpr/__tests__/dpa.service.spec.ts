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
      $transaction: jest
        .fn()
        .mockImplementation(
          async (fn: (tx: ReturnType<typeof buildMockPrisma>) => Promise<unknown>) =>
            fn(mockPrisma),
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

  // ─── Expanded coverage ─────────────────────────────────────────────────────

  describe('DpaService -- getCurrentVersion', () => {
    it('should throw NotFoundException when no active DPA version exists', async () => {
      mockPrisma.dpaVersion.findFirst.mockResolvedValue(null);

      await expect(service.getCurrentVersion()).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({ code: 'DPA_VERSION_NOT_FOUND' }),
          }),
        }),
      );
    });

    it('should call ensureSeeded before querying DPA versions', async () => {
      mockPrisma.dpaVersion.findFirst.mockResolvedValue({
        id: 'version-id',
        version: '2026.03',
        content_html: '<section>DPA</section>',
        content_hash: 'hash-current',
        effective_date: new Date('2026-03-27'),
        superseded_at: null,
        created_at: new Date('2026-03-27T00:00:00Z'),
      });

      await service.getCurrentVersion();

      expect(mockPlatformLegalService.ensureSeeded).toHaveBeenCalledTimes(1);
      expect(mockPrisma.dpaVersion.findFirst).toHaveBeenCalledWith({
        where: { superseded_at: null },
        orderBy: [{ effective_date: 'desc' }, { created_at: 'desc' }],
      });
    });
  });

  describe('DpaService -- hasAccepted', () => {
    it('should return false when tenant has not accepted the version', async () => {
      mockPrisma.dataProcessingAgreement.findFirst.mockResolvedValue(null);

      const accepted = await service.hasAccepted(TENANT_ID, '2026.03');

      expect(accepted).toBe(false);
    });
  });

  describe('DpaService -- getStatus', () => {
    it('should report accepted=true when the current version is accepted', async () => {
      mockPrisma.dpaVersion.findFirst.mockResolvedValue({
        id: 'version-id',
        version: '2026.03',
        content_html: '<section>DPA</section>',
        content_hash: 'hash-current',
        effective_date: new Date('2026-03-27'),
        superseded_at: null,
        created_at: new Date('2026-03-27T00:00:00Z'),
      });
      const acceptance = {
        id: 'acceptance-id',
        tenant_id: TENANT_ID,
        dpa_version: '2026.03',
        accepted_by_user_id: USER_ID,
        accepted_at: new Date('2026-03-28T10:00:00Z'),
        dpa_content_hash: 'hash-current',
        ip_address: '127.0.0.1',
        created_at: new Date('2026-03-28T10:00:00Z'),
      };
      mockPrisma.dataProcessingAgreement.findFirst.mockResolvedValue(acceptance);
      mockPrisma.dataProcessingAgreement.findMany.mockResolvedValue([acceptance]);

      const result = await service.getStatus(TENANT_ID);

      expect(result.accepted).toBe(true);
      expect(result.accepted_version).toBe('2026.03');
      expect(result.accepted_by_user_id).toBe(USER_ID);
      expect(result.accepted_at).toEqual(new Date('2026-03-28T10:00:00Z'));
    });

    it('should include the current_version object in the status response', async () => {
      const currentVersion = {
        id: 'version-id',
        version: '2026.03',
        content_html: '<section>DPA</section>',
        content_hash: 'hash-current',
        effective_date: new Date('2026-03-27'),
        superseded_at: null,
        created_at: new Date('2026-03-27T00:00:00Z'),
      };
      mockPrisma.dpaVersion.findFirst.mockResolvedValue(currentVersion);
      mockPrisma.dataProcessingAgreement.findFirst.mockResolvedValue(null);
      mockPrisma.dataProcessingAgreement.findMany.mockResolvedValue([]);

      const result = await service.getStatus(TENANT_ID);

      expect(result.current_version).toEqual(currentVersion);
    });
  });

  describe('DpaService -- acceptCurrentVersion', () => {
    it('should return existing acceptance idempotently if already accepted', async () => {
      mockPrisma.dpaVersion.findFirst.mockResolvedValue({
        id: 'version-id',
        version: '2026.03',
        content_html: '<section>DPA</section>',
        content_hash: 'hash-current',
        effective_date: new Date('2026-03-27'),
        superseded_at: null,
        created_at: new Date('2026-03-27T00:00:00Z'),
      });
      const existingAcceptance = {
        id: 'existing-acceptance',
        dpa_version: '2026.03',
        tenant_id: TENANT_ID,
        accepted_by_user_id: USER_ID,
      };
      mockPrisma.dataProcessingAgreement.findFirst.mockResolvedValue(existingAcceptance);

      const result = await service.acceptCurrentVersion(TENANT_ID, USER_ID);

      expect(result).toEqual(existingAcceptance);
      expect(mockPrisma.dataProcessingAgreement.create).not.toHaveBeenCalled();
    });

    it('should store null for ip_address when not provided', async () => {
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

      await service.acceptCurrentVersion(TENANT_ID, USER_ID);

      expect(mockPrisma.dataProcessingAgreement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ip_address: null }),
      });
    });
  });
});
