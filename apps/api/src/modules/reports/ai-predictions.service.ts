import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

export interface TrendPrediction {
  expected: number[];
  optimistic: number[];
  pessimistic: number[];
  confidence: 'high' | 'medium' | 'low';
  periods_ahead: number;
  narrative: string;
}

@Injectable()
export class AiPredictionsService {
  private readonly logger = new Logger(AiPredictionsService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private anthropic: { messages: { create: (params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }> } } | null = null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const AnthropicSdk = require('@anthropic-ai/sdk').default;
        this.anthropic = new AnthropicSdk({ apiKey });
      } catch {
        this.logger.warn(
          '@anthropic-ai/sdk is not installed — AI predictions will be unavailable',
        );
      }
    } else {
      this.logger.warn(
        'ANTHROPIC_API_KEY is not set — AI predictions will be unavailable',
      );
    }
  }

  async predictTrend(
    historicalData: Record<string, unknown>[],
    reportType: string,
    periodsAhead = 3,
  ): Promise<TrendPrediction> {
    if (!this.anthropic) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message: 'AI predictions are not configured. ANTHROPIC_API_KEY is not set.',
        },
      });
    }

    const dataStr = JSON.stringify(historicalData, null, 2);

    const prompt = `You are a school analytics AI. Analyze the following historical ${reportType} trend data and predict the next ${periodsAhead} periods.

Historical data (ordered chronologically):
${dataStr}

Respond with ONLY valid JSON in this exact format (no explanation, no markdown):
{
  "expected": [<${periodsAhead} numbers>],
  "optimistic": [<${periodsAhead} numbers, 10-15% better than expected>],
  "pessimistic": [<${periodsAhead} numbers, 10-15% worse than expected>],
  "confidence": "<high|medium|low>",
  "narrative": "<2-3 sentence explanation of the prediction>"
}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content.find((c) => c.type === 'text');
    const raw = content?.text ?? '{}';

    try {
      const parsed = JSON.parse(raw) as {
        expected?: number[];
        optimistic?: number[];
        pessimistic?: number[];
        confidence?: string;
        narrative?: string;
      };

      return {
        expected: Array.isArray(parsed.expected) ? parsed.expected : [],
        optimistic: Array.isArray(parsed.optimistic) ? parsed.optimistic : [],
        pessimistic: Array.isArray(parsed.pessimistic) ? parsed.pessimistic : [],
        confidence: this.normaliseConfidence(parsed.confidence),
        periods_ahead: periodsAhead,
        narrative: parsed.narrative ?? 'No prediction narrative available.',
      };
    } catch {
      this.logger.warn('Failed to parse AI prediction response', { raw });
      return {
        expected: [],
        optimistic: [],
        pessimistic: [],
        confidence: 'low',
        periods_ahead: periodsAhead,
        narrative: 'Unable to generate prediction at this time.',
      };
    }
  }

  private normaliseConfidence(value: string | undefined): 'high' | 'medium' | 'low' {
    if (value === 'high' || value === 'medium' || value === 'low') return value;
    return 'medium';
  }
}
