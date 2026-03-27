import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';
import { GdprTokenService } from '../gdpr-token.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TENANT_ID = TENANT_A;
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OVERRIDE_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ENTITY_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const TOKEN_RECORD_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const VALID_CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ─── RLS mock ────────────────────────────────────────────────────────────────

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
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockRlsTx),
      ),
  }),
}));

// ─── Test Data Helpers ───────────────────────────────────────────────────────

const makePolicy = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: '11111111-1111-1111-1111-111111111111',
  export_type: 'ai_behaviour_analysis',
  tokenisation: 'always',
  lawful_basis: 'legitimate_interest',
  description: 'AI behaviour analysis export',
  created_at: new Date('2026-03-20T00:00:00Z'),
  ...overrides,
});

const makeOutboundData = () => ({
  entities: [
    {
      type: 'student' as const,
      id: ENTITY_ID,
      fields: {
        first_name: 'Alice',
        last_name: 'Smith',
      },
    },
  ],
  entityCount: 1,
});

const makeExistingToken = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id: TOKEN_RECORD_ID,
  tenant_id: TENANT_ID,
  entity_type: 'student',
  entity_id: ENTITY_ID,
  field_type: 'first_name',
  token: 'ABCDEFGHJKLMNP',
  created_at: new Date('2026-03-20T00:00:00Z'),
  last_used_at: new Date('2026-03-20T00:00:00Z'),
  ...overrides,
});

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('GdprTokenService', () => {
  let service: GdprTokenService;
  let mockPrisma: {
    gdprExportPolicy: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    gdprAnonymisationToken: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
    gdprTokenUsageLog: {
      findMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      gdprExportPolicy: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      gdprAnonymisationToken: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      gdprTokenUsageLog: {
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        (fn as jest.Mock).mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GdprTokenService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GdprTokenService>(GdprTokenService);
  });

  // ─── TOKEN GENERATION ────────────────────────────────────────────────────────

  describe('generateToken', () => {
    it('should return a 14-character string', () => {
      const token = service.generateToken();
      expect(token).toHaveLength(14);
    });

    it('should only use characters from the valid charset', () => {
      // Generate many tokens to increase confidence
      for (let i = 0; i < 100; i++) {
        const token = service.generateToken();
        for (const char of token) {
          expect(VALID_CHARSET).toContain(char);
        }
      }
    });

    it('should generate unique tokens across calls', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 50; i++) {
        tokens.add(service.generateToken());
      }
      // With 32^14 possible tokens, collisions are astronomically unlikely
      expect(tokens.size).toBe(50);
    });
  });

  // ─── POLICY ENFORCEMENT ──────────────────────────────────────────────────────

  describe('processOutbound — policy enforcement', () => {
    it('should throw NotFoundException when export policy does not exist', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue(null);

      await expect(
        service.processOutbound(
          TENANT_ID,
          'unknown_type',
          makeOutboundData(),
          USER_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should tokenise data when policy is "always"', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue(
        makePolicy({ tokenisation: 'always' }),
      );
      mockRlsTx.gdprAnonymisationToken.findFirst.mockResolvedValue(null);
      mockRlsTx.gdprAnonymisationToken.create.mockImplementation(
        async (args: { data: { token: string } }) => ({
          id: TOKEN_RECORD_ID,
          ...args.data,
        }),
      );
      mockRlsTx.gdprTokenUsageLog.create.mockResolvedValue({});

      const result = await service.processOutbound(
        TENANT_ID,
        'ai_behaviour_analysis',
        makeOutboundData(),
        USER_ID,
      );

      expect(result.tokenMap).not.toBeNull();
      // Fields should contain tokens, not original values
      const firstEntity = result.processedData.entities[0];
      expect(firstEntity).toBeDefined();
      expect(firstEntity!.fields.first_name).not.toBe('Alice');
      expect(firstEntity!.fields.last_name).not.toBe('Smith');
    });

    it('should throw BadRequestException when trying to override "always" policy', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue(
        makePolicy({ tokenisation: 'always' }),
      );

      await expect(
        service.processOutbound(
          TENANT_ID,
          'ai_behaviour_analysis',
          makeOutboundData(),
          USER_ID,
          { overrideTokenisation: false },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should pass data through unchanged when policy is "never"', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue(
        makePolicy({ tokenisation: 'never' }),
      );
      mockRlsTx.gdprTokenUsageLog.create.mockResolvedValue({});

      const data = makeOutboundData();
      const result = await service.processOutbound(
        TENANT_ID,
        'ai_behaviour_analysis',
        data,
        USER_ID,
      );

      expect(result.tokenMap).toBeNull();
      expect(result.processedData).toBe(data);
    });

    it('should throw BadRequestException when trying to override "never" policy to tokenise', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue(
        makePolicy({ tokenisation: 'never' }),
      );

      await expect(
        service.processOutbound(
          TENANT_ID,
          'ai_behaviour_analysis',
          makeOutboundData(),
          USER_ID,
          { overrideTokenisation: true },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should tokenise by default when policy is "configurable"', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue(
        makePolicy({ tokenisation: 'configurable' }),
      );
      mockRlsTx.gdprAnonymisationToken.findFirst.mockResolvedValue(null);
      mockRlsTx.gdprAnonymisationToken.create.mockImplementation(
        async (args: { data: { token: string } }) => ({
          id: TOKEN_RECORD_ID,
          ...args.data,
        }),
      );
      mockRlsTx.gdprTokenUsageLog.create.mockResolvedValue({});

      const result = await service.processOutbound(
        TENANT_ID,
        'ai_behaviour_analysis',
        makeOutboundData(),
        USER_ID,
      );

      expect(result.tokenMap).not.toBeNull();
    });

    it('should allow overriding "configurable" policy off with a reason', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue(
        makePolicy({ tokenisation: 'configurable' }),
      );
      mockRlsTx.gdprTokenUsageLog.create.mockResolvedValue({});

      const data = makeOutboundData();
      const result = await service.processOutbound(
        TENANT_ID,
        'ai_behaviour_analysis',
        data,
        USER_ID,
        {
          overrideTokenisation: false,
          overrideReason: 'Parent explicitly consented to data sharing',
          overrideByUserId: OVERRIDE_USER_ID,
        },
      );

      expect(result.tokenMap).toBeNull();
      expect(result.processedData).toBe(data);
    });

    it('should throw BadRequestException when overriding "configurable" without a reason', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue(
        makePolicy({ tokenisation: 'configurable' }),
      );

      await expect(
        service.processOutbound(
          TENANT_ID,
          'ai_behaviour_analysis',
          makeOutboundData(),
          USER_ID,
          { overrideTokenisation: false },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── TOKEN REUSE ─────────────────────────────────────────────────────────────

  describe('processOutbound — token reuse', () => {
    it('should reuse existing token for same entity+field', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue(
        makePolicy({ tokenisation: 'always' }),
      );

      const existingToken = makeExistingToken();
      // first_name has existing token, last_name does not
      mockRlsTx.gdprAnonymisationToken.findFirst
        .mockResolvedValueOnce(existingToken) // first_name lookup
        .mockResolvedValueOnce(null); // last_name lookup

      mockRlsTx.gdprAnonymisationToken.update.mockResolvedValue(existingToken);
      mockRlsTx.gdprAnonymisationToken.create.mockImplementation(
        async (args: { data: { token: string } }) => ({
          id: '22222222-2222-2222-2222-222222222222',
          ...args.data,
        }),
      );
      mockRlsTx.gdprTokenUsageLog.create.mockResolvedValue({});

      const result = await service.processOutbound(
        TENANT_ID,
        'ai_behaviour_analysis',
        makeOutboundData(),
        USER_ID,
      );

      // Existing token reused for first_name
      const firstEntity = result.processedData.entities[0];
      expect(firstEntity).toBeDefined();
      expect(firstEntity!.fields.first_name).toBe(
        'ABCDEFGHJKLMNP',
      );
      // update called for last_used_at
      expect(mockRlsTx.gdprAnonymisationToken.update).toHaveBeenCalledWith({
        where: { id: TOKEN_RECORD_ID },
        data: { last_used_at: expect.any(Date) },
      });
      // create called for last_name (new token)
      expect(mockRlsTx.gdprAnonymisationToken.create).toHaveBeenCalledTimes(1);
    });
  });

  // ─── AUDIT LOGGING ───────────────────────────────────────────────────────────

  describe('processOutbound — audit logging', () => {
    it('should create a usage log entry on every processOutbound call', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue(
        makePolicy({ tokenisation: 'never' }),
      );
      mockRlsTx.gdprTokenUsageLog.create.mockResolvedValue({});

      await service.processOutbound(
        TENANT_ID,
        'ai_behaviour_analysis',
        makeOutboundData(),
        USER_ID,
      );

      expect(mockRlsTx.gdprTokenUsageLog.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          export_type: 'ai_behaviour_analysis',
          tokenised: false,
          policy_applied: 'never',
          lawful_basis: 'legitimate_interest',
          tokens_used: [],
          entity_count: 1,
          triggered_by: USER_ID,
          override_by: null,
          override_reason: null,
        },
      });
    });

    it('should log override details when an override is applied', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue(
        makePolicy({ tokenisation: 'configurable' }),
      );
      mockRlsTx.gdprTokenUsageLog.create.mockResolvedValue({});

      await service.processOutbound(
        TENANT_ID,
        'ai_behaviour_analysis',
        makeOutboundData(),
        USER_ID,
        {
          overrideTokenisation: false,
          overrideReason: 'Parental consent given',
          overrideByUserId: OVERRIDE_USER_ID,
        },
      );

      expect(mockRlsTx.gdprTokenUsageLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          override_by: OVERRIDE_USER_ID,
          override_reason: 'Parental consent given',
          tokenised: false,
        }),
      });
    });
  });

  // ─── PROCESS INBOUND ─────────────────────────────────────────────────────────

  describe('processInbound', () => {
    it('should return response unchanged when tokenMap is null', async () => {
      const response = 'Student ABCDEFGHJKLMNP performed well.';
      const result = await service.processInbound(TENANT_ID, response, null);
      expect(result).toBe(response);
    });

    it('should return response unchanged when tokenMap is empty', async () => {
      const response = 'Student ABCDEFGHJKLMNP performed well.';
      const result = await service.processInbound(TENANT_ID, response, {});
      expect(result).toBe(response);
    });

    it('should replace all token occurrences with real values', async () => {
      const tokenMap = {
        ABCDEFGHJKLMNP: 'Alice',
        QRSTUVWXYZ2345: 'Smith',
      };
      const response =
        'Student ABCDEFGHJKLMNP QRSTUVWXYZ2345 performed well. ABCDEFGHJKLMNP is progressing.';

      const result = await service.processInbound(
        TENANT_ID,
        response,
        tokenMap,
      );

      expect(result).toBe(
        'Student Alice Smith performed well. Alice is progressing.',
      );
    });
  });

  // ─── DELETE TOKENS FOR ENTITY ─────────────────────────────────────────────────

  describe('deleteTokensForEntity', () => {
    it('should delete matching tokens and return count', async () => {
      mockRlsTx.gdprAnonymisationToken.deleteMany.mockResolvedValue({
        count: 3,
      });

      const result = await service.deleteTokensForEntity(
        TENANT_ID,
        'student',
        ENTITY_ID,
      );

      expect(result).toBe(3);
      expect(
        mockRlsTx.gdprAnonymisationToken.deleteMany,
      ).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          entity_type: 'student',
          entity_id: ENTITY_ID,
        },
      });
    });

    it('should return 0 when no tokens match', async () => {
      mockRlsTx.gdprAnonymisationToken.deleteMany.mockResolvedValue({
        count: 0,
      });

      const result = await service.deleteTokensForEntity(
        TENANT_ID,
        'student',
        ENTITY_ID,
      );

      expect(result).toBe(0);
    });
  });

  // ─── GET EXPORT POLICIES ──────────────────────────────────────────────────────

  describe('getExportPolicies', () => {
    it('should return all policies ordered by export_type', async () => {
      const policies = [
        makePolicy({ export_type: 'ai_attendance' }),
        makePolicy({ export_type: 'ai_behaviour_analysis' }),
      ];
      mockPrisma.gdprExportPolicy.findMany.mockResolvedValue(policies);

      const result = await service.getExportPolicies();

      expect(result).toEqual(policies);
      expect(mockPrisma.gdprExportPolicy.findMany).toHaveBeenCalledWith({
        orderBy: { export_type: 'asc' },
      });
    });
  });

  // ─── GET USAGE LOG ────────────────────────────────────────────────────────────

  describe('getUsageLog', () => {
    it('should return paginated results with correct meta', async () => {
      const logs = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          export_type: 'ai_behaviour_analysis',
          tokenised: true,
        },
      ];
      mockPrisma.gdprTokenUsageLog.findMany.mockResolvedValue(logs);
      mockPrisma.gdprTokenUsageLog.count.mockResolvedValue(1);

      const result = await service.getUsageLog(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toEqual(logs);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should filter by export_type when provided', async () => {
      mockPrisma.gdprTokenUsageLog.findMany.mockResolvedValue([]);
      mockPrisma.gdprTokenUsageLog.count.mockResolvedValue(0);

      await service.getUsageLog(TENANT_ID, {
        page: 1,
        pageSize: 20,
        export_type: 'ai_behaviour_analysis',
      });

      expect(mockPrisma.gdprTokenUsageLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            export_type: 'ai_behaviour_analysis',
          }),
        }),
      );
    });

    it('should filter by date range when provided', async () => {
      mockPrisma.gdprTokenUsageLog.findMany.mockResolvedValue([]);
      mockPrisma.gdprTokenUsageLog.count.mockResolvedValue(0);

      await service.getUsageLog(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_from: '2026-03-01T00:00:00Z',
        date_to: '2026-03-31T23:59:59Z',
      });

      expect(mockPrisma.gdprTokenUsageLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            created_at: {
              gte: new Date('2026-03-01T00:00:00Z'),
              lte: new Date('2026-03-31T23:59:59Z'),
            },
          }),
        }),
      );
    });

    it('should apply correct skip for pagination', async () => {
      mockPrisma.gdprTokenUsageLog.findMany.mockResolvedValue([]);
      mockPrisma.gdprTokenUsageLog.count.mockResolvedValue(50);

      await service.getUsageLog(TENANT_ID, { page: 3, pageSize: 10 });

      expect(mockPrisma.gdprTokenUsageLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });
  });

  // ─── GET USAGE STATS ─────────────────────────────────────────────────────────

  describe('getUsageStats', () => {
    it('should return total tokens, usage by service, and usage by month', async () => {
      mockPrisma.gdprAnonymisationToken.count.mockResolvedValue(42);

      mockPrisma.gdprTokenUsageLog.groupBy.mockResolvedValue([
        { export_type: 'ai_behaviour_analysis', _count: { id: 10 } },
        { export_type: 'ai_attendance', _count: { id: 5 } },
      ]);

      mockPrisma.gdprTokenUsageLog.findMany.mockResolvedValue([
        { created_at: new Date('2026-01-15T10:00:00Z') },
        { created_at: new Date('2026-01-20T10:00:00Z') },
        { created_at: new Date('2026-02-05T10:00:00Z') },
      ]);

      const result = await service.getUsageStats(TENANT_ID, {});

      expect(result.totalTokensGenerated).toBe(42);
      expect(result.usageByService).toEqual([
        { export_type: 'ai_behaviour_analysis', count: 10 },
        { export_type: 'ai_attendance', count: 5 },
      ]);
      expect(result.usageByMonth).toEqual([
        { month: '2026-01', count: 2 },
        { month: '2026-02', count: 1 },
      ]);
    });
  });

  // ─── RLS TENANT ISOLATION ─────────────────────────────────────────────────

  describe('RLS tenant isolation', () => {
    it('should scope token lookup to the calling tenant during processOutbound', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue(
        makePolicy({ tokenisation: 'always' }),
      );
      mockRlsTx.gdprAnonymisationToken.findFirst.mockResolvedValue(null);
      mockRlsTx.gdprAnonymisationToken.create.mockImplementation(
        async (args: { data: { token: string } }) => ({
          id: TOKEN_RECORD_ID,
          ...args.data,
        }),
      );
      mockRlsTx.gdprTokenUsageLog.create.mockResolvedValue({});

      await service.processOutbound(
        TENANT_A,
        'ai_behaviour_analysis',
        makeOutboundData(),
        USER_ID,
      );

      // Verify every findFirst call includes tenant_id: TENANT_A
      for (const call of mockRlsTx.gdprAnonymisationToken.findFirst.mock
        .calls) {
        expect(call[0]).toEqual(
          expect.objectContaining({
            where: expect.objectContaining({ tenant_id: TENANT_A }),
          }),
        );
      }
    });

    it('should scope usage log queries to the calling tenant in getUsageLog', async () => {
      mockPrisma.gdprTokenUsageLog.findMany.mockResolvedValue([]);
      mockPrisma.gdprTokenUsageLog.count.mockResolvedValue(0);

      await service.getUsageLog(TENANT_A, { page: 1, pageSize: 20 });

      expect(mockPrisma.gdprTokenUsageLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: TENANT_A }),
        }),
      );
      expect(mockPrisma.gdprTokenUsageLog.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: TENANT_A }),
        }),
      );
    });

    it('should perform independent token lookups per tenant, preventing cross-tenant leakage', async () => {
      mockPrisma.gdprExportPolicy.findUnique.mockResolvedValue(
        makePolicy({ tokenisation: 'always' }),
      );
      mockRlsTx.gdprAnonymisationToken.findFirst.mockResolvedValue(null);
      mockRlsTx.gdprAnonymisationToken.create.mockImplementation(
        async (args: { data: { token: string } }) => ({
          id: TOKEN_RECORD_ID,
          ...args.data,
        }),
      );
      mockRlsTx.gdprTokenUsageLog.create.mockResolvedValue({});

      // Process outbound for Tenant A
      await service.processOutbound(
        TENANT_A,
        'ai_behaviour_analysis',
        makeOutboundData(),
        USER_ID,
      );

      const callsAfterTenantA =
        mockRlsTx.gdprAnonymisationToken.findFirst.mock.calls.length;

      // Reset mocks to track Tenant B independently
      mockRlsTx.gdprAnonymisationToken.findFirst.mockReset();
      mockRlsTx.gdprAnonymisationToken.findFirst.mockResolvedValue(null);
      mockRlsTx.gdprAnonymisationToken.create.mockReset();
      mockRlsTx.gdprAnonymisationToken.create.mockImplementation(
        async (args: { data: { token: string } }) => ({
          id: '99999999-9999-9999-9999-999999999999',
          ...args.data,
        }),
      );
      mockRlsTx.gdprTokenUsageLog.create.mockReset();
      mockRlsTx.gdprTokenUsageLog.create.mockResolvedValue({});

      // Process outbound for Tenant B with the same entity
      await service.processOutbound(
        TENANT_B,
        'ai_behaviour_analysis',
        makeOutboundData(),
        USER_ID,
      );

      // Tenant A had findFirst calls before reset
      expect(callsAfterTenantA).toBeGreaterThan(0);

      // All findFirst calls after reset must scope to TENANT_B
      for (const call of mockRlsTx.gdprAnonymisationToken.findFirst.mock
        .calls) {
        expect(call[0]).toEqual(
          expect.objectContaining({
            where: expect.objectContaining({ tenant_id: TENANT_B }),
          }),
        );
      }

      // Verify create calls also scope to TENANT_B
      for (const call of mockRlsTx.gdprAnonymisationToken.create.mock
        .calls) {
        expect(call[0]).toEqual(
          expect.objectContaining({
            data: expect.objectContaining({ tenant_id: TENANT_B }),
          }),
        );
      }
    });

    it('should scope deleteTokensForEntity to the calling tenant', async () => {
      mockRlsTx.gdprAnonymisationToken.deleteMany.mockResolvedValue({
        count: 2,
      });

      await service.deleteTokensForEntity(TENANT_A, 'student', ENTITY_ID);

      expect(
        mockRlsTx.gdprAnonymisationToken.deleteMany,
      ).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_A,
          entity_type: 'student',
          entity_id: ENTITY_ID,
        },
      });

      // Verify the tenant_id is specifically TENANT_A, not TENANT_B
      const deleteCall =
        mockRlsTx.gdprAnonymisationToken.deleteMany.mock.calls[0];
      expect(deleteCall[0].where.tenant_id).toBe(TENANT_A);
      expect(deleteCall[0].where.tenant_id).not.toBe(TENANT_B);
    });
  });
});
