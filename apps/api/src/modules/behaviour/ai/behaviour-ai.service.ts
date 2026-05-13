import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  AI_BEHAVIOUR_SYSTEM_PROMPT,
  anonymiseForAI,
  type AnonymiseOptions,
} from '@school/shared/ai';
import type {
  AIQueryHistoryEntry,
  AIQueryHistoryResult,
  AIQueryInput,
  AIQueryResult,
} from '@school/shared/behaviour';
import type { GdprOutboundData } from '@school/shared/gdpr';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AnthropicClientService } from '../../ai/anthropic-client.service';
import { AiAuditService } from '../../gdpr/ai-audit.service';
import { GdprTokenService } from '../../gdpr/gdpr-token.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BehaviourAnalyticsService } from '../behaviour-analytics.service';
import { BehaviourScopeService } from '../behaviour-scope.service';

import { BehaviourAiRateLimiterService } from './behaviour-ai-rate-limiter.service';

/** AI request timeout in milliseconds. */
const AI_TIMEOUT_MS = 15_000;

@Injectable()
export class BehaviourAIService {
  private readonly logger = new Logger(BehaviourAIService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: BehaviourScopeService,
    private readonly analyticsService: BehaviourAnalyticsService,
    private readonly anthropicClient: AnthropicClientService,
    private readonly gdprTokenService: GdprTokenService,
    private readonly aiAuditService: AiAuditService,
    private readonly rateLimiter: BehaviourAiRateLimiterService,
  ) {}

  /**
   * Process a natural language analytics query through the full pipeline:
   * validate -> scope -> fetch data -> anonymise -> AI call -> de-anonymise -> audit log.
   */
  async processNLQuery(
    tenantId: string,
    userId: string,
    permissions: string[],
    input: AIQueryInput,
    _settings: Record<string, unknown>,
  ): Promise<AIQueryResult> {
    // Check AI availability
    if (!this.anthropicClient.isConfigured) {
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_SERVICE_UNAVAILABLE',
          message: 'AI provider not configured. ANTHROPIC_API_KEY is not set.',
        },
      });
    }

    // Rate limit per-user. The @RequiresAiFlag guard has already confirmed
    // the tenant has AI enabled for behaviour.
    const rate = this.rateLimiter.check(tenantId, userId);
    if (!rate.allowed) {
      throw new HttpException(
        {
          error: {
            code: 'AI_RATE_LIMITED',
            message: 'AI query rate limit exceeded. Try again later.',
            details: { retry_after_ms: rate.retryAfterMs },
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Resolve scope
    const scope = await this.scopeService.getUserScope(tenantId, userId, permissions);
    const scopeLabel = scope.scope === 'all' ? 'school-wide' : `${scope.scope}-scoped`;

    // Fetch relevant analytics data
    const analyticsQuery = {
      from: input.context?.fromDate,
      to: input.context?.toDate,
      yearGroupId: input.context?.yearGroupId,
      exposureNormalised: true,
    };

    const [overview, trends, categories] = await Promise.all([
      this.analyticsService.getOverview(tenantId, userId, permissions, analyticsQuery),
      this.analyticsService.getTrends(tenantId, userId, permissions, analyticsQuery),
      this.analyticsService.getCategories(tenantId, userId, permissions, analyticsQuery),
    ]);

    // Build context for AI
    const dataContext = {
      overview,
      recent_trends: trends.points.slice(-14),
      top_categories: categories.categories.slice(0, 10),
    };

    // Sanitise: strip UUIDs, context notes, SEND details, safeguarding flags.
    // Name replacement is handled by the GDPR gateway below.
    const sanitiseOptions: AnonymiseOptions = {
      replaceStudentNames: false,
      replaceStaffNames: false,
      removeUUIDs: true,
      removeContextNotes: true,
      removeSendDetails: true,
      removeSafeguardingFlags: true,
    };
    const { anonymised: sanitised } = anonymiseForAI(dataContext, sanitiseOptions);

    // GDPR gateway — aggregate analytics data contains no personal names,
    // so entity list is empty. The gateway call creates the audit trail.
    const outbound: GdprOutboundData = { entities: [], entityCount: 0 };
    const { tokenMap } = await this.gdprTokenService.processOutbound(
      tenantId,
      'ai_behaviour_query',
      outbound,
      userId,
    );

    // Build prompt
    const prompt = `Based on this school behaviour data, answer the following question:\n\n"${input.query}"\n\nData context:\n${JSON.stringify(sanitised, null, 2)}\n\nProvide a clear, concise answer suitable for school management.`;

    // Call AI
    const dataAsOf = new Date().toISOString();
    let aiResponse: string;
    const aiStartTime = Date.now();
    try {
      aiResponse = await this.callAI(tenantId, prompt, AI_TIMEOUT_MS);
    } catch (error) {
      this.logger.warn(`AI call failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException({
        error: {
          code: 'AI_UNAVAILABLE',
          message: 'AI is temporarily unavailable. Please use the standard analytics dashboard.',
        },
      });
    }
    const aiElapsed = Date.now() - aiStartTime;

    await this.aiAuditService.log({
      tenantId,
      aiService: 'ai_behaviour_query',
      subjectType: null,
      subjectId: null,
      modelUsed: 'claude-sonnet-4-5-20250514',
      promptHash: AiAuditService.hashPrompt(prompt),
      promptSummary: AiAuditService.truncate(prompt, 500),
      responseSummary: AiAuditService.truncate(aiResponse, 500),
      inputDataCategories: ['behaviour_analytics'],
      tokenised: true,
      processingTimeMs: aiElapsed,
    });

    // De-tokenise AI response via GDPR gateway
    const result = await this.gdprTokenService.processInbound(tenantId, aiResponse, tokenMap);

    // Persist the round-trip to behaviour_ai_query_history so the UI can
    // surface past queries. Best-effort — failure never blocks the response.
    try {
      const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
      await rlsClient.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        await db.behaviourAiQueryHistory.create({
          data: {
            tenant_id: tenantId,
            user_id: userId,
            question: input.query,
            answer: result,
            data_payload: dataContext as unknown as object,
          },
        });
      });
    } catch (err) {
      this.logger.warn(
        `[processNLQuery] history persist failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return {
      result,
      data_as_of: dataAsOf,
      ai_generated: true,
      scope_applied: scopeLabel,
      confidence: null,
    };
  }

  /**
   * Call AI provider with Claude primary and timeout fallback.
   */
  private async callAI(tenantId: string, prompt: string, timeout: number): Promise<string> {
    const response = await this.anthropicClient.createMessage(
      {
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 1024,
        system: AI_BEHAVIOUR_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      },
      { tenantId, timeoutMs: timeout },
    );

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response from AI');
    }
    return textBlock.text;
  }

  /**
   * Get NL query history for the current user.
   */
  async getQueryHistory(
    tenantId: string,
    userId: string,
    page: number,
    pageSize: number,
    permissions: string[] = [],
  ): Promise<AIQueryHistoryResult> {
    const canSeeAll = permissions.includes('behaviour.view_staff_analytics');
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;
      const where = canSeeAll ? { tenant_id: tenantId } : { tenant_id: tenantId, user_id: userId };

      const [total, rows] = await Promise.all([
        tx.behaviourAiQueryHistory.count({ where }),
        tx.behaviourAiQueryHistory.findMany({
          where,
          orderBy: { generated_at: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: {
            id: true,
            question: true,
            answer: true,
            data_payload: true,
            citations: true,
            generated_at: true,
          },
        }),
      ]);

      const entries: AIQueryHistoryEntry[] = rows.map((row) => ({
        id: row.id,
        query: row.question,
        result_summary: AiAuditService.truncate(row.answer, 200),
        answer: row.answer,
        data_payload: (row.data_payload as Record<string, unknown> | null) ?? null,
        citations: (row.citations as Array<Record<string, unknown>> | null) ?? null,
        created_at: row.generated_at.toISOString(),
      }));

      return {
        entries,
        meta: { page, pageSize, total },
      };
    });
  }
}
