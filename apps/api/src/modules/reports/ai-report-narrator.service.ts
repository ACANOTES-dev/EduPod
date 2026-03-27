import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { SettingsService } from '../configuration/settings.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AiReportNarratorService {
  private readonly logger = new Logger(AiReportNarratorService.name);
  private readonly CACHE_TTL = 3600; // 1 hour
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private anthropic: { messages: { create: (params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }> } } | null = null;

  constructor(
    private readonly settingsService: SettingsService,
    private readonly redis: RedisService,
  ) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const AnthropicSdk = require('@anthropic-ai/sdk').default;
        this.anthropic = new AnthropicSdk({ apiKey });
      } catch {
        this.logger.warn(
          '@anthropic-ai/sdk is not installed — AI report narration will be unavailable',
        );
      }
    } else {
      this.logger.warn(
        'ANTHROPIC_API_KEY is not set — AI report narration will be unavailable',
      );
    }
  }

  async generateNarrative(
    tenantId: string,
    data: Record<string, unknown>,
    reportType: string,
  ): Promise<string> {
    if (!this.anthropic) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message: 'AI narration is not configured. ANTHROPIC_API_KEY is not set.',
        },
      });
    }

    const settings = await this.settingsService.getSettings(tenantId);
    if (!settings.ai.reportNarrationEnabled) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_FEATURE_DISABLED',
          message: 'This feature requires opt-in. Enable it in Settings > AI Features.',
        },
      });
    }

    // TODO: Route through GDPR gateway when userId is available in method signature
    // generateNarrative currently has no userId param — gateway call deferred

    // Cache key based on report type + data hash
    const cacheKey = `ai_narrative:${reportType}:${this.hashData(data)}`;
    const client = this.redis.getClient();

    const cached = await client.get(cacheKey);
    if (cached) return cached;

    const prompt = this.buildNarrativePrompt(data, reportType);

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content.find((c) => c.type === 'text');
    const narrative = content?.text ?? 'No narrative generated.';

    await client.setex(cacheKey, this.CACHE_TTL, narrative);

    return narrative;
  }

  private buildNarrativePrompt(data: Record<string, unknown>, reportType: string): string {
    const dataStr = JSON.stringify(data, null, 2);

    switch (reportType) {
      case 'attendance':
        return `You are a school analytics assistant. Based on the following attendance data, write a 3-5 sentence plain-language narrative summary for school administrators. Focus on key findings, trends, and any concerns.\n\nData:\n${dataStr}\n\nWrite only the narrative, no headers or bullet points.`;

      case 'grades':
        return `You are a school analytics assistant. Based on the following grade analytics data, write a 3-5 sentence plain-language narrative summary. Highlight performance trends, subject challenges, and notable achievements.\n\nData:\n${dataStr}\n\nWrite only the narrative.`;

      case 'board_report':
        return `You are a school executive assistant. Based on the following KPI snapshot, write a concise executive summary (4-6 sentences) suitable for a school board report. Cover enrolment, academic performance, financial health, and any areas of concern.\n\nData:\n${dataStr}\n\nWrite only the executive summary.`;

      case 'admissions':
        return `You are a school analytics assistant. Based on the following admissions funnel data, write a 3-5 sentence summary highlighting application volumes, conversion rates, and pipeline health.\n\nData:\n${dataStr}\n\nWrite only the narrative.`;

      case 'demographics':
        return `You are a school analytics assistant. Based on the following student demographics data, write a 3-5 sentence summary covering the school's student population composition and any notable patterns.\n\nData:\n${dataStr}\n\nWrite only the narrative.`;

      default:
        return `You are a school analytics assistant. Based on the following report data, write a 3-5 sentence plain-language narrative summary for school administrators.\n\nReport type: ${reportType}\n\nData:\n${dataStr}\n\nWrite only the narrative.`;
    }
  }

  private hashData(data: Record<string, unknown>): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < Math.min(str.length, 200); i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }
}
