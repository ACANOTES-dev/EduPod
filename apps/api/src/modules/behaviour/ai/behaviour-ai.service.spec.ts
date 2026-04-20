/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
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

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { anonymiseForAI } from '@school/shared/ai';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { AnthropicClientService } from '../../ai/anthropic-client.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { GdprTokenService } from '../../gdpr/gdpr-token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BehaviourAnalyticsService } from '../behaviour-analytics.service';
import { BehaviourScopeService } from '../behaviour-scope.service';

import { BehaviourAiRateLimiterService } from './behaviour-ai-rate-limiter.service';
import { BehaviourAIService } from './behaviour-ai.service';

const mockGdprTokenService = {
  processOutbound: jest.fn().mockImplementation(async () => ({
    processedData: { entities: [], entityCount: 0 },
    tokenMap: null,
  })),
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

const settings: Record<string, unknown> = { ai_audit_logging: true };

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
  let mockPrisma: {
    behaviourAiQueryHistory: { create: jest.Mock; count: jest.Mock; findMany: jest.Mock };
  };
  let mockRlsPrisma: {
    behaviourAiQueryHistory: { create: jest.Mock; count: jest.Mock; findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let mockScope: { getUserScope: jest.Mock };
  let mockAnalytics: {
    getOverview: jest.Mock;
    getTrends: jest.Mock;
    getCategories: jest.Mock;
  };
  let mockAnthropicCreate: jest.Mock;
  let mockAnthropicClientService: { isConfigured: boolean; createMessage: jest.Mock };
  let mockRateLimiter: { check: jest.Mock; reset: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      behaviourAiQueryHistory: {
        create: jest.fn().mockResolvedValue({ id: 'h1' }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockRlsPrisma = {
      behaviourAiQueryHistory: mockPrisma.behaviourAiQueryHistory,
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsPrisma)),
    };

    (createRlsClient as jest.Mock).mockReturnValue(mockRlsPrisma);

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

    mockRateLimiter = {
      check: jest.fn().mockReturnValue({ allowed: true, remaining: 29, retryAfterMs: 0 }),
      reset: jest.fn(),
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
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('log-id') } },
        { provide: BehaviourAiRateLimiterService, useValue: mockRateLimiter },
      ],
    }).compile();

    service = module.get<BehaviourAIService>(BehaviourAIService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── processNLQuery ───────────────────────────────────────────────────────

  describe('processNLQuery', () => {
    it('should throw 429 when rate limit is exceeded', async () => {
      mockRateLimiter.check.mockReturnValueOnce({
        allowed: false,
        remaining: 0,
        retryAfterMs: 500,
      });

      await expect(
        service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, settings),
      ).rejects.toThrow(HttpException);
    });

    it('should throw ServiceUnavailableException when AI is not configured', async () => {
      mockAnthropicClientService.isConfigured = false;

      await expect(
        service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, settings),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should resolve scope via scopeService', async () => {
      await service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, settings);
      expect(mockScope.getUserScope).toHaveBeenCalledWith(TENANT_ID, USER_ID, PERMISSIONS);
    });

    it('should call analytics methods in parallel', async () => {
      await service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, settings);
      expect(mockAnalytics.getOverview).toHaveBeenCalledTimes(1);
      expect(mockAnalytics.getTrends).toHaveBeenCalledTimes(1);
      expect(mockAnalytics.getCategories).toHaveBeenCalledTimes(1);
    });

    it('should anonymise data context before sending to AI', async () => {
      await service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, settings);
      expect(anonymiseForAI).toHaveBeenCalled();
    });

    it('should persist the round-trip to behaviour_ai_query_history', async () => {
      await service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, settings);
      expect(mockPrisma.behaviourAiQueryHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          question: baseInput.query,
          answer: expect.any(String) as string,
        }),
      });
    });

    it('should not crash if history persist fails', async () => {
      mockPrisma.behaviourAiQueryHistory.create.mockRejectedValueOnce(new Error('DB error'));
      const result = await service.processNLQuery(
        TENANT_ID,
        USER_ID,
        PERMISSIONS,
        baseInput,
        settings,
      );
      expect(result.ai_generated).toBe(true);
    });

    it('should throw ServiceUnavailableException when AI call fails', async () => {
      mockAnthropicCreate.mockRejectedValueOnce(new Error('API timeout'));
      await expect(
        service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, settings),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should log to GDPR AI audit trail', async () => {
      await service.processNLQuery(TENANT_ID, USER_ID, PERMISSIONS, baseInput, settings);
      const audit = module.get(AiAuditService);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          aiService: 'ai_behaviour_query',
        }),
      );
    });
  });

  // ─── getQueryHistory ──────────────────────────────────────────────────────

  describe('getQueryHistory', () => {
    const createdAt = new Date('2026-03-27T10:00:00Z');

    it('should return paginated history scoped to the requesting user by default', async () => {
      mockPrisma.behaviourAiQueryHistory.count.mockResolvedValue(2);
      mockPrisma.behaviourAiQueryHistory.findMany.mockResolvedValue([
        {
          id: 'h1',
          question: 'What are the trends?',
          answer: 'Improving',
          data_payload: null,
          citations: null,
          generated_at: createdAt,
        },
      ]);

      const result = await service.getQueryHistory(TENANT_ID, USER_ID, 1, 20);

      expect(mockPrisma.behaviourAiQueryHistory.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, user_id: USER_ID },
      });
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.query).toBe('What are the trends?');
      expect(result.entries[0]!.answer).toBe('Improving');
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
    });

    it('should widen to all users when caller has behaviour.view_staff_analytics', async () => {
      mockPrisma.behaviourAiQueryHistory.count.mockResolvedValue(5);
      mockPrisma.behaviourAiQueryHistory.findMany.mockResolvedValue([]);

      await service.getQueryHistory(TENANT_ID, USER_ID, 1, 10, ['behaviour.view_staff_analytics']);

      expect(mockPrisma.behaviourAiQueryHistory.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
    });
  });
});
