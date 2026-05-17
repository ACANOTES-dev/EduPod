import { ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_CONVERSATION_CAP_USD = 0.5;
const DEFAULT_DAILY_CAP_USD = 50;

@Injectable()
export class PlatformAiCostGuardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async assertCanSpend(conversationId: string): Promise<void> {
    const conversation = await this.prisma.platformAiConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, is_locked: true, locked_reason: true, total_cost_usd: true },
    });

    if (!conversation) {
      throw new ForbiddenException({
        code: 'COPILOT_CONVERSATION_NOT_FOUND',
        message: 'Copilot conversation not found.',
      });
    }

    if (conversation.is_locked) {
      throw new ForbiddenException({
        code: 'COPILOT_CONVERSATION_LOCKED',
        message: conversation.locked_reason ?? 'Conversation budget has been reached.',
      });
    }

    if (Number(conversation.total_cost_usd) >= this.conversationCapUsd) {
      await this.lockConversation(conversation.id, 'Conversation budget reached.');
      throw new ForbiddenException({
        code: 'COPILOT_CONVERSATION_LOCKED',
        message: 'Conversation budget reached.',
      });
    }

    const spentToday = await this.getPlatformSpendToday();
    if (spentToday >= this.dailyCapUsd) {
      throw new ServiceUnavailableException({
        code: 'COPILOT_DAILY_BUDGET_EXCEEDED',
        message: 'The platform Copilot daily budget has been reached.',
      });
    }
  }

  async applySpend(input: {
    conversationId: string;
    costUsd: number;
    tokensCached: number;
    tokensInput: number;
    tokensOutput: number;
  }): Promise<void> {
    const updated = await this.prisma.platformAiConversation.update({
      where: { id: input.conversationId },
      data: {
        total_cost_usd: { increment: input.costUsd },
        total_tokens_cached: { increment: input.tokensCached },
        total_tokens_input: { increment: input.tokensInput },
        total_tokens_output: { increment: input.tokensOutput },
        last_message_at: new Date(),
      },
      select: { id: true, total_cost_usd: true },
    });

    if (Number(updated.total_cost_usd) >= this.conversationCapUsd) {
      await this.lockConversation(updated.id, 'Conversation budget reached.');
    }
  }

  estimateCost(inputTokens: number, outputTokens: number, cachedTokens: number): number {
    const uncachedInputCost = (Math.max(0, inputTokens - cachedTokens) / 1_000_000) * 3;
    const cachedReadCost = (cachedTokens / 1_000_000) * 0.3;
    const outputCost = (outputTokens / 1_000_000) * 15;
    return Number((uncachedInputCost + cachedReadCost + outputCost).toFixed(6));
  }

  private get conversationCapUsd(): number {
    return (
      this.configService.get<number>('PLATFORM_AI_CONVERSATION_CAP_USD') ??
      DEFAULT_CONVERSATION_CAP_USD
    );
  }

  private get dailyCapUsd(): number {
    return this.configService.get<number>('PLATFORM_AI_DAILY_CAP_USD') ?? DEFAULT_DAILY_CAP_USD;
  }

  private async getPlatformSpendToday(): Promise<number> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const result = await this.prisma.platformAiMessage.aggregate({
      where: {
        created_at: { gte: start },
        role: 'assistant',
      },
      _sum: { cost_usd: true },
    });
    return Number(result._sum.cost_usd ?? 0);
  }

  private async lockConversation(id: string, reason: string): Promise<void> {
    await this.prisma.platformAiConversation.update({
      where: { id },
      data: { is_locked: true, locked_reason: reason },
    });
  }
}
