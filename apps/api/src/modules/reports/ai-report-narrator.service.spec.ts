import type Anthropic from '@anthropic-ai/sdk';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { KpiDashboardResponse } from '@school/shared/reports';

import { AnthropicClientService } from '../ai/anthropic-client.service';
import { AiAuditService } from '../gdpr/ai-audit.service';
import { RedisService } from '../redis/redis.service';

import {
  AiReportNarratorService,
  estimateCost,
  extractText,
} from './ai-report-narrator.service';
import { CustomReportBuilderService } from './custom-report-builder.service';
import { UnifiedDashboardService } from './unified-dashboard.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const SAVED_REPORT_ID = '22222222-2222-2222-2222-222222222222';

function buildDashboardResponse(): KpiDashboardResponse {
  return {
    data: {
      generated_at: '2026-04-24T20:00:00.000Z',
      kpis: [
        {
          key: 'attendance_today',
          label_key: 'reports.kpi.attendance_today.label',
          tooltip_key: 'reports.kpi.attendance_today.tooltip',
          value: '94.2%',
          value_raw: 0.942,
          delta: { value: 1.5, unit: 'percent', direction: 'up', better_when: 'up' },
          sparkline: [0.93, 0.94, 0.95, 0.94, 0.95, 0.94, 0.94],
          drill_down_href: '/reports/attendance',
          severity: 'normal',
        },
      ],
      trends: { weeks: [], attendance: [], grades: [], collection: [] },
    },
    meta: { cache_hit: false },
  };
}

function buildAnthropicMessage(text = 'A short narrative.'): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    stop_reason: 'end_turn',
    stop_sequence: null,
    content: [{ type: 'text', text, citations: null }],
    usage: {
      input_tokens: 200,
      output_tokens: 80,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use: null,
      service_tier: 'standard',
    },
  } as unknown as Anthropic.Message;
}

function buildMocks() {
  const redisClient = {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
  };
  return {
    redisClient,
    redisService: { getClient: jest.fn().mockReturnValue(redisClient) },
    aiAuditService: { log: jest.fn().mockResolvedValue('audit-id') },
    anthropicClient: {
      isConfigured: true,
      createMessage: jest.fn().mockResolvedValue(buildAnthropicMessage()),
    },
    customReportBuilder: {
      getSavedReport: jest.fn().mockResolvedValue({
        id: SAVED_REPORT_ID,
        name: 'Year 10 with low attendance',
        data_source: 'student',
        dimensions_json: ['student.identity.last_name'],
        measures_json: [],
        filters_json: {},
        chart_type: 'table',
        is_shared: false,
        created_by_user_id: USER_ID,
        created_at: '2026-04-20T00:00:00.000Z',
        updated_at: '2026-04-20T00:00:00.000Z',
      }),
      executeReport: jest.fn().mockResolvedValue({
        rows: [
          { 'student.identity.last_name': 'Doe' },
          { 'student.identity.last_name': 'Smith' },
        ],
        columns: [
          {
            id: 'student.identity.last_name',
            label_key: 'reports.fields.student.identity.last_name',
            type: 'string',
          },
        ],
        meta: { row_count: 2, truncated: false, execution_ms: 12 },
      }),
    },
    unifiedDashboard: {
      getKpiDashboard: jest.fn().mockResolvedValue(buildDashboardResponse()),
    },
  };
}

describe('AiReportNarratorService', () => {
  let service: AiReportNarratorService;
  let mocks: ReturnType<typeof buildMocks>;

  beforeEach(async () => {
    mocks = buildMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiReportNarratorService,
        { provide: RedisService, useValue: mocks.redisService },
        { provide: AnthropicClientService, useValue: mocks.anthropicClient },
        { provide: AiAuditService, useValue: mocks.aiAuditService },
        { provide: CustomReportBuilderService, useValue: mocks.customReportBuilder },
        { provide: UnifiedDashboardService, useValue: mocks.unifiedDashboard },
      ],
    }).compile();

    service = module.get(AiReportNarratorService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Configuration / availability ─────────────────────────────────────────

  describe('availability', () => {
    it('throws AI_UNAVAILABLE when ANTHROPIC_API_KEY is not configured', async () => {
      mocks.anthropicClient.isConfigured = false;

      await expect(service.narrateDashboard(TENANT_ID, USER_ID)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      try {
        await service.narrateDashboard(TENANT_ID, USER_ID);
      } catch (err) {
        const response = (err as ServiceUnavailableException).getResponse() as {
          code: string;
          message: string;
        };
        expect(response.code).toBe('AI_UNAVAILABLE');
      }
    });

    it('throws AI_UNAVAILABLE when the Anthropic call fails', async () => {
      mocks.anthropicClient.createMessage.mockRejectedValueOnce(new Error('boom'));

      await expect(service.narrateDashboard(TENANT_ID, USER_ID)).rejects.toMatchObject({
        response: { code: 'AI_UNAVAILABLE' },
      });
    });
  });

  // ─── narrateDashboard ────────────────────────────────────────────────────

  describe('narrateDashboard', () => {
    it('fetches the live dashboard, narrates it, audits, and caches the result', async () => {
      const result = await service.narrateDashboard(TENANT_ID, USER_ID);

      expect(mocks.unifiedDashboard.getKpiDashboard).toHaveBeenCalledWith(TENANT_ID);
      expect(mocks.anthropicClient.createMessage).toHaveBeenCalledTimes(1);
      expect(result.cache_hit).toBe(false);
      expect(result.narrative).toBe('A short narrative.');
      expect(typeof result.cost_usd_estimate).toBe('number');
      expect(result.cost_usd_estimate).toBeGreaterThan(0);

      expect(mocks.redisClient.setex).toHaveBeenCalledWith(
        expect.stringMatching(/^ai_narration:[a-f0-9-]+:dashboard:[a-f0-9]+$/),
        600, // 10 minutes
        expect.any(String),
      );
      expect(mocks.aiAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          aiService: 'reports_narrator',
          subjectType: 'dashboard',
          modelUsed: 'claude-sonnet-4-6',
          costUsdEstimate: expect.any(Number),
        }),
      );
    });

    it('returns the cached payload on a cache hit and audits the hit', async () => {
      const cachedPayload = {
        narrative: 'Cached narrative.',
        generated_at: '2026-04-24T19:55:00.000Z',
        cache_hit: false,
        cost_usd_estimate: 0.0123,
      };
      mocks.redisClient.get.mockResolvedValueOnce(JSON.stringify(cachedPayload));

      const result = await service.narrateDashboard(TENANT_ID, USER_ID);

      expect(result.cache_hit).toBe(true);
      expect(result.narrative).toBe('Cached narrative.');
      expect(mocks.anthropicClient.createMessage).not.toHaveBeenCalled();
      expect(mocks.redisClient.setex).not.toHaveBeenCalled();
      expect(mocks.aiAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectType: 'dashboard',
          promptSummary: expect.stringContaining('[cache hit]'),
          costUsdEstimate: null,
        }),
      );
    });
  });

  // ─── narrateReport ───────────────────────────────────────────────────────

  describe('narrateReport', () => {
    it('builds the report prompt with the report key embedded', async () => {
      await service.narrateReport(TENANT_ID, USER_ID, 'grades', { avg_score: 72 });

      const prompt = (
        mocks.anthropicClient.createMessage.mock.calls[0]![0] as {
          messages: Array<{ content: string }>;
        }
      ).messages[0]!.content;
      expect(prompt).toContain('Grade Analytics');
      expect(prompt).toContain('"avg_score": 72');
    });

    it('namespaces the cache key by report key', async () => {
      await service.narrateReport(TENANT_ID, USER_ID, 'attendance', { rate: 0.94 });
      const firstKey = mocks.redisClient.get.mock.calls[0]![0] as string;
      expect(firstKey).toMatch(/^ai_narration:[a-f0-9-]+:report:attendance:/);

      jest.clearAllMocks();
      mocks.redisClient.get.mockResolvedValue(null);
      mocks.anthropicClient.createMessage.mockResolvedValue(buildAnthropicMessage());

      await service.narrateReport(TENANT_ID, USER_ID, 'grades', { rate: 0.94 });
      const secondKey = mocks.redisClient.get.mock.calls[0]![0] as string;
      expect(secondKey).toMatch(/^ai_narration:[a-f0-9-]+:report:grades:/);
      expect(firstKey).not.toBe(secondKey);
    });
  });

  // ─── narrateSavedReport ──────────────────────────────────────────────────

  describe('narrateSavedReport', () => {
    it('routes through the custom-report-builder execute path with the supplied permissions', async () => {
      await service.narrateSavedReport(TENANT_ID, USER_ID, ['analytics.view'], SAVED_REPORT_ID);

      expect(mocks.customReportBuilder.getSavedReport).toHaveBeenCalledWith(
        TENANT_ID,
        SAVED_REPORT_ID,
      );
      expect(mocks.customReportBuilder.executeReport).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        ['analytics.view'],
        SAVED_REPORT_ID,
        1,
        10, // sample size cap
      );
      expect(mocks.aiAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectType: 'saved_report',
          subjectId: SAVED_REPORT_ID,
        }),
      );
    });
  });

  // ─── Cache-key stability ─────────────────────────────────────────────────

  describe('cache key stability', () => {
    it('produces the same cache key for identical dashboard payloads', async () => {
      await service.narrateDashboard(TENANT_ID, USER_ID);
      const firstKey = mocks.redisClient.get.mock.calls[0]![0] as string;

      jest.clearAllMocks();
      mocks.redisClient.get.mockResolvedValue(null);
      mocks.anthropicClient.createMessage.mockResolvedValue(buildAnthropicMessage());

      await service.narrateDashboard(TENANT_ID, USER_ID);
      const secondKey = mocks.redisClient.get.mock.calls[0]![0] as string;

      expect(firstKey).toBe(secondKey);
    });

    it('produces different cache keys for different reports with the same data', async () => {
      await service.narrateReport(TENANT_ID, USER_ID, 'attendance', { value: 1 });
      const attKey = mocks.redisClient.get.mock.calls[0]![0] as string;

      jest.clearAllMocks();
      mocks.redisClient.get.mockResolvedValue(null);
      mocks.anthropicClient.createMessage.mockResolvedValue(buildAnthropicMessage());

      await service.narrateReport(TENANT_ID, USER_ID, 'grades', { value: 1 });
      const gradesKey = mocks.redisClient.get.mock.calls[0]![0] as string;

      expect(attKey).not.toBe(gradesKey);
    });
  });
});

// ─── Pure helpers (exported for direct testing) ────────────────────────────

describe('extractText', () => {
  it('returns the first text block trimmed', () => {
    const message = buildAnthropicMessage('  Hello world  ');
    expect(extractText(message)).toBe('Hello world');
  });

  it('returns empty string when no text block is present', () => {
    const message = {
      ...buildAnthropicMessage(),
      content: [{ type: 'tool_use', id: 't1', name: 'tool', input: {} }],
    } as unknown as Anthropic.Message;
    expect(extractText(message)).toBe('');
  });
});

describe('estimateCost', () => {
  it('computes USD spend from input + output token counts at Sonnet 4.6 rates', () => {
    // 1M input tokens × $3 + 1M output tokens × $15 = $18.
    const message = {
      ...buildAnthropicMessage(),
      usage: {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    } as unknown as Anthropic.Message;
    expect(estimateCost(message)).toBe(18);
  });

  it('returns 0 when usage is missing', () => {
    const message = { ...buildAnthropicMessage(), usage: undefined } as unknown as Anthropic.Message;
    expect(estimateCost(message)).toBe(0);
  });

  it('rounds to 6 decimal places to fit NUMERIC(10,6)', () => {
    const message = {
      ...buildAnthropicMessage(),
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    } as unknown as Anthropic.Message;
    const cost = estimateCost(message);
    // 3 / 1M + 15 / 1M = 18e-6 = 0.000018
    expect(cost).toBeCloseTo(0.000018, 6);
  });
});
