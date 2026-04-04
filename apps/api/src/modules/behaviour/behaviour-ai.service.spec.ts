/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('@school/shared/ai', () => {
  const original = jest.requireActual('@school/shared/ai');
  return {
    ...original,
    anonymiseForAI: jest.fn().mockReturnValue({
      anonymised: { overview: { total_incidents: 10 } },
      tokenMap: new Map([['Student-A', 'John Doe']]),
    }),
    deAnonymiseFromAI: jest
      .fn()
      .mockImplementation((text: string) => text.replace('Student-A', 'John Doe')),
  };
});

import { anonymiseForAI, deAnonymiseFromAI } from '@school/shared/ai';

import { MOCK_FACADE_PROVIDERS, AuditLogReadFacade } from '../../common/tests/mock-facades';
import { AnthropicClientService } from '../ai/anthropic-client.service';
import { AiAuditService } from '../gdpr/ai-audit.service';
import { GdprTokenService } from '../gdpr/gdpr-token.service';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourAIService } from './behaviour-ai.service';
import { BehaviourAnalyticsService } from './behaviour-analytics.service';
import { BehaviourScopeService } from './behaviour-scope.service';

const mockGdprTokenService = {
  processOutbound: jest
    .fn()
    .mockImplementation(
      async (
        _t: string,
        _e: string,
        data: {
          entities: Array<{ type: string; id: string; fields: Record<string, string> }>;
          entityCount: number;
        },
      ) => ({
        processedData: data,
        tokenMap: null,
      }),
    ),
  processInbound: jest
    .fn()
    .mockImplementation(async (_tenantId: string, response: string) => response),
};

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const PERMISSIONS = ['behaviour.view', 'behaviour.analytics'];

const baseInput = {
  query: 'What are the top behaviour issues this term?',
  context: {
    fromDate: '2026-01-01',
    toDate: '2026-03-27',
  },
};

const enabledSettings: Record<string, unknown> = {
  ai_nl_query_enabled: true,
  ai_audit_logging: true,
};

const mockOverview = {
  total_incidents: 42,
  prior_period_total: 35,
  delta_percent: 20,
  positive_negative_ratio: 0.6,
  ratio_trend: 'improving' as const,
  open_follow_ups: 3,
  active_alerts: 1,
  data_quality: { exposure_normalised: true, data_as_of: '2026-03-27T00:00:00Z' },
};

const mockTrends = {
  points: Array.from({ length: 20 }, (_, i) => ({
    date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    positive: 5,
    negative: 10,
    neutral: 2,
    total: 17,
  })),
  granularity: 'daily' as const,
  data_quality: { exposure_normalised: true, data_as_of: '2026-03-27T00:00:00Z' },
};

const mockCategories = {
  categories: Array.from({ length: 15 }, (_, i) => ({
    category_id: `cat-${i}`,
    category_name: `Category ${i}`,
    polarity: 'negative',
    count: 10 - i,
    rate_per_100: null,
    trend_percent: null,
  })),
  data_quality: { exposure_normalised: true, data_as_of: '2026-03-27T00:00:00Z' },
};

describe('BehaviourAIService', () => {
  let service: BehaviourAIService;
  let module: TestingModule;
  let mockPrisma: { auditLog: { create: jest.Mock; count: jest.Mock; findMany: jest.Mock } };
  let mockScope: { getUserScope: jest.Mock };
  let mockAnalytics: {
    getOverview: jest.Mock;
    getTrends: jest.Mock;
    getCategories: jest.Mock;
  };
  let mockAnthropicCreate: jest.Mock;
  let mockAnthropicClientService: { isConfigured: boolean; createMessage: jest.Mock };

  let mockAuditLogReadFacade: { count: jest.Mock; findMany: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    // Add $transaction that delegates to mockPrisma.auditLog
    (mockPrisma as Record<string, unknown>).$transaction = jest.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma),
    );

    mockAuditLogReadFacade = {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    };

    mockScope = {
      getUserScope: jest.fn().mockResolvedValue({ scope: 'all' }),
    };

    mockAnalytics = {
      getOverview: jest.fn().mockResolvedValue(mockOverview),
      getTrends: jest.fn().mockResolvedValue(mockTrends),
      getCategories: jest.fn().mockResolvedValue(mockCategories),
    };

    mockAnthropicCreate = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Student-A has issues' }],
    });
    mockAnthropicClientService = {
      isConfigured: true,
      createMessage: mockAnthropicCreate,
    };

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        BehaviourAIService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BehaviourScopeService, useValue: mockScope },
        { provide: BehaviourAnalyticsService, useValue: mockAnalytics },
        { provide: AnthropicClientService, useValue: mockAnthropicClientService },
        { provide: GdprTokenService, useValue: mockGdprTokenService },
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        { provide: AuditLogReadFacade, useValue: mockAuditLogReadFacade },
      ],
    }).compile();

    service = module.get<BehaviourAIService>(BehaviourAIService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── processNLQuery ─────────────────────────────────────────────────────

  describe('processNLQuery', () => {
    it('should throw ForbiddenException when ai_nl_query_enabled is false', async () => {
      await expect(
        service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, {
          ai_nl_query_enabled: false,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should resolve scope via scopeService before fetching data', async () => {
      await service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, enabledSettings);

      expect(mockScope.getUserScope).toHaveBeenCalledWith(TENANT_ID, USER_ID, PERMISSIONS);
    });

    it('should call analyticsService methods in parallel', async () => {
      await service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, enabledSettings);

      expect(mockAnalytics.getOverview).toHaveBeenCalledTimes(1);
      expect(mockAnalytics.getTrends).toHaveBeenCalledTimes(1);
      expect(mockAnalytics.getCategories).toHaveBeenCalledTimes(1);

      // All three are called with tenantId, userId, permissions, and query object
      expect(mockAnalytics.getOverview).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        PERMISSIONS,
        expect.objectContaining({ exposureNormalised: true }),
      );
    });

    it('should anonymise data context before sending to AI', async () => {
      await service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, enabledSettings);

      expect(anonymiseForAI).toHaveBeenCalledWith(
        expect.objectContaining({
          overview: mockOverview,
          recent_trends: expect.any(Array) as unknown[],
          top_categories: expect.any(Array) as unknown[],
        }),
        expect.any(Object) as Record<string, boolean>,
      );
    });

    it('should build prompt with user query and anonymised data', async () => {
      await service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, enabledSettings);

      const callArgs = mockAnthropicCreate.mock.calls[0][0] as {
        messages: { content: string }[];
      };
      const prompt = callArgs.messages[0]!.content;
      expect(prompt).toContain(baseInput.query);
      expect(prompt).toContain('total_incidents');
    });

    it('should de-anonymise AI response before returning', async () => {
      const result = await service.processNLQuery(
        TENANT_ID,
        USER_ID,
        PERMISSIONS,
        baseInput,
        enabledSettings,
      );

      expect(mockGdprTokenService.processInbound).toHaveBeenCalledWith(
        TENANT_ID,
        expect.any(String),
        null,
      );
      expect(result.result).toBeDefined();
    });

    it('should return ai_generated: true and scope_applied label', async () => {
      const result = await service.processNLQuery(
        TENANT_ID,
        USER_ID,
        PERMISSIONS,
        baseInput,
        enabledSettings,
      );

      expect(result.ai_generated).toBe(true);
      expect(result.scope_applied).toBe('school-wide');
      expect(result.data_as_of).toBeDefined();
      expect(result.confidence).toBeNull();
    });

    it('should throw ServiceUnavailableException when AI call fails', async () => {
      mockAnthropicCreate.mockRejectedValueOnce(new Error('API timeout'));

      await expect(
        service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, enabledSettings),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should write audit log when ai_audit_logging is enabled', async () => {
      await service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, enabledSettings);

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          actor_user_id: USER_ID,
          action: 'ai_query',
          entity_type: 'behaviour_analytics',
          metadata_json: expect.objectContaining({
            context: 'ai_behaviour',
            feature: 'nl_query',
            anonymised_query: baseInput.query,
            scope: 'school-wide',
          }) as Record<string, unknown>,
        }),
      });
    });

    it('should not write audit log when ai_audit_logging is disabled', async () => {
      await service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, {
        ai_nl_query_enabled: true,
        ai_audit_logging: false,
      });

      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it('should log AI processing to GDPR audit trail', async () => {
      await service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, enabledSettings);

      const mockAuditService = module.get(AiAuditService);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          aiService: 'ai_behaviour_query',
          tokenised: true,
        }),
      );
    });

    it('should not crash if audit log write fails', async () => {
      mockPrisma.auditLog.create.mockRejectedValueOnce(new Error('DB error'));

      const result = await service.processNLQuery(
        TENANT_ID,
        USER_ID,
        PERMISSIONS,
        baseInput,
        enabledSettings,
      );

      // Should still return a valid result
      expect(result.ai_generated).toBe(true);
    });

    it('edge: should handle empty analytics data without error', async () => {
      mockAnalytics.getOverview.mockResolvedValueOnce({
        total_incidents: 0,
        prior_period_total: 0,
        delta_percent: null,
        positive_negative_ratio: null,
        ratio_trend: null,
        open_follow_ups: 0,
        active_alerts: 0,
        data_quality: { exposure_normalised: true, data_as_of: '2026-03-27T00:00:00Z' },
      });
      mockAnalytics.getTrends.mockResolvedValueOnce({
        points: [],
        granularity: 'daily',
        data_quality: { exposure_normalised: true, data_as_of: '2026-03-27T00:00:00Z' },
      });
      mockAnalytics.getCategories.mockResolvedValueOnce({
        categories: [],
        data_quality: { exposure_normalised: true, data_as_of: '2026-03-27T00:00:00Z' },
      });

      const result = await service.processNLQuery(
        TENANT_ID,
        USER_ID,
        PERMISSIONS,
        baseInput,
        enabledSettings,
      );

      expect(result.ai_generated).toBe(true);
    });
  });

  // ─── callAI (via processNLQuery) ────────────────────────────────────────

  describe('callAI (via processNLQuery)', () => {
    it('should throw when anthropicClient is not configured', async () => {
      mockAnthropicClientService.isConfigured = false;

      await expect(
        service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, enabledSettings),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should use timeout via AbortController', async () => {
      await service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, enabledSettings);

      // callAI is private, but we can verify it was called correctly through
      // the anthropic create call being invoked
      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.any(String) as string,
          max_tokens: 1024,
          messages: expect.any(Array) as unknown[],
        }),
        expect.objectContaining({
          timeoutMs: expect.any(Number) as number,
        }),
      );
    });

    it('should extract text block from response', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [
          { type: 'tool_use', text: 'ignored' },
          { type: 'text', text: 'Behaviour trends show improvement' },
        ],
      });

      // deAnonymiseFromAI mock will return the text as-is (no Student tokens)
      (deAnonymiseFromAI as jest.Mock).mockReturnValueOnce('Behaviour trends show improvement');

      const result = await service.processNLQuery(
        TENANT_ID,
        USER_ID,
        PERMISSIONS,
        baseInput,
        enabledSettings,
      );

      expect(result.result).toBe('Behaviour trends show improvement');
    });

    it('should throw when response has no text block', async () => {
      mockAnthropicCreate.mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }],
      });

      await expect(
        service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, enabledSettings),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ─── getQueryHistory ────────────────────────────────────────────────────

  describe('getQueryHistory', () => {
    it('should return paginated audit log entries', async () => {
      const mockEntries = [
        {
          id: 'audit-1',
          metadata_json: { anonymised_query: 'What are the trends?' },
          created_at: new Date('2026-03-27T10:00:00Z'),
        },
        {
          id: 'audit-2',
          metadata_json: { anonymised_query: 'Show categories' },
          created_at: new Date('2026-03-26T10:00:00Z'),
        },
      ];
      mockAuditLogReadFacade.count.mockResolvedValue(2);
      mockAuditLogReadFacade.findMany.mockResolvedValue(mockEntries);

      const result = await service.getQueryHistory(TENANT_ID, USER_ID, 1, 20);

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]!.id).toBe('audit-1');
      expect(result.entries[0]!.query).toBe('What are the trends?');
      expect(result.entries[0]!.created_at).toBe('2026-03-27T10:00:00.000Z');
    });

    it('should filter by tenant_id and user_id', async () => {
      mockAuditLogReadFacade.count.mockResolvedValue(0);
      mockAuditLogReadFacade.findMany.mockResolvedValue([]);

      await service.getQueryHistory(TENANT_ID, USER_ID, 1, 10);

      expect(mockAuditLogReadFacade.count).toHaveBeenCalledWith(TENANT_ID, {
        entityType: 'behaviour_analytics',
        action: 'ai_query',
      });
      expect(mockAuditLogReadFacade.findMany).toHaveBeenCalledWith(TENANT_ID, {
        entityType: 'behaviour_analytics',
        action: 'ai_query',
        actorUserId: USER_ID,
        skip: 0,
        take: 10,
      });
    });
  });
});
