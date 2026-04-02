import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AnthropicClientService } from '../ai/anthropic-client.service';
import { SettingsService } from '../configuration/settings.service';
import { AiAuditService } from '../gdpr/ai-audit.service';
import { GdprTokenService } from '../gdpr/gdpr-token.service';

import { AiPredictionsService } from './ai-predictions.service';

const mockAnthropicCreate = jest.fn();

const VALID_PREDICTION_RESPONSE = {
  expected: [82, 84, 86],
  optimistic: [88, 90, 92],
  pessimistic: [75, 77, 79],
  confidence: 'high',
  narrative: 'Attendance is trending upward based on past 6 months.',
};

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const mockSettingsService = {
  getSettings: jest.fn().mockResolvedValue({ ai: { predictionsEnabled: true } }),
};

describe('AiPredictionsService', () => {
  let service: AiPredictionsService;
  let module: TestingModule;
  let mockAnthropicClientService: { isConfigured: boolean; createMessage: jest.Mock };

  beforeEach(async () => {
    mockAnthropicClientService = {
      isConfigured: true,
      createMessage: mockAnthropicCreate,
    };

    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(VALID_PREDICTION_RESPONSE) }],
    });
    mockSettingsService.getSettings.mockResolvedValue({ ai: { predictionsEnabled: true } });

    module = await Test.createTestingModule({
      providers: [
        AiPredictionsService,
        { provide: SettingsService, useValue: mockSettingsService },
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
        { provide: AiAuditService, useValue: { log: jest.fn().mockResolvedValue('test-log-id') } },
        { provide: AnthropicClientService, useValue: mockAnthropicClientService },
      ],
    }).compile();

    service = module.get<AiPredictionsService>(AiPredictionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a valid TrendPrediction when AI responds correctly', async () => {
    const historicalData = [
      { period: '2026-01', value: 78 },
      { period: '2026-02', value: 80 },
    ];

    const result = await service.predictTrend(TENANT_ID, historicalData, 'attendance', 3);

    expect(result.expected).toEqual([82, 84, 86]);
    expect(result.optimistic).toEqual([88, 90, 92]);
    expect(result.pessimistic).toEqual([75, 77, 79]);
    expect(result.confidence).toBe('high');
    expect(result.periods_ahead).toBe(3);
    expect(result.narrative).toBe('Attendance is trending upward based on past 6 months.');
  });

  it('should call Anthropic API with the historical data in the prompt', async () => {
    const historicalData = [{ period: '2026-01', value: 70 }];

    await service.predictTrend(TENANT_ID, historicalData, 'grades', 2);

    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockAnthropicCreate.mock.calls[0]![0] as {
      messages: Array<{ content: string }>;
    };
    expect(callArgs.messages[0]!.content).toContain('grades');
    expect(callArgs.messages[0]!.content).toContain('2');
  });

  it('should normalise unknown confidence values to medium', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ...VALID_PREDICTION_RESPONSE, confidence: 'very_high' }),
        },
      ],
    });

    const result = await service.predictTrend(TENANT_ID, [], 'attendance', 3);

    expect(result.confidence).toBe('medium');
  });

  it('should return empty arrays and low confidence when AI returns invalid JSON', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json {{' }],
    });

    const result = await service.predictTrend(TENANT_ID, [], 'attendance', 3);

    expect(result.expected).toEqual([]);
    expect(result.optimistic).toEqual([]);
    expect(result.pessimistic).toEqual([]);
    expect(result.confidence).toBe('low');
    expect(result.narrative).toBe('Unable to generate prediction at this time.');
  });

  it('should return empty arrays when AI response has no text content block', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'tool_use' }],
    });

    const result = await service.predictTrend(TENANT_ID, [], 'grades', 3);

    // Empty object is parsed from '{}' which gives undefined arrays → falls back to []
    expect(result.expected).toEqual([]);
  });

  it('should use default periodsAhead of 3 when not specified', async () => {
    const result = await service.predictTrend(TENANT_ID, [], 'attendance');

    expect(result.periods_ahead).toBe(3);
  });

  it('should log AI processing to audit trail', async () => {
    await service.predictTrend(TENANT_ID, [{ period: '2026-01', value: 78 }], 'attendance', 3);

    const mockAuditService = module.get(AiAuditService);
    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        aiService: 'ai_predictions',
        tokenised: true,
      }),
    );
  });

  it('should extract confidence score from parsed response', async () => {
    await service.predictTrend(TENANT_ID, [{ period: '2026-01', value: 78 }], 'attendance', 3);

    const mockAuditService = module.get(AiAuditService);
    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        confidenceScore: 0.9, // 'high' maps to 0.9
      }),
    );
  });

  it('should throw ServiceUnavailableException when ANTHROPIC_API_KEY is not set', async () => {
    mockAnthropicClientService.isConfigured = false;

    await expect(service.predictTrend(TENANT_ID, [], 'attendance', 3)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
