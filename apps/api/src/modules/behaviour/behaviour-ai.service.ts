import Anthropic from '@anthropic-ai/sdk';
import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AI_BEHAVIOUR_SYSTEM_PROMPT, anonymiseForAI } from '@school/shared';
import type {
  AIQueryHistoryResult,
  AIQueryInput,
  AIQueryResult,
  AnonymiseOptions,
  GdprOutboundData,
} from '@school/shared';

import { AiAuditService } from '../gdpr/ai-audit.service';
import { GdprTokenService } from '../gdpr/gdpr-token.service';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourAnalyticsService } from './behaviour-analytics.service';
import { BehaviourScopeService } from './behaviour-scope.service';

/** AI request timeout in milliseconds. */
const AI_TIMEOUT_MS = 15_000;

@Injectable()
export class BehaviourAIService {
  private readonly logger = new Logger(BehaviourAIService.name);
  private anthropicClient: Anthropic | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopeService: BehaviourScopeService,
    private readonly analyticsService: BehaviourAnalyticsService,
    private readonly configService: ConfigService,
    private readonly gdprTokenService: GdprTokenService,
    private readonly aiAuditService: AiAuditService,
  ) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      this.anthropicClient = new Anthropic({ apiKey });
    }
  }

  /**
   * Process a natural language analytics query through the full pipeline:
   * validate -> scope -> fetch data -> anonymise -> AI call -> de-anonymise -> audit log.
   */
  async processNLQuery(
    tenantId: string,
    userId: string,
    permissions: string[],
    input: AIQueryInput,
    settings: Record<string, unknown>,
  ): Promise<AIQueryResult> {
    // Check AI gate
    if (!settings.ai_nl_query_enabled) {
      throw new ForbiddenException({
        error: {
          code: 'AI_FEATURE_DISABLED',
          message: 'AI queries are not enabled for your school.',
        },
      });
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
      aiResponse = await this.callAI(prompt, AI_TIMEOUT_MS);
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

    // Audit log (anonymised prompt only)
    if (settings.ai_audit_logging) {
      try {
        await this.prisma.auditLog.create({
          data: {
            tenant_id: tenantId,
            actor_user_id: userId,
            action: 'ai_query',
            entity_type: 'behaviour_analytics',
            entity_id: null,
            metadata_json: {
              context: 'ai_behaviour',
              feature: 'nl_query',
              anonymised_query: input.query,
              model_used: 'claude-sonnet-4-5',
              scope: scopeLabel,
            },
          },
        });
      } catch {
        this.logger.warn('Failed to write AI audit log');
      }
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
  private async callAI(prompt: string, timeout: number): Promise<string> {
    if (!this.anthropicClient) {
      throw new Error('AI provider not configured');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await this.anthropicClient.messages.create({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 1024,
        system: AI_BEHAVIOUR_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from AI');
      }
      return textBlock.text;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get NL query history for the current user.
   */
  async getQueryHistory(
    tenantId: string,
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<AIQueryHistoryResult> {
    const auditWhere = {
      tenant_id: tenantId,
      actor_user_id: userId,
      action: 'ai_query',
      entity_type: 'behaviour_analytics',
    };

    const [total, entries] = await Promise.all([
      this.prisma.auditLog.count({ where: auditWhere }),
      this.prisma.auditLog.findMany({
        where: auditWhere,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          metadata_json: true,
          created_at: true,
        },
      }),
    ]);

    return {
      entries: entries.map((e) => ({
        id: e.id,
        query: ((e.metadata_json as Record<string, unknown>)?.anonymised_query as string) ?? '',
        result_summary: '',
        created_at: e.created_at.toISOString(),
      })),
      meta: { page, pageSize, total },
    };
  }
}
