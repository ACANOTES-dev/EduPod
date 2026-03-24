import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AiPredictionsService } from './ai-predictions.service';

const mockAnthropicCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicCreate },
  })),
}));

const VALID_PREDICTION_RESPONSE = {
  expected: [82, 84, 86],
  optimistic: [88, 90, 92],
  pessimistic: [75, 77, 79],
  confidence: 'high',
  narrative: 'Attendance is trending upward based on past 6 months.',
};

describe('AiPredictionsService', () => {
  let service: AiPredictionsService;

  beforeEach(async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(VALID_PREDICTION_RESPONSE) }],
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [AiPredictionsService],
    }).compile();

    service = module.get<AiPredictionsService>(AiPredictionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('should return a valid TrendPrediction when AI responds correctly', async () => {
    const historicalData = [
      { period: '2026-01', value: 78 },
      { period: '2026-02', value: 80 },
    ];

    const result = await service.predictTrend(historicalData, 'attendance', 3);

    expect(result.expected).toEqual([82, 84, 86]);
    expect(result.optimistic).toEqual([88, 90, 92]);
    expect(result.pessimistic).toEqual([75, 77, 79]);
    expect(result.confidence).toBe('high');
    expect(result.periods_ahead).toBe(3);
    expect(result.narrative).toBe('Attendance is trending upward based on past 6 months.');
  });

  it('should call Anthropic API with the historical data in the prompt', async () => {
    const historicalData = [{ period: '2026-01', value: 70 }];

    await service.predictTrend(historicalData, 'grades', 2);

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

    const result = await service.predictTrend([], 'attendance', 3);

    expect(result.confidence).toBe('medium');
  });

  it('should return empty arrays and low confidence when AI returns invalid JSON', async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json {{' }],
    });

    const result = await service.predictTrend([], 'attendance', 3);

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

    const result = await service.predictTrend([], 'grades', 3);

    // Empty object is parsed from '{}' which gives undefined arrays → falls back to []
    expect(result.expected).toEqual([]);
  });

  it('should use default periodsAhead of 3 when not specified', async () => {
    const result = await service.predictTrend([], 'attendance');

    expect(result.periods_ahead).toBe(3);
  });

  it('should throw ServiceUnavailableException when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY;

    const moduleNoKey: TestingModule = await Test.createTestingModule({
      providers: [AiPredictionsService],
    }).compile();

    const serviceNoKey = moduleNoKey.get<AiPredictionsService>(AiPredictionsService);

    await expect(serviceNoKey.predictTrend([], 'attendance', 3)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
