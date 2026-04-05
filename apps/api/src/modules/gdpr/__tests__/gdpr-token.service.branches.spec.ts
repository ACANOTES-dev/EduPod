import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { GdprTokenService } from '../gdpr-token.service';

// ─── Constants ─────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// ─── RLS mock ──────────────────────────────────────────────────────────────

const mockRlsTx = {
  gdprAnonymisationToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  gdprTokenUsageLog: {
    create: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Test Suite — Branch Coverage ──────────────────────────────────────────

describe('GdprTokenService — branch coverage', () => {
  let service: GdprTokenService;
  let mockPrisma: {
    gdprExportPolicy: { findUnique: jest.Mock; findMany: jest.Mock };
    gdprAnonymisationToken: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    gdprTokenUsageLog: { findMany: jest.Mock; count: jest.Mock; groupBy: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      gdprExportPolicy: { findUnique: jest.fn(), findMany: jest.fn() },
      gdprAnonymisationToken: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      gdprTokenUsageLog: { findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn() },
    };

    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        (fn as jest.Mock).mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [GdprTokenService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<GdprTokenService>(GdprTokenService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getUsageStats — date filter branches ────────────────────────────────

  describe('GdprTokenService — getUsageStats date filter branches', () => {
    it('should apply date_from filter only when provided', async () => {
      mockPrisma.gdprAnonymisationToken.count.mockResolvedValue(0);
      mockPrisma.gdprTokenUsageLog.groupBy.mockResolvedValue([]);
      mockPrisma.gdprTokenUsageLog.findMany.mockResolvedValue([]);

      await service.getUsageStats(TENANT_ID, { date_from: '2026-01-01' });

      expect(mockPrisma.gdprAnonymisationToken.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          created_at: expect.objectContaining({
            gte: new Date('2026-01-01'),
          }),
        }),
      });
    });

    it('should apply date_to filter only when provided', async () => {
      mockPrisma.gdprAnonymisationToken.count.mockResolvedValue(0);
      mockPrisma.gdprTokenUsageLog.groupBy.mockResolvedValue([]);
      mockPrisma.gdprTokenUsageLog.findMany.mockResolvedValue([]);

      await service.getUsageStats(TENANT_ID, { date_to: '2026-12-31' });

      expect(mockPrisma.gdprAnonymisationToken.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          created_at: expect.objectContaining({
            lte: new Date('2026-12-31'),
          }),
        }),
      });
    });

    it('should apply both date_from and date_to when both provided', async () => {
      mockPrisma.gdprAnonymisationToken.count.mockResolvedValue(0);
      mockPrisma.gdprTokenUsageLog.groupBy.mockResolvedValue([]);
      mockPrisma.gdprTokenUsageLog.findMany.mockResolvedValue([]);

      await service.getUsageStats(TENANT_ID, {
        date_from: '2026-01-01',
        date_to: '2026-12-31',
      });

      expect(mockPrisma.gdprAnonymisationToken.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          created_at: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-12-31'),
          },
        }),
      });
    });
  });

  // ─── getUsageLog — date_from only ─────────────────────────────────────────

  describe('GdprTokenService — getUsageLog date filter branches', () => {
    it('should apply date_from filter only', async () => {
      mockPrisma.gdprTokenUsageLog.findMany.mockResolvedValue([]);
      mockPrisma.gdprTokenUsageLog.count.mockResolvedValue(0);

      await service.getUsageLog(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_from: '2026-03-01T00:00:00Z',
      });

      expect(mockPrisma.gdprTokenUsageLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({
              gte: new Date('2026-03-01T00:00:00Z'),
            }),
          }),
        }),
      );
    });

    it('should apply date_to filter only', async () => {
      mockPrisma.gdprTokenUsageLog.findMany.mockResolvedValue([]);
      mockPrisma.gdprTokenUsageLog.count.mockResolvedValue(0);

      await service.getUsageLog(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_to: '2026-03-31T23:59:59Z',
      });

      expect(mockPrisma.gdprTokenUsageLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({
              lte: new Date('2026-03-31T23:59:59Z'),
            }),
          }),
        }),
      );
    });
  });

  // ─── processOutbound — empty entities array with tokenisation ──────────────

  describe('GdprTokenService — processOutbound empty entities', () => {
    it('should skip tokenisation when entities array is empty (even with always policy)', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue({
        id: 'policy-id',
        export_type: 'test',
        tokenisation: 'always',
        lawful_basis: 'legitimate_interest',
      });
      mockRlsTx.gdprTokenUsageLog.create.mockResolvedValue({});

      const data = { entities: [], entityCount: 0 };
      const result = await service.processOutbound(TENANT_ID, 'test', data, 'user-id');

      // Empty entities = no tokenisation even with always policy
      expect(result.processedData).toBe(data);
      expect(result.tokenMap).toBeNull();
    });
  });

  // ─── resolveTokenisation — default case (unknown policy) ──────────────────

  describe('GdprTokenService — resolveTokenisation default branch', () => {
    it('should default to tokenised=true for unknown policy tokenisation value', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue({
        id: 'policy-id',
        export_type: 'test',
        tokenisation: 'unknown_value', // Not 'always', 'never', or 'configurable'
        lawful_basis: 'legitimate_interest',
      });
      mockRlsTx.gdprAnonymisationToken.findFirst.mockResolvedValue(null);
      mockRlsTx.gdprAnonymisationToken.create.mockImplementation(
        async (args: { data: { token: string } }) => ({
          id: 'token-id',
          ...args.data,
        }),
      );
      mockRlsTx.gdprTokenUsageLog.create.mockResolvedValue({});

      const data = {
        entities: [{ type: 'student' as const, id: 'entity-1', fields: { name: 'Test' } }],
        entityCount: 1,
      };

      const result = await service.processOutbound(TENANT_ID, 'test', data, 'user-id');

      // Default case should tokenise
      expect(result.tokenMap).not.toBeNull();
    });
  });

  // ─── processOutbound — configurable policy with override=true explicitly ──

  describe('GdprTokenService — configurable with overrideTokenisation true', () => {
    it('should tokenise when configurable policy gets overrideTokenisation=true', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue({
        id: 'policy-id',
        export_type: 'test',
        tokenisation: 'configurable',
        lawful_basis: 'legitimate_interest',
      });
      mockRlsTx.gdprAnonymisationToken.findFirst.mockResolvedValue(null);
      mockRlsTx.gdprAnonymisationToken.create.mockImplementation(
        async (args: { data: { token: string } }) => ({
          id: 'token-id',
          ...args.data,
        }),
      );
      mockRlsTx.gdprTokenUsageLog.create.mockResolvedValue({});

      const data = {
        entities: [{ type: 'student' as const, id: 'entity-1', fields: { name: 'Test' } }],
        entityCount: 1,
      };

      const result = await service.processOutbound(TENANT_ID, 'test', data, 'user-id', {
        overrideTokenisation: true,
      });

      expect(result.tokenMap).not.toBeNull();
    });
  });
});
