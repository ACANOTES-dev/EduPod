import type Anthropic from '@anthropic-ai/sdk';
import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PlatformAiCopilotService } from './platform-ai-copilot.service';

const NOW = new Date('2026-05-17T12:00:00.000Z');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const CONVERSATION_ID = '22222222-2222-4222-8222-222222222222';

function anthropicMessage(text: string): Anthropic.Message {
  return {
    id: 'msg-1',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    model: 'claude-sonnet-4-6-20250514',
    stop_reason: 'end_turn',
    stop_sequence: null,
    container: null,
    usage: {
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 5,
      input_tokens: 100,
      output_tokens: 25,
    },
  } as Anthropic.Message;
}

function buildService(options?: { configured?: boolean; evidenceItems?: unknown[] }) {
  const conversation = {
    id: CONVERSATION_ID,
    conversation_type: 'diagnostic',
    created_at: NOW,
    created_by_user_id: USER_ID,
    is_locked: false,
    last_message_at: NOW,
    locked_reason: null,
    title: null,
    total_cost_usd: new Prisma.Decimal(0),
    total_tokens_cached: 0,
    total_tokens_input: 0,
    total_tokens_output: 0,
  };
  const prisma = {
    platformAiConversation: {
      create: jest.fn().mockResolvedValue(conversation),
      findFirst: jest.fn().mockResolvedValue(conversation),
      findMany: jest.fn().mockResolvedValue([conversation]),
    },
    platformAiMessage: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'message-1',
        created_at: NOW,
        ...data,
      })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    platformUser: {
      findFirst: jest.fn().mockResolvedValue({
        roles: [{ role: { role_key: 'platform_owner' } }],
      }),
    },
  };
  const evidenceItems = options?.evidenceItems ?? [
    {
      id: 'health-1',
      kind: 'health_snapshot',
      link: '/admin/health',
      occurred_at: NOW.toISOString(),
      raw: { status: 'degraded' },
      snippet: 'Redis degraded',
    },
  ];
  const evidence = {
    forTimeWindow: jest.fn().mockResolvedValue({ items: evidenceItems }),
    forAlert: jest.fn().mockResolvedValue({ items: evidenceItems }),
    forCorrelationId: jest.fn(),
    forDeploy: jest.fn(),
    forErrorFingerprint: jest.fn(),
    forHealth: jest.fn(),
    forQueue: jest.fn(),
    forTenant: jest.fn(),
    runbooksForAlert: jest.fn().mockResolvedValue([]),
    runbooksForError: jest.fn().mockResolvedValue([]),
    severityForEvidence: jest.fn().mockResolvedValue([]),
    topologyForEvidence: jest.fn().mockResolvedValue([]),
  };
  const anthropic = {
    get isPlatformConfigured() {
      return options?.configured ?? true;
    },
    createPlatformMessage: jest
      .fn()
      .mockResolvedValue(anthropicMessage('Redis is degraded [E:health-1]. Uncited extra.')),
  };
  const promptBuilder = {
    build: jest.fn().mockReturnValue({ messages: [], max_tokens: 1, model: 'm' }),
  };
  const postProcessor = {
    process: jest.fn((raw: string) => ({
      citations: ['health-1'],
      stripped: raw.replace(' Uncited extra.', ''),
      stripped_claims_count: 1,
    })),
  };
  const costGuard = {
    applySpend: jest.fn().mockResolvedValue(undefined),
    assertCanSpend: jest.fn().mockResolvedValue(undefined),
    estimateCost: jest.fn().mockReturnValue(0.001),
  };
  const scanner = {
    scan: jest.fn().mockResolvedValue({ attempts: 0, flaggedEvidenceIds: [] }),
  };
  const platformAudit = {
    log: jest.fn().mockResolvedValue(undefined),
  };
  return {
    anthropic,
    costGuard,
    evidence,
    platformAudit,
    prisma,
    service: new PlatformAiCopilotService(
      prisma as unknown as ConstructorParameters<typeof PlatformAiCopilotService>[0],
      evidence as unknown as ConstructorParameters<typeof PlatformAiCopilotService>[1],
      anthropic as unknown as ConstructorParameters<typeof PlatformAiCopilotService>[2],
      promptBuilder as unknown as ConstructorParameters<typeof PlatformAiCopilotService>[3],
      postProcessor as unknown as ConstructorParameters<typeof PlatformAiCopilotService>[4],
      costGuard as unknown as ConstructorParameters<typeof PlatformAiCopilotService>[5],
      scanner as unknown as ConstructorParameters<typeof PlatformAiCopilotService>[6],
      platformAudit as unknown as ConstructorParameters<typeof PlatformAiCopilotService>[7],
    ),
  };
}

describe('PlatformAiCopilotService', () => {
  afterEach(() => jest.clearAllMocks());

  it('starts a diagnostic conversation and stores the system prompt', async () => {
    const { prisma, service } = buildService();

    const result = await service.startConversation({ type: 'diagnostic', user_id: USER_ID });

    expect(result.id).toBe(CONVERSATION_ID);
    expect(prisma.platformAiMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: 'system', conversation_id: CONVERSATION_ID }),
    });
  });

  it('sends a cited assistant response and persists cost metadata', async () => {
    const { anthropic, costGuard, prisma, service } = buildService();

    const result = await service.sendMessage({
      content: 'What is broken?',
      conversation_id: CONVERSATION_ID,
      user_id: USER_ID,
    });

    expect(anthropic.createPlatformMessage).toHaveBeenCalled();
    expect(costGuard.applySpend).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: CONVERSATION_ID, tokensOutput: 25 }),
    );
    expect(prisma.platformAiMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: 'assistant',
        content: 'Redis is degraded [E:health-1].',
        stripped_claims_count: 1,
      }),
    });
    expect(result.content).toBe('Redis is degraded [E:health-1].');
  });

  it('refuses without calling Anthropic when no evidence is available', async () => {
    const { anthropic, service } = buildService({ evidenceItems: [] });

    const result = await service.sendMessage({
      content: 'What is broken?',
      conversation_id: CONVERSATION_ID,
      user_id: USER_ID,
    });

    expect(anthropic.createPlatformMessage).not.toHaveBeenCalled();
    expect(result.content).toContain("I don't have");
  });

  it('returns unavailable when the platform Anthropic key is missing', async () => {
    const { service } = buildService({ configured: false });

    await expect(
      service.sendMessage({
        content: 'What is broken?',
        conversation_id: CONVERSATION_ID,
        user_id: USER_ID,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('audit-logs platform-owner reads of another operator conversation', async () => {
    const { platformAudit, prisma, service } = buildService();
    prisma.platformAiConversation.findFirst.mockResolvedValueOnce({
      id: CONVERSATION_ID,
      conversation_type: 'diagnostic',
      created_at: NOW,
      created_by_user_id: '33333333-3333-4333-8333-333333333333',
      is_locked: false,
      last_message_at: NOW,
      locked_reason: null,
      messages: [],
      title: null,
      total_cost_usd: new Prisma.Decimal(0),
      total_tokens_cached: 0,
      total_tokens_input: 0,
      total_tokens_output: 0,
    });

    await service.getConversation(CONVERSATION_ID, USER_ID);

    expect(platformAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ai_conversation_viewed',
        actor_user_id: USER_ID,
        target_resource_id: CONVERSATION_ID,
      }),
    );
  });
});
