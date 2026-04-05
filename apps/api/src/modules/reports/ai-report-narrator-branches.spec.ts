/**
 * Additional branch coverage for AiReportNarratorService.
 * Targets: generateNarrative (not configured, feature disabled, cached response,
 * all buildNarrativePrompt switch cases, hashData), userId fallback.
 */
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AnthropicClientService } from '../ai/anthropic-client.service';
import { SettingsService } from '../configuration/settings.service';
import { AiAuditService } from '../gdpr/ai-audit.service';
import { GdprTokenService } from '../gdpr/gdpr-token.service';
import { RedisService } from '../redis/redis.service';

import { AiReportNarratorService } from './ai-report-narrator.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';

function buildMocks() {
  const redisClient = {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
  };
  return {
    settingsService: {
      getSettings: jest.fn().mockResolvedValue({ ai: { reportNarrationEnabled: true } }),
    },
    redisService: {
      getClient: jest.fn().mockReturnValue(redisClient),
    },
    redisClient,
    gdprTokenService: {
      processOutbound: jest.fn().mockResolvedValue(undefined),
    },
    aiAuditService: {
      log: jest.fn().mockResolvedValue(undefined),
    },
    anthropicClient: {
      isConfigured: true,
      createMessage: jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'This is a narrative summary.' }],
      }),
    },
  };
}

describe('AiReportNarratorService — branch coverage', () => {
  let service: AiReportNarratorService;
  let mocks: ReturnType<typeof buildMocks>;

  beforeEach(async () => {
    mocks = buildMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiReportNarratorService,
        { provide: SettingsService, useValue: mocks.settingsService },
        { provide: RedisService, useValue: mocks.redisService },
        { provide: GdprTokenService, useValue: mocks.gdprTokenService },
        { provide: AiAuditService, useValue: mocks.aiAuditService },
        { provide: AnthropicClientService, useValue: mocks.anthropicClient },
      ],
    }).compile();

    service = module.get<AiReportNarratorService>(AiReportNarratorService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── generateNarrative — not configured ───────────────────────────────────

  describe('AiReportNarratorService — generateNarrative', () => {
    it('should throw ServiceUnavailableException when AI not configured', async () => {
      mocks.anthropicClient.isConfigured = false;

      await expect(service.generateNarrative(TENANT_ID, {}, 'attendance', USER_ID)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw ServiceUnavailableException when feature disabled', async () => {
      mocks.settingsService.getSettings.mockResolvedValue({
        ai: { reportNarrationEnabled: false },
      });

      await expect(service.generateNarrative(TENANT_ID, {}, 'attendance', USER_ID)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should return cached response when available', async () => {
      mocks.redisClient.get.mockResolvedValue('Cached narrative.');

      const result = await service.generateNarrative(TENANT_ID, {}, 'attendance', USER_ID);

      expect(result).toBe('Cached narrative.');
      expect(mocks.anthropicClient.createMessage).not.toHaveBeenCalled();
    });

    it('should generate narrative and cache it when no cache', async () => {
      const result = await service.generateNarrative(
        TENANT_ID,
        { key: 'value' },
        'attendance',
        USER_ID,
      );

      expect(result).toBe('This is a narrative summary.');
      expect(mocks.anthropicClient.createMessage).toHaveBeenCalled();
      expect(mocks.redisClient.setex).toHaveBeenCalled();
      expect(mocks.aiAuditService.log).toHaveBeenCalled();
    });

    it('should use SYSTEM_USER_SENTINEL when no userId', async () => {
      await service.generateNarrative(TENANT_ID, {}, 'attendance');

      expect(mocks.gdprTokenService.processOutbound).toHaveBeenCalledWith(
        TENANT_ID,
        'ai_report_narrator',
        expect.any(Object),
        expect.any(String),
      );
    });

    it('should handle response without text content', async () => {
      mocks.anthropicClient.createMessage.mockResolvedValue({
        content: [{ type: 'image', source: {} }],
      });

      const result = await service.generateNarrative(TENANT_ID, {}, 'attendance', USER_ID);

      expect(result).toBe('No narrative generated.');
    });
  });

  // ─── buildNarrativePrompt — all reportType cases ──────────────────────────

  describe('AiReportNarratorService — buildNarrativePrompt branches', () => {
    const reportTypes = [
      'attendance',
      'grades',
      'board_report',
      'admissions',
      'demographics',
      'custom',
    ];

    for (const rt of reportTypes) {
      it(`should generate prompt for reportType "${rt}"`, async () => {
        await service.generateNarrative(TENANT_ID, { metric: 100 }, rt, USER_ID);

        const prompt = (
          mocks.anthropicClient.createMessage.mock.calls[0]![0] as {
            messages: Array<{ content: string }>;
          }
        ).messages[0]!.content;

        expect(typeof prompt).toBe('string');
        expect(prompt.length).toBeGreaterThan(50);
      });
    }
  });

  // ─── hashData — produces stable results ───────────────────────────────────

  describe('AiReportNarratorService — hashData consistency', () => {
    it('should produce same cache key for same data', async () => {
      const data = { attendance_rate: 95 };

      // First call
      await service.generateNarrative(TENANT_ID, data, 'attendance', USER_ID);
      const firstKey = mocks.redisClient.get.mock.calls[0]![0] as string;

      jest.clearAllMocks();
      mocks.redisClient.get.mockResolvedValue(null);
      mocks.anthropicClient.createMessage.mockResolvedValue({
        content: [{ type: 'text', text: 'Another narrative.' }],
      });

      // Second call with same data
      await service.generateNarrative(TENANT_ID, data, 'attendance', USER_ID);
      const secondKey = mocks.redisClient.get.mock.calls[0]![0] as string;

      expect(firstKey).toBe(secondKey);
    });
  });
});
