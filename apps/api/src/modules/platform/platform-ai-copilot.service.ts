import Anthropic from '@anthropic-ai/sdk';
import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PlatformAiConversationType, Prisma } from '@prisma/client';

import type { PlatformCopilotEvidenceContext, PlatformAiConversationTypeDto } from '@school/shared';

import { AnthropicClientService } from '../ai/anthropic-client.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { CopilotInjectionScanner } from './copilot-injection-scanner';
import { CopilotPromptBuilderService } from './copilot-prompt-builder.service';
import { CopilotResponsePostProcessor } from './copilot-response-post-processor';
import { PlatformAiCostGuardService } from './platform-ai-cost-guard.service';
import type { EvidenceBundle, EvidenceItem } from './platform-evidence.service';
import { PlatformEvidenceService } from './platform-evidence.service';
import { COPILOT_SYSTEM_PROMPT } from './prompts/copilot-system-prompt';

const DEFAULT_REFUSAL = "I don't have enough evidence to answer that.";

@Injectable()
export class PlatformAiCopilotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: PlatformEvidenceService,
    private readonly anthropic: AnthropicClientService,
    private readonly promptBuilder: CopilotPromptBuilderService,
    private readonly postProcessor: CopilotResponsePostProcessor,
    private readonly costGuard: PlatformAiCostGuardService,
    private readonly injectionScanner: CopilotInjectionScanner,
    private readonly platformAudit: PlatformAuditService,
  ) {}

  async startConversation(input: {
    context?: PlatformCopilotEvidenceContext;
    type: PlatformAiConversationTypeDto;
    user_id: string;
  }) {
    const conversation = await this.prisma.platformAiConversation.create({
      data: {
        conversation_type: input.type as PlatformAiConversationType,
        created_by_user_id: input.user_id,
        title: input.context ? titleFromContext(input.context) : null,
      },
    });
    await this.prisma.platformAiMessage.create({
      data: {
        conversation_id: conversation.id,
        role: 'system',
        content: COPILOT_SYSTEM_PROMPT,
        evidence: [],
        citations: [],
      },
    });
    return conversation;
  }

  async sendMessage(input: {
    content: string;
    context?: PlatformCopilotEvidenceContext;
    conversation_id: string;
    user_id: string;
  }) {
    const conversation = await this.getOwnedConversation(input.conversation_id, input.user_id);
    await this.costGuard.assertCanSpend(conversation.id);
    const history = await this.prisma.platformAiMessage.findMany({
      where: { conversation_id: conversation.id },
      orderBy: { created_at: 'asc' },
      take: 30,
    });

    const evidence = await this.buildEvidence(input.context);
    const injectionScan = await this.injectionScanner.scan(evidence.items);
    await this.prisma.platformAiMessage.create({
      data: {
        conversation_id: conversation.id,
        role: 'operator',
        content: input.content,
        evidence: toJson(evidence.items),
        citations: [],
        prompt_injection_attempts: injectionScan.attempts,
      },
    });

    if (evidence.items.length === 0) {
      return this.persistAssistantResponse({
        conversationId: conversation.id,
        evidence,
        promptInjectionAttempts: injectionScan.attempts,
        rawContent: DEFAULT_REFUSAL,
        tokensCached: 0,
        tokensInput: 0,
        tokensOutput: 0,
      });
    }

    if (!this.anthropic.isPlatformConfigured) {
      throw new ServiceUnavailableException({
        code: 'COPILOT_AI_UNAVAILABLE',
        message: 'Platform Copilot AI is not configured.',
      });
    }

    const request = this.promptBuilder.build({
      conversation,
      evidence,
      history,
      question: input.content,
    });
    const response = await this.anthropic.createPlatformMessage(request, { timeoutMs: 45_000 });
    const usage = usageFromMessage(response);
    return this.persistAssistantResponse({
      conversationId: conversation.id,
      evidence,
      promptInjectionAttempts: injectionScan.attempts,
      rawContent: textFromMessage(response),
      tokensCached: usage.cached,
      tokensInput: usage.input,
      tokensOutput: usage.output,
    });
  }

  async listConversations(userId: string, operatorId?: string) {
    const targetUserId = operatorId ?? userId;
    if (targetUserId !== userId) {
      await this.assertPlatformOwner(userId);
    }

    return this.prisma.platformAiConversation.findMany({
      where: { created_by_user_id: targetUserId },
      orderBy: { last_message_at: 'desc' },
      take: 30,
    });
  }

  async getConversation(conversationId: string, userId: string) {
    return this.getReadableConversation(conversationId, userId, true);
  }

  private async getOwnedConversation(
    conversationId: string,
    userId: string,
    includeMessages = false,
  ) {
    const conversation = await this.prisma.platformAiConversation.findFirst({
      where: { id: conversationId, created_by_user_id: userId },
      include: includeMessages ? { messages: { orderBy: { created_at: 'asc' } } } : undefined,
    });
    if (!conversation) {
      throw new NotFoundException({
        code: 'COPILOT_CONVERSATION_NOT_FOUND',
        message: 'Copilot conversation not found.',
      });
    }
    return conversation;
  }

  private async getReadableConversation(
    conversationId: string,
    userId: string,
    includeMessages = false,
  ) {
    const conversation = await this.prisma.platformAiConversation.findFirst({
      where: {
        id: conversationId,
        ...((await this.isPlatformOwner(userId)) ? {} : { created_by_user_id: userId }),
      },
      include: includeMessages ? { messages: { orderBy: { created_at: 'asc' } } } : undefined,
    });
    if (!conversation) {
      throw new NotFoundException({
        code: 'COPILOT_CONVERSATION_NOT_FOUND',
        message: 'Copilot conversation not found.',
      });
    }
    if (conversation.created_by_user_id !== userId) {
      await this.platformAudit.log({
        actor_user_id: userId,
        action: 'ai_conversation_viewed',
        target_resource_type: 'platform_ai_conversation',
        target_resource_id: conversation.id,
        payload: {
          extra: {
            conversation_owner_user_id: conversation.created_by_user_id,
          },
        },
        reason: 'Platform owner viewed another operator Copilot conversation.',
      });
    }
    return conversation;
  }

  private async assertPlatformOwner(userId: string): Promise<void> {
    if (await this.isPlatformOwner(userId)) return;
    throw new NotFoundException({
      code: 'COPILOT_CONVERSATION_NOT_FOUND',
      message: 'Copilot conversation not found.',
    });
  }

  private async isPlatformOwner(userId: string): Promise<boolean> {
    const platformUser = await this.prisma.platformUser.findFirst({
      where: { user_id: userId, revoked_at: null },
      select: {
        roles: {
          select: {
            role: { select: { role_key: true } },
          },
        },
      },
    });
    return platformUser?.roles.some((role) => role.role.role_key === 'platform_owner') ?? false;
  }

  private async buildEvidence(context?: PlatformCopilotEvidenceContext): Promise<EvidenceBundle> {
    const base = context
      ? await this.buildContextEvidence(context)
      : await this.evidence.forTimeWindow(new Date(Date.now() - 24 * 60 * 60 * 1000), new Date());
    const [topology, severity] = await Promise.all([
      this.evidence.topologyForEvidence(base),
      this.evidence.severityForEvidence(base),
    ]);

    return {
      items: [
        ...base.items,
        ...rowsToEvidence('topology', '/admin/service-topology', topology),
        ...rowsToEvidence('severity_policy', '/admin/severity-policies', severity),
      ],
    };
  }

  private async buildContextEvidence(context: PlatformCopilotEvidenceContext) {
    switch (context.kind) {
      case 'alert':
        return withRunbooks(
          await this.evidence.forAlert(context.id),
          rowsToEvidence(
            'runbook',
            '/admin/runbooks',
            await this.evidence.runbooksForAlert(context.id),
          ),
        );
      case 'correlation':
        return this.evidence.forCorrelationId(context.id);
      case 'deploy':
        return this.evidence.forDeploy(context.id);
      case 'error':
        return withRunbooks(
          await this.evidence.forErrorFingerprint(context.id),
          rowsToEvidence(
            'runbook',
            '/admin/runbooks',
            await this.evidence.runbooksForError(context.id),
          ),
        );
      case 'health':
        return this.evidence.forHealth(context.id === 'overall' ? undefined : context.id);
      case 'incident':
        return this.evidence.forIncident(context.id);
      case 'queue':
        return this.evidence.forQueue(context.id);
      case 'sentry_issue':
        return this.evidence.forSentryIssue(context.id);
      case 'tenant':
        return this.evidence.forTenant(context.id);
    }
  }

  private async persistAssistantResponse(input: {
    conversationId: string;
    evidence: EvidenceBundle;
    promptInjectionAttempts: number;
    rawContent: string;
    tokensCached: number;
    tokensInput: number;
    tokensOutput: number;
  }) {
    const allowedIds = input.evidence.items.map((item) => item.id);
    const processed = this.postProcessor.process(input.rawContent, allowedIds);
    const costUsd = this.costGuard.estimateCost(
      input.tokensInput,
      input.tokensOutput,
      input.tokensCached,
    );

    const message = await this.prisma.platformAiMessage.create({
      data: {
        conversation_id: input.conversationId,
        role: 'assistant',
        content: processed.stripped,
        raw_content: input.rawContent,
        evidence: toJson(input.evidence.items),
        citations: toJson(processed.citations),
        tokens_input: input.tokensInput,
        tokens_output: input.tokensOutput,
        tokens_cached: input.tokensCached,
        cost_usd: costUsd,
        stripped_claims_count: processed.stripped_claims_count,
        prompt_injection_attempts: input.promptInjectionAttempts,
      },
    });

    await this.costGuard.applySpend({
      conversationId: input.conversationId,
      costUsd,
      tokensCached: input.tokensCached,
      tokensInput: input.tokensInput,
      tokensOutput: input.tokensOutput,
    });

    return message;
  }
}

function withRunbooks(bundle: EvidenceBundle, runbooks: EvidenceItem[]): EvidenceBundle {
  return { items: [...bundle.items, ...runbooks] };
}

function rowsToEvidence(kind: string, link: string, rows: unknown[]): EvidenceItem[] {
  return rows.map((row, index) => {
    const record = isRecord(row) ? row : {};
    const id = typeof record.id === 'string' ? record.id : `${kind}-${index}`;
    const title =
      typeof record.title === 'string'
        ? record.title
        : typeof record.display_name === 'string'
          ? record.display_name
          : kind;
    const occurredAt =
      record.updated_at instanceof Date
        ? record.updated_at.toISOString()
        : record.indexed_at instanceof Date
          ? record.indexed_at.toISOString()
          : new Date().toISOString();
    return {
      kind,
      id,
      link,
      occurred_at: occurredAt,
      snippet: title,
      raw: row,
    };
  });
}

function titleFromContext(context: PlatformCopilotEvidenceContext): string {
  return `Explain ${context.kind.replace('_', ' ')}: ${context.id}`.slice(0, 200);
}

function textFromMessage(message: Anthropic.Message): string {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function usageFromMessage(message: Anthropic.Message): {
  cached: number;
  input: number;
  output: number;
} {
  return {
    cached: message.usage.cache_read_input_tokens ?? 0,
    input: message.usage.input_tokens,
    output: message.usage.output_tokens,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
