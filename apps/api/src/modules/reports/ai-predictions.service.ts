import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { SYSTEM_USER_SENTINEL } from '@school/shared';
import type { GdprOutboundData } from '@school/shared';

import { SettingsService } from '../configuration/settings.service';
import { AiAuditService } from '../gdpr/ai-audit.service';
import { GdprTokenService } from '../gdpr/gdpr-token.service';

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
  private anthropic: {
    messages: {
      create: (
        params: Record<string, unknown>,
      ) => Promise<{ content: Array<{ type: string; text?: string }> }>;
    };
  } | null = null;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly gdprTokenService: GdprTokenService,
    private readonly aiAuditService: AiAuditService,
  ) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const AnthropicSdk = require('@anthropic-ai/sdk').default;
        this.anthropic = new AnthropicSdk({ apiKey });
      } catch {
        this.logger.warn('@anthropic-ai/sdk is not installed — AI predictions will be unavailable');
      }
    } else {
      this.logger.warn('ANTHROPIC_API_KEY is not set — AI predictions will be unavailable');
    }
  }

  async predictTrend(
    tenantId: string,
    historicalData: Record<string, unknown>[],
    reportType: string,
    periodsAhead = 3,
    userId?: string,
  ): Promise<TrendPrediction> {
    if (!this.anthropic) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message: 'AI predictions are not configured. ANTHROPIC_API_KEY is not set.',
        },
      });
    }

    const settings = await this.settingsService.getSettings(tenantId);
    if (!settings.ai.predictionsEnabled) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_FEATURE_DISABLED',
          message: 'This feature requires opt-in. Enable it in Settings > AI Features.',
        },
      });
    }

    // GDPR audit trail for AI data processing
    await this.gdprTokenService.processOutbound(
      tenantId,
      'ai_predictions',
      { entities: [], entityCount: 0 } as GdprOutboundData,
      userId ?? SYSTEM_USER_SENTINEL,
    );

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

    const startTime = Date.now();
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });
    const elapsed = Date.now() - startTime;

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

      const confidenceValue = this.normaliseConfidence(parsed.confidence);
      const confidenceScore =
        confidenceValue === 'high' ? 0.9 : confidenceValue === 'medium' ? 0.6 : 0.3;

      await this.aiAuditService.log({
        tenantId,
        aiService: 'ai_predictions',
        subjectType: null,
        subjectId: null,
        modelUsed: 'claude-sonnet-4-6',
        promptHash: AiAuditService.hashPrompt(prompt),
        promptSummary: AiAuditService.truncate(prompt, 500),
        responseSummary: AiAuditService.truncate(raw, 500),
        inputDataCategories: ['historical_trends'],
        tokenised: true,
        confidenceScore,
        processingTimeMs: elapsed,
      });

      return {
        expected: Array.isArray(parsed.expected) ? parsed.expected : [],
        optimistic: Array.isArray(parsed.optimistic) ? parsed.optimistic : [],
        pessimistic: Array.isArray(parsed.pessimistic) ? parsed.pessimistic : [],
        confidence: confidenceValue,
        periods_ahead: periodsAhead,
        narrative: parsed.narrative ?? 'No prediction narrative available.',
      };
    } catch {
      this.logger.warn('Failed to parse AI prediction response', { raw });

      await this.aiAuditService.log({
        tenantId,
        aiService: 'ai_predictions',
        subjectType: null,
        subjectId: null,
        modelUsed: 'claude-sonnet-4-6',
        promptHash: AiAuditService.hashPrompt(prompt),
        promptSummary: AiAuditService.truncate(prompt, 500),
        responseSummary: AiAuditService.truncate(raw, 500),
        inputDataCategories: ['historical_trends'],
        tokenised: true,
        confidenceScore: 0.3,
        processingTimeMs: elapsed,
      });

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
