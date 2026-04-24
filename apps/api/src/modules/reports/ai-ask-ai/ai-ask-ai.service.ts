import { createHash } from 'crypto';

import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';

import {
  ASK_AI_CACHE_TTL_SECONDS,
  ASK_AI_ERROR_CODES,
  ASK_AI_PROMPT_VERSION,
  ASK_AI_RATE_LIMIT_PER_HOUR,
  ASK_AI_RATE_LIMIT_WINDOW_SECONDS,
} from '@school/shared/reports';
import type { AskAiHistoryEntry, AskAiTranslationResult } from '@school/shared/reports';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AnthropicClientService } from '../../ai/anthropic-client.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { ReportsSubjectRegistryService } from '../subject-registry/reports-subject-registry.service';

import { buildPrompt } from './prompts/build-prompt';
import { validateAiResponse } from './translators/query-validator';

const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_MAX_TOKENS = 1500;

interface AnthropicTextBlock {
  type: string;
  text?: string;
}

interface AnthropicMessage {
  content: AnthropicTextBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Translate natural-language report questions into the builder's
 * `SavedReportQuery` shape. The service is a thin orchestrator over
 * four collaborators:
 *
 *   - `ReportsSubjectRegistryService` — produces the permission-scoped
 *     catalogue that becomes part of the system prompt.
 *   - `AnthropicClientService` — wraps the Claude API behind a circuit
 *     breaker; this service does not own the SDK.
 *   - `RedisService` — 24-hour cache (per question + permissions)
 *     and per-user rate limiting (20 calls / hour).
 *   - `PrismaService` (RLS-scoped) — `ai_ask_ai_history` audit log,
 *     `ai_processing_logs` cost / prompt audit row.
 *
 * The service NEVER executes the proposed query. The caller is
 * responsible for piping the returned `query` through the query engine
 * (typically `POST /v1/reports/builder/preview`).
 */
@Injectable()
export class AiAskAiService {
  private readonly logger = new Logger(AiAskAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly anthropic: AnthropicClientService,
    private readonly subjectRegistry: ReportsSubjectRegistryService,
  ) {}

  // ─── Public surface ───────────────────────────────────────────────────────

  async translate(
    tenantId: string,
    userId: string,
    permissions: readonly string[],
    queryText: string,
  ): Promise<AskAiTranslationResult> {
    if (!this.anthropic.isConfigured) {
      throw new ServiceUnavailableException({
        code: ASK_AI_ERROR_CODES.AI_UNAVAILABLE,
        message: 'AI is not configured for this environment.',
      });
    }

    // Rate limit BEFORE the cache check so a misbehaving client cannot
    // probe the cache N times/sec without consuming budget.
    await this.enforceRateLimit(userId);

    const permissionsHash = this.hashPermissions(permissions);
    const cacheKey = this.buildCacheKey(tenantId, userId, queryText, permissionsHash);

    const cached = await this.readCache(cacheKey);
    if (cached) {
      this.logger.debug(`ask-ai cache hit for tenant=${tenantId} user=${userId}`);
      return { ...cached, cache_hit: true };
    }

    const subjects = this.subjectRegistry.getAllSubjects([...permissions]);
    if (subjects.length === 0) {
      const empty: AskAiTranslationResult = {
        query: null,
        rationale: '',
        confidence: 'low',
        warnings: ['No report subjects are visible in your permission set.'],
        cache_hit: false,
      };
      await this.persistHistory(tenantId, userId, queryText, empty);
      return empty;
    }

    const { systemPrompt, userPrompt } = buildPrompt(subjects, queryText);

    let rawResponse = '';
    let costEstimate: number | undefined;
    try {
      const response = (await this.anthropic.createMessage({
        model: ANTHROPIC_MODEL,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })) as AnthropicMessage;
      rawResponse = this.extractText(response);
      costEstimate = this.estimateCost(response);
    } catch (err) {
      this.logger.warn(
        `ask-ai upstream failure: ${(err as Error).message ?? 'unknown'}`,
      );
      const failure: AskAiTranslationResult = {
        query: null,
        rationale: '',
        confidence: 'low',
        warnings: [
          'The AI service failed to respond. Please try again — if it persists, check the AI service status.',
        ],
        cache_hit: false,
      };
      await this.persistHistory(tenantId, userId, queryText, failure);
      return failure;
    }

    const validation = validateAiResponse(rawResponse, subjects);
    const result: AskAiTranslationResult = { ...validation, cache_hit: false };

    await this.persistHistory(tenantId, userId, queryText, result);
    await this.writeCache(cacheKey, result);
    await this.writeAiLog(tenantId, userId, queryText, rawResponse, costEstimate);

    return result;
  }

  async getHistory(
    tenantId: string,
    userId: string,
    limit = 20,
  ): Promise<AskAiHistoryEntry[]> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    const rows = await rls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaClient;
      return txClient.aiAskAiHistory.findMany({
        where: { tenant_id: tenantId, user_id: userId },
        orderBy: { created_at: 'desc' },
        take: Math.max(1, Math.min(limit, 100)),
        select: {
          id: true,
          query_text: true,
          result_json: true,
          was_saved: true,
          created_at: true,
        },
      });
    });

    return rows.map((row) => ({
      id: row.id,
      query_text: row.query_text,
      result_json: row.result_json as AskAiHistoryEntry['result_json'],
      was_saved: row.was_saved,
      created_at: row.created_at.toISOString(),
    }));
  }

  /**
   * Mark a history row as the source of a saved report. Returns
   * `true` if the row was updated, `false` if no row existed for the
   * (tenant, user) pair.
   */
  async markHistoryAsSaved(
    tenantId: string,
    userId: string,
    historyId: string,
  ): Promise<boolean> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    return rls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaClient;
      const result = await txClient.aiAskAiHistory.updateMany({
        where: { id: historyId, tenant_id: tenantId, user_id: userId },
        data: { was_saved: true },
      });
      return result.count > 0;
    });
  }

  // ─── Rate limiting ────────────────────────────────────────────────────────

  /**
   * Increment the per-user counter and throw 429 once the cap is
   * crossed. Sliding window: after 1 hour with no calls the counter
   * resets to zero (Redis key TTL).
   */
  private async enforceRateLimit(userId: string): Promise<void> {
    const key = `ai_ask_ai_rl:${userId}`;
    const client = this.redis.getClient();
    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, ASK_AI_RATE_LIMIT_WINDOW_SECONDS);
    }
    if (count > ASK_AI_RATE_LIMIT_PER_HOUR) {
      throw new HttpException(
        {
          code: ASK_AI_ERROR_CODES.RATE_LIMITED,
          message: `Ask-AI rate limit exceeded. Maximum ${ASK_AI_RATE_LIMIT_PER_HOUR} calls per hour per user.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // ─── Cache ────────────────────────────────────────────────────────────────

  private buildCacheKey(
    tenantId: string,
    userId: string,
    queryText: string,
    permissionsHash: string,
  ): string {
    const queryHash = createHash('sha256')
      .update(`${queryText}|${ASK_AI_PROMPT_VERSION}|${permissionsHash}`)
      .digest('hex')
      .slice(0, 32);
    return `ai_ask_ai:${tenantId}:${userId}:${queryHash}`;
  }

  private hashPermissions(permissions: readonly string[]): string {
    return createHash('sha256')
      .update([...permissions].sort().join('|'))
      .digest('hex')
      .slice(0, 16);
  }

  private async readCache(key: string): Promise<AskAiTranslationResult | null> {
    try {
      const raw = await this.redis.getClient().get(key);
      if (!raw) return null;
      return JSON.parse(raw) as AskAiTranslationResult;
    } catch (err) {
      this.logger.warn(`ask-ai cache read failed: ${(err as Error).message}`);
      return null;
    }
  }

  private async writeCache(key: string, value: AskAiTranslationResult): Promise<void> {
    try {
      await this.redis.getClient().setex(key, ASK_AI_CACHE_TTL_SECONDS, JSON.stringify(value));
    } catch (err) {
      this.logger.warn(`ask-ai cache write failed: ${(err as Error).message}`);
    }
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  private async persistHistory(
    tenantId: string,
    userId: string,
    queryText: string,
    result: AskAiTranslationResult,
  ): Promise<void> {
    try {
      const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
      const resultJson: Prisma.InputJsonValue = {
        query: result.query as Prisma.InputJsonValue,
        rationale: result.rationale,
        confidence: result.confidence,
        warnings: result.warnings,
      };
      await rls.$transaction(async (tx) => {
        const txClient = tx as unknown as PrismaClient;
        await txClient.aiAskAiHistory.create({
          data: {
            tenant_id: tenantId,
            user_id: userId,
            query_text: queryText,
            result_json: resultJson,
          },
        });
      });
    } catch (err) {
      this.logger.warn(`ask-ai history persistence failed: ${(err as Error).message}`);
    }
  }

  private async writeAiLog(
    tenantId: string,
    userId: string,
    inputText: string,
    outputText: string,
    costEstimate: number | undefined,
  ): Promise<void> {
    try {
      const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
      await rls.$transaction(async (tx) => {
        const txClient = tx as unknown as PrismaClient;
        await txClient.aiProcessingLog.create({
          data: {
            tenant_id: tenantId,
            ai_service: 'reports_ask_ai',
            subject_type: 'ask_ai_query',
            subject_id: null,
            model_used: ANTHROPIC_MODEL,
            prompt_hash: createHash('sha256').update(inputText).digest('hex'),
            prompt_summary: inputText.slice(0, 200),
            response_summary: outputText.slice(0, 500),
            input_data_categories: ['report_query'],
            tokenised: false,
            cost_usd_estimate: costEstimate ?? null,
          },
        });
      });
    } catch (err) {
      this.logger.warn(`ask-ai audit log failed: ${(err as Error).message}`);
    }
  }

  // ─── Anthropic response helpers ──────────────────────────────────────────

  private extractText(response: AnthropicMessage): string {
    const textBlock = response.content.find((c) => c.type === 'text');
    return textBlock?.text?.trim() ?? '';
  }

  /**
   * Rough cost estimate for `ai_processing_logs.cost_usd_estimate`.
   * Pricing follows the Sonnet 4.6 schedule: $3 / M input tokens, $15
   * / M output. The service does not block on this — a missing
   * estimate is fine.
   */
  private estimateCost(response: AnthropicMessage): number | undefined {
    const inputTokens = response.usage?.input_tokens;
    const outputTokens = response.usage?.output_tokens;
    if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
      return undefined;
    }
    const inputCost = (inputTokens / 1_000_000) * 3;
    const outputCost = (outputTokens / 1_000_000) * 15;
    return inputCost + outputCost;
  }
}
