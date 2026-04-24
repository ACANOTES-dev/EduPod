import { createHash } from 'crypto';

import type Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';

import { AnthropicClientService } from '../ai/anthropic-client.service';
import { AiAuditService } from '../gdpr/ai-audit.service';
import { RedisService } from '../redis/redis.service';

import {
  buildDashboardPrompt,
  buildReportPrompt,
  buildSavedReportPrompt,
  DASHBOARD_NARRATION_PROMPT_VERSION,
  REPORT_NARRATION_PROMPT_VERSION,
  SAVED_REPORT_NARRATION_PROMPT_VERSION,
} from './ai-narration/prompts';
import { CustomReportBuilderService } from './custom-report-builder.service';
import { UnifiedDashboardService } from './unified-dashboard.service';

// ─── Public response shape ──────────────────────────────────────────────────

export interface NarrativeResponse {
  narrative: string;
  generated_at: string;
  cache_hit: boolean;
  /** Estimated USD cost — `undefined` on cache hit (no new spend). */
  cost_usd_estimate?: number;
}

// ─── Tunables ────────────────────────────────────────────────────────────────

const NARRATION_CACHE_TTL_SECONDS = 10 * 60; // 10 minutes per spec
const NARRATION_AI_SERVICE = 'reports_narrator';
const NARRATION_MODEL = 'claude-sonnet-4-6';

/**
 * Anthropic price sheet at impl-10 ship time. Source:
 * https://www.anthropic.com/pricing#api (Sonnet 4.6).
 *   - Input:  $3.00 per 1M tokens
 *   - Output: $15.00 per 1M tokens
 *
 * Bumping the model means revisiting these constants — the cost column
 * in `ai_processing_logs` is only as accurate as this table.
 */
const SONNET_PRICE_PER_M_INPUT_USD = 3;
const SONNET_PRICE_PER_M_OUTPUT_USD = 15;

const SAVED_REPORT_SAMPLE_SIZE = 10;

// ─── Service ────────────────────────────────────────────────────────────────

/**
 * `AiReportNarratorService` produces three flavours of AI-written narrative:
 *
 *   - **Dashboard** (`narrateDashboard`): a 3-sentence "what changed this
 *     week" summary over the 10-KPI dashboard payload from impl 03.
 *   - **Report** (`narrateReport`): a 1-paragraph contextual explanation
 *     of any individual domain report (attendance, grades, demographics,
 *     etc).
 *   - **Saved report** (`narrateSavedReport`): a 1-paragraph summary of
 *     the result set produced by executing a custom-builder saved report
 *     through the query engine.
 *
 * Every narration is cached for 10 minutes in Redis (key:
 * `ai_narration:<tenant>:<feature>:<sha256(data + prompt_version)>`),
 * audit-logged via `AiAuditService` (cache hits and misses both — cache
 * hits log only the cache-key reference, cache misses log the full
 * prompt summary + response summary + estimated cost), and protected by
 * `@RequiresAiFlag('reports_narration')` at the controller level. The
 * service itself does not consult the flag — the guard is the single
 * source of truth so a flag toggle takes effect immediately on the next
 * request without a service-cache to invalidate.
 *
 * On Anthropic / network failure the service throws `AI_UNAVAILABLE` —
 * never a stub narrative. The user sees the error and retries.
 */
@Injectable()
export class AiReportNarratorService {
  private readonly logger = new Logger(AiReportNarratorService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly anthropic: AnthropicClientService,
    private readonly aiAudit: AiAuditService,
    private readonly customReportBuilder: CustomReportBuilderService,
    private readonly unifiedDashboard: UnifiedDashboardService,
  ) {}

  // ─── Dashboard ────────────────────────────────────────────────────────────

  async narrateDashboard(tenantId: string, _userId: string): Promise<NarrativeResponse> {
    this.assertConfigured();

    // Fetch the live 10-KPI dashboard. Pass `refresh = false` so we ride
    // on the dashboard's own 5-min cache — the narrative refreshes when
    // the dashboard does, which is the right cadence per spec §6.1.
    const dashboard = await this.unifiedDashboard.getKpiDashboard(tenantId);

    const promptVersion = DASHBOARD_NARRATION_PROMPT_VERSION;
    const prompt = buildDashboardPrompt(dashboard);
    const cacheKey = this.cacheKey(tenantId, 'dashboard', prompt, promptVersion);

    const cached = await this.readCache(cacheKey);
    if (cached) {
      await this.auditCacheHit(tenantId, 'dashboard', cacheKey);
      return { ...cached, cache_hit: true };
    }

    const result = await this.callAndAudit({
      tenantId,
      subjectType: 'dashboard',
      subjectId: null,
      prompt,
      maxTokens: 320,
    });

    await this.writeCache(cacheKey, result);
    return result;
  }

  // ─── Single report ────────────────────────────────────────────────────────

  async narrateReport(
    tenantId: string,
    _userId: string,
    reportKey: string,
    data: unknown,
  ): Promise<NarrativeResponse> {
    this.assertConfigured();

    const promptVersion = REPORT_NARRATION_PROMPT_VERSION;
    const prompt = buildReportPrompt(reportKey, data);
    const cacheKey = this.cacheKey(
      tenantId,
      `report:${reportKey}`,
      prompt,
      promptVersion,
    );

    const cached = await this.readCache(cacheKey);
    if (cached) {
      await this.auditCacheHit(tenantId, `report:${reportKey}`, cacheKey);
      return { ...cached, cache_hit: true };
    }

    const result = await this.callAndAudit({
      tenantId,
      subjectType: 'report',
      subjectId: null,
      prompt,
      maxTokens: 420,
    });

    await this.writeCache(cacheKey, result);
    return result;
  }

  // ─── Saved (custom-builder) report ────────────────────────────────────────

  async narrateSavedReport(
    tenantId: string,
    userId: string,
    permissions: string[],
    savedReportId: string,
  ): Promise<NarrativeResponse> {
    this.assertConfigured();

    // Resolve the saved report's name (used in the prompt) and execute its
    // query through the builder service so the engine's RLS, permission,
    // row-cap, and timeout guardrails apply uniformly.
    const savedReport = await this.customReportBuilder.getSavedReport(tenantId, savedReportId);
    const execution = await this.customReportBuilder.executeReport(
      tenantId,
      userId,
      permissions,
      savedReportId,
      1,
      SAVED_REPORT_SAMPLE_SIZE,
    );

    const promptVersion = SAVED_REPORT_NARRATION_PROMPT_VERSION;
    const prompt = buildSavedReportPrompt({
      reportName: savedReport.name,
      subjectLabel: savedReport.data_source,
      columns: execution.columns,
      rowCount: execution.meta.row_count,
      sampleRows: execution.rows,
    });
    const cacheKey = this.cacheKey(
      tenantId,
      `saved:${savedReportId}`,
      prompt,
      promptVersion,
    );

    const cached = await this.readCache(cacheKey);
    if (cached) {
      await this.auditCacheHit(tenantId, `saved:${savedReportId}`, cacheKey);
      return { ...cached, cache_hit: true };
    }

    const result = await this.callAndAudit({
      tenantId,
      subjectType: 'saved_report',
      subjectId: savedReportId,
      prompt,
      maxTokens: 520,
    });

    await this.writeCache(cacheKey, result);
    return result;
  }

  // ─── Internals: cache key, Redis, Anthropic ──────────────────────────────

  private assertConfigured(): void {
    if (!this.anthropic.isConfigured) {
      // ANTHROPIC_API_KEY missing on this environment. The guard already
      // gated on the tenant's flag; if we got here the platform is
      // misconfigured. Surface the friendly user-facing error code.
      throw new ServiceUnavailableException({
        code: 'AI_UNAVAILABLE',
        message: 'AI narration is temporarily unavailable. Please try again in a moment.',
      });
    }
  }

  /**
   * Stable cache key. The hash includes the full prompt (which already
   * embeds the dashboard / report / saved-report data) plus the
   * monotonic prompt version so a prompt edit invalidates old caches.
   */
  private cacheKey(
    tenantId: string,
    feature: string,
    prompt: string,
    promptVersion: number,
  ): string {
    const dataHash = createHash('sha256')
      .update(`${prompt}::v${promptVersion}`)
      .digest('hex')
      .slice(0, 32);
    return `ai_narration:${tenantId}:${feature}:${dataHash}`;
  }

  private async readCache(key: string): Promise<NarrativeResponse | null> {
    try {
      const raw = await this.redis.getClient().get(key);
      if (!raw) return null;
      return JSON.parse(raw) as NarrativeResponse;
    } catch (err) {
      this.logger.warn(`[ai-narration] cache read failed for "${key}": ${(err as Error).message}`);
      return null;
    }
  }

  private async writeCache(key: string, payload: NarrativeResponse): Promise<void> {
    try {
      await this.redis
        .getClient()
        .setex(key, NARRATION_CACHE_TTL_SECONDS, JSON.stringify(payload));
    } catch (err) {
      this.logger.warn(`[ai-narration] cache write failed for "${key}": ${(err as Error).message}`);
    }
  }

  /**
   * Run the Anthropic call inside a try/catch and then write the audit row
   * regardless of success — auditing must not throw (handled by
   * `AiAuditService.log`). On Anthropic failure: bubble `AI_UNAVAILABLE`.
   */
  private async callAndAudit(args: {
    tenantId: string;
    subjectType: string;
    subjectId: string | null;
    prompt: string;
    maxTokens: number;
  }): Promise<NarrativeResponse> {
    const { tenantId, subjectType, subjectId, prompt, maxTokens } = args;

    let response: Anthropic.Message;
    const startedAt = Date.now();
    try {
      response = await this.anthropic.createMessage({
        model: NARRATION_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch (err) {
      this.logger.error(
        `[ai-narration] Anthropic call failed for tenant=${tenantId} subject=${subjectType}: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException({
        code: 'AI_UNAVAILABLE',
        message: 'AI narration is temporarily unavailable. Please try again in a moment.',
      });
    }
    const elapsed = Date.now() - startedAt;

    const narrative = extractText(response);
    const costUsdEstimate = estimateCost(response);
    const generatedAt = new Date().toISOString();

    // Cache-miss audit row carries the full prompt summary (truncated)
    // and the full response summary, so future retrieval can review what
    // the model actually said.
    await this.aiAudit.log({
      tenantId,
      aiService: NARRATION_AI_SERVICE,
      subjectType,
      subjectId,
      modelUsed: NARRATION_MODEL,
      promptHash: AiAuditService.hashPrompt(prompt),
      promptSummary: AiAuditService.truncate(prompt, 1000),
      responseSummary: AiAuditService.truncate(narrative, 1000),
      inputDataCategories: ['report_data'],
      tokenised: false,
      processingTimeMs: elapsed,
      costUsdEstimate,
    });

    return {
      narrative,
      generated_at: generatedAt,
      cache_hit: false,
      cost_usd_estimate: costUsdEstimate,
    };
  }

  /**
   * Cache-hit audit row — only stores the cache key reference, not the
   * full prompt/response (we already wrote those when the entry was
   * created). Keeps the audit complete without blob duplication.
   */
  private async auditCacheHit(
    tenantId: string,
    subjectType: string,
    cacheKey: string,
  ): Promise<void> {
    await this.aiAudit.log({
      tenantId,
      aiService: NARRATION_AI_SERVICE,
      subjectType,
      subjectId: null,
      modelUsed: NARRATION_MODEL,
      promptHash: '',
      promptSummary: `[cache hit] ${cacheKey}`,
      responseSummary: '[cache hit — see prior log entry for content]',
      inputDataCategories: ['report_data'],
      tokenised: false,
      processingTimeMs: 0,
      costUsdEstimate: null,
    });
  }
}

// ─── Helpers (exported for unit tests) ──────────────────────────────────────

export function extractText(response: Anthropic.Message): string {
  const textBlock = response.content.find((b) => b.type === 'text');
  if (textBlock?.type !== 'text') return '';
  return textBlock.text.trim();
}

/**
 * Estimate USD spend from input/output token counts. Returns 0 when the
 * Anthropic SDK didn't surface usage (older mocks, errors). Decimal
 * precision matches the schema column (`NUMERIC(10,6)`).
 */
export function estimateCost(response: Anthropic.Message): number {
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const inputCost = (inputTokens / 1_000_000) * SONNET_PRICE_PER_M_INPUT_USD;
  const outputCost = (outputTokens / 1_000_000) * SONNET_PRICE_PER_M_OUTPUT_USD;
  // Round to 6 decimals to fit `NUMERIC(10,6)` and avoid float drift.
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}
