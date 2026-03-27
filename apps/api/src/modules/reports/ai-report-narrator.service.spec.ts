import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SettingsService } from '../configuration/settings.service';
import { GdprTokenService } from '../gdpr/gdpr-token.service';
import { RedisService } from '../redis/redis.service';

import { AiReportNarratorService } from './ai-report-narrator.service';

const mockAnthropicCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  })),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const mockSettingsService = {
  getSettings: jest.fn().mockResolvedValue({ ai: { reportNarrationEnabled: true } }),
};

describe('AiReportNarratorService', () => {
  let service: AiReportNarratorService;
  let mockRedisClient: { get: jest.Mock; setex: jest.Mock };

  beforeEach(async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    mockRedisClient = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
    };

    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Attendance is improving steadily.' }],
    });
    mockSettingsService.getSettings.mockResolvedValue({ ai: { reportNarrationEnabled: true } });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiReportNarratorService,
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: RedisService, useValue: { getClient: () => mockRedisClient } },
        {
          provide: GdprTokenService,
          useValue: {
            processOutbound: jest.fn().mockResolvedValue({
              processedData: { entities: [], entityCount: 0 },
              tokenMap: null,
            }),
            processInbound: jest.fn().mockImplementation(async (_t: string, r: string) => r),
          },
        },
      ],
    }).compile();

    service = module.get<AiReportNarratorService>(AiReportNarratorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('should return AI-generated narrative for attendance report type', async () => {
    const result = await service.generateNarrative(TENANT_ID, { attendance_rate: 85 }, 'attendance');

    expect(result).toBe('Attendance is improving steadily.');
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
  });

  it('should return cached narrative when cache hit occurs', async () => {
    mockRedisClient.get.mockResolvedValue('Cached narrative text.');

    const result = await service.generateNarrative(TENANT_ID, { attendance_rate: 85 }, 'attendance');

    expect(result).toBe('Cached narrative text.');
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it('should store the generated narrative in Redis after API call', async () => {
    await service.generateNarrative(TENANT_ID, { total_students: 100 }, 'board_report');

    expect(mockRedisClient.setex).toHaveBeenCalledWith(
      expect.stringContaining('ai_narrative:board_report:'),
      3600,
      'Attendance is improving steadily.',
    );
  });

  it('should use fallback text when AI response has no text content', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'tool_use' }],
    });

    const result = await service.generateNarrative(TENANT_ID, {}, 'grades');

    expect(result).toBe('No narrative generated.');
  });

  it('should build correct prompt for grades report type', async () => {
    await service.generateNarrative(TENANT_ID, { avg_score: 70 }, 'grades');

    const callArgs = mockAnthropicCreate.mock.calls[0]![0] as {
      messages: Array<{ content: string }>;
    };
    expect(callArgs.messages[0]!.content).toContain('grade analytics data');
  });

  it('should build correct prompt for board_report report type', async () => {
    await service.generateNarrative(TENANT_ID, { kpi: 1 }, 'board_report');

    const callArgs = mockAnthropicCreate.mock.calls[0]![0] as {
      messages: Array<{ content: string }>;
    };
    expect(callArgs.messages[0]!.content).toContain('board report');
  });

  it('should throw ServiceUnavailableException when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const moduleNoKey: TestingModule = await Test.createTestingModule({
      providers: [
        AiReportNarratorService,
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: RedisService, useValue: { getClient: () => mockRedisClient } },
        {
          provide: GdprTokenService,
          useValue: {
            processOutbound: jest.fn().mockResolvedValue({
              processedData: { entities: [], entityCount: 0 },
              tokenMap: null,
            }),
            processInbound: jest.fn().mockImplementation(async (_t: string, r: string) => r),
          },
        },
      ],
    }).compile();

    const serviceNoKey = moduleNoKey.get<AiReportNarratorService>(AiReportNarratorService);

    await expect(serviceNoKey.generateNarrative(TENANT_ID, {}, 'attendance')).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
