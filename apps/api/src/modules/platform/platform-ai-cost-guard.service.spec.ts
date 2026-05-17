import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { PlatformAiCostGuardService } from './platform-ai-cost-guard.service';

function buildService(options?: {
  conversationCost?: number;
  dailyCost?: number;
  locked?: boolean;
}) {
  const prisma = {
    platformAiConversation: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'conversation-1',
        is_locked: options?.locked ?? false,
        locked_reason: null,
        total_cost_usd: new Prisma.Decimal(options?.conversationCost ?? 0),
      }),
      update: jest.fn().mockResolvedValue({
        id: 'conversation-1',
        total_cost_usd: new Prisma.Decimal(options?.conversationCost ?? 0.51),
      }),
    },
    platformAiMessage: {
      aggregate: jest.fn().mockResolvedValue({
        _sum: { cost_usd: new Prisma.Decimal(options?.dailyCost ?? 0) },
      }),
    },
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'PLATFORM_AI_CONVERSATION_CAP_USD') return 0.5;
      if (key === 'PLATFORM_AI_DAILY_CAP_USD') return 50;
      return undefined;
    }),
  };
  return {
    prisma,
    service: new PlatformAiCostGuardService(
      prisma as unknown as ConstructorParameters<typeof PlatformAiCostGuardService>[0],
      config as unknown as ConfigService,
    ),
  };
}

describe('PlatformAiCostGuardService', () => {
  afterEach(() => jest.clearAllMocks());

  it('allows spend below the conversation and daily caps', async () => {
    const { service } = buildService();

    await expect(service.assertCanSpend('conversation-1')).resolves.toBeUndefined();
  });

  it('locks the conversation when the per-conversation cap is reached', async () => {
    const { prisma, service } = buildService({ conversationCost: 0.5 });

    await expect(service.assertCanSpend('conversation-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.platformAiConversation.update).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: { is_locked: true, locked_reason: 'Conversation budget reached.' },
    });
  });

  it('blocks all conversations when the platform daily cap is reached', async () => {
    const { service } = buildService({ dailyCost: 50 });

    await expect(service.assertCanSpend('conversation-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('applies token spend and estimates cost', async () => {
    const { prisma, service } = buildService();

    const estimate = service.estimateCost(1000, 500, 100);
    await service.applySpend({
      conversationId: 'conversation-1',
      costUsd: estimate,
      tokensCached: 100,
      tokensInput: 1000,
      tokensOutput: 500,
    });

    expect(estimate).toBeGreaterThan(0);
    expect(prisma.platformAiConversation.update).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: expect.objectContaining({
        total_cost_usd: { increment: estimate },
        total_tokens_cached: { increment: 100 },
      }),
      select: { id: true, total_cost_usd: true },
    });
  });
});
